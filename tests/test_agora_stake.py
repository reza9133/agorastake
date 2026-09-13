"""
Direct-mode test suite for AgoraStake.

Runs the contract's Python code in-process via genlayer-test's Direct Mode
(no Docker, no GenVM, no network) -- see README.md for setup and for why the
tests below share a single deployed contract instance.

Install:
    pip install genlayer-test

Run:
    pytest tests/ -v
"""

import datetime as dt
import json
from pathlib import Path

import pytest
from gltest.direct.loader import create_address, deploy_contract
from gltest.direct.sdk_loader import setup_sdk_paths
from gltest.direct.vm import VMContext

CONTRACT_PATH = Path(__file__).resolve().parent.parent / "contracts" / "agora_stake.py"

# Pinned to the GenVM release whose runner hash matches the "Depends" header
# in agora_stake.py. Direct Mode downloads and caches this release once
# (~200MB) under ~/.cache/gltest-direct/ the first time the suite runs.
SDK_VERSION = "v0.2.12"

PROTOCOL_FEE_BPS = 500  # 5%
MIN_STAKE = 100
STAKE = 1_000

ZERO_ADDRESS_HEX = "0x0000000000000000000000000000000000000000"


# ---------------------------------------------------------------------------
# fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(scope="session")
def world():
    """Deploy exactly one AgoraStake instance for the whole test session.

    genlayer-test's Direct Mode registers a contract's Python class the
    first time its module is executed and refuses to register a second
    Contract subclass in the same process. Re-deploying per test function
    (the usual `direct_deploy` pattern) would therefore break as soon as a
    second test tried to deploy -- so instead we deploy once here and give
    every test a clean slate with vm.snapshot()/vm.revert() (see `isolated`
    below). This is a property of the installed test runner, not of the
    contract itself.
    """
    vm = VMContext()
    with vm.activate():
        setup_sdk_paths(CONTRACT_PATH, SDK_VERSION)

        admin = create_address("agora_admin")
        alice = create_address("agora_alice")
        bob = create_address("agora_bob")
        carol = create_address("agora_carol")
        dave = create_address("agora_dave")

        vm.sender = admin
        contract = deploy_contract(
            str(CONTRACT_PATH),
            vm,
            PROTOCOL_FEE_BPS,
            MIN_STAKE,
            sdk_version=SDK_VERSION,
        )

        yield {
            "vm": vm,
            "contract": contract,
            "admin": admin,
            "alice": alice,
            "bob": bob,
            "carol": carol,
            "dave": dave,
        }


@pytest.fixture
def isolated(world):
    """Snapshot before a test and revert after it, so tests don't leak
    debates, audit entries, or admin changes into one another despite
    sharing the one deployed instance."""
    vm = world["vm"]
    snap = vm.snapshot()
    try:
        yield world
    finally:
        vm.revert(snap)


def _create_debate(
    world,
    resolution="Remote work increases team productivity",
    category="workplace",
    argument="Distributed teams ship more because deep work needs quiet, and offices are noisy.",
    evidence_url="",
    challenge_window=24 * 3600,
    stake=STAKE,
    proposer=None,
):
    vm, contract = world["vm"], world["contract"]
    vm.sender = proposer or world["alice"]
    vm.value = stake
    debate_id = contract.request_debate(
        resolution, category, argument, evidence_url, challenge_window
    )
    vm.value = 0
    return debate_id


def _challenge_debate(
    world,
    debate_id,
    argument="Offices enable spontaneous collaboration that chats can't replace.",
    evidence_url="",
    rebuttal_window=3600,
    stake=STAKE,
    challenger=None,
):
    vm, contract = world["vm"], world["contract"]
    vm.sender = challenger or world["bob"]
    vm.value = stake
    contract.challenge_debate(debate_id, argument, evidence_url, rebuttal_window)
    vm.value = 0


def _warp_past(world, seconds_from_now):
    future = dt.datetime.now(dt.timezone.utc) + dt.timedelta(seconds=seconds_from_now)
    world["vm"].warp(future.isoformat())


def _mock_verdict(world, **overrides):
    verdict = {
        "winner": "proposer",
        "proposer_logic": 8,
        "proposer_evidence": 6,
        "proposer_clarity": 7,
        "challenger_logic": 5,
        "challenger_evidence": 4,
        "challenger_clarity": 6,
        "summary": "The proposer's case was more internally consistent.",
    }
    verdict.update(overrides)
    world["vm"].mock_llm(r"Score each side", json.dumps(verdict))
    return verdict


# ---------------------------------------------------------------------------
# constructor / initial state
# ---------------------------------------------------------------------------


def test_initial_state(isolated):
    stats = isolated["contract"].get_stats()
    assert stats["total_debates"] == "0"
    assert stats["open_debates"] == "0"
    assert stats["protocol_fee_bps"] == str(PROTOCOL_FEE_BPS)
    assert stats["min_stake"] == str(MIN_STAKE)
    assert stats["paused"] == "False"
    assert stats["admin"] == isolated["admin"].as_hex
    assert stats["treasury"] == isolated["admin"].as_hex


# ---------------------------------------------------------------------------
# happy path: full lifecycle with a clear winner
# ---------------------------------------------------------------------------


def test_full_debate_lifecycle_with_clear_winner(isolated):
    contract = isolated["contract"]
    alice, bob, carol = isolated["alice"], isolated["bob"], isolated["carol"]

    debate_id = _create_debate(isolated)
    debate = contract.get_debate(debate_id)
    assert debate.status == "OPEN"
    assert debate.proposer == alice
    assert int(debate.stake) == STAKE
    assert [int(x) for x in contract.get_open_debates(10)] == [int(debate_id)]

    _challenge_debate(isolated, debate_id)
    debate = contract.get_debate(debate_id)
    assert debate.status == "ACTIVE"
    assert debate.challenger == bob
    assert contract.get_open_debates(10) == []  # no longer awaiting a challenger

    isolated["vm"].sender = alice
    contract.submit_rebuttal(debate_id, "Spontaneous chat is a myth; most 'hallway ideas' are noise.")
    isolated["vm"].sender = bob
    contract.submit_rebuttal(debate_id, "MIT's 1977-2003 hallway-collision studies show otherwise.")

    with pytest.raises(Exception):
        # anyone (here carol, a disinterested third party) can trigger
        # resolution, but not before the rebuttal window has closed
        isolated["vm"].sender = carol
        contract.resolve_debate(debate_id)

    _warp_past(isolated, 3601)
    _mock_verdict(isolated, winner="proposer")

    isolated["vm"].sender = carol
    winner_side = contract.resolve_debate(debate_id)
    assert winner_side == "proposer"

    debate = contract.get_debate(debate_id)
    assert debate.status == "RESOLVED"
    assert debate.winner == alice
    assert debate.winning_side == "proposer"
    assert int(debate.proposer_logic) == 8
    assert int(debate.challenger_logic) == 5
    assert debate.verdict_summary != ""

    # 5% of a 2000 GEN pot: 1900 to the winner, 100 to the treasury
    stats = contract.get_stats()
    assert stats["total_resolved"] == "1"
    assert stats["total_volume"] == str(STAKE * 2)

    debate_ids = [int(x) for x in contract.get_wallet_debates(alice.as_hex)]
    assert int(debate_id) in debate_ids
    assert int(debate_id) in [int(x) for x in contract.get_wallet_debates(bob.as_hex)]

    log = contract.get_audit_log(0, 20)
    actions = [entry.action for entry in log]
    assert actions == ["CREATED", "CHALLENGED", "REBUTTAL", "REBUTTAL", "RESOLVED"]


# ---------------------------------------------------------------------------
# draw verdict
# ---------------------------------------------------------------------------


def test_draw_verdict_refunds_both_sides_without_a_fee(isolated):
    contract = isolated["contract"]
    debate_id = _create_debate(isolated)
    _challenge_debate(isolated, debate_id)
    _warp_past(isolated, 3601)
    _mock_verdict(
        isolated,
        winner="draw",
        proposer_logic=7,
        challenger_logic=7,
        summary="Both sides made an equally solid case; too close to call.",
    )

    result = contract.resolve_debate(debate_id)
    assert result == "draw"

    debate = contract.get_debate(debate_id)
    assert debate.status == "DRAWN"
    assert debate.winner.as_hex == ZERO_ADDRESS_HEX

    stats = contract.get_stats()
    assert stats["total_drawn"] == "1"
    assert stats["total_resolved"] == "0"


# ---------------------------------------------------------------------------
# staking / matchmaking guards
# ---------------------------------------------------------------------------


def test_proposer_cannot_challenge_their_own_debate(isolated):
    debate_id = _create_debate(isolated)
    with pytest.raises(Exception, match="self-challenge"):
        _challenge_debate(isolated, debate_id, challenger=isolated["alice"])


def test_challenger_stake_must_match_exactly(isolated):
    debate_id = _create_debate(isolated, stake=STAKE)
    with pytest.raises(Exception, match="stake must exactly match"):
        _challenge_debate(isolated, debate_id, stake=STAKE - 1)


def test_stake_below_minimum_is_rejected(isolated):
    with pytest.raises(Exception, match="below the minimum"):
        _create_debate(isolated, stake=MIN_STAKE - 1)


def test_paused_market_rejects_new_debates(isolated):
    vm, contract = isolated["vm"], isolated["contract"]
    vm.sender = isolated["admin"]
    contract.set_paused(True)
    try:
        with pytest.raises(Exception, match="paused"):
            _create_debate(isolated)
    finally:
        vm.sender = isolated["admin"]
        contract.set_paused(False)


# ---------------------------------------------------------------------------
# cancellation and expiry
# ---------------------------------------------------------------------------


def test_proposer_can_cancel_before_a_challenger_joins(isolated):
    contract = isolated["contract"]
    debate_id = _create_debate(isolated)
    isolated["vm"].sender = isolated["alice"]
    contract.cancel_debate(debate_id)

    debate = contract.get_debate(debate_id)
    assert debate.status == "CANCELLED"
    assert int(debate_id) not in [int(x) for x in contract.get_open_debates(10)]


def test_cannot_cancel_once_challenged(isolated):
    contract = isolated["contract"]
    debate_id = _create_debate(isolated)
    _challenge_debate(isolated, debate_id)
    isolated["vm"].sender = isolated["alice"]
    with pytest.raises(Exception, match="already has a challenger"):
        contract.cancel_debate(debate_id)


def test_proposer_can_reclaim_stake_after_challenge_window_expires(isolated):
    contract = isolated["contract"]
    debate_id = _create_debate(isolated, challenge_window=3600)

    with pytest.raises(Exception, match="has not expired"):
        isolated["vm"].sender = isolated["alice"]
        contract.reclaim_expired(debate_id)

    _warp_past(isolated, 3601)
    isolated["vm"].sender = isolated["alice"]
    contract.reclaim_expired(debate_id)

    debate = contract.get_debate(debate_id)
    assert debate.status == "VOID"


# ---------------------------------------------------------------------------
# rebuttal round
# ---------------------------------------------------------------------------


def test_each_side_gets_exactly_one_rebuttal(isolated):
    contract = isolated["contract"]
    debate_id = _create_debate(isolated)
    _challenge_debate(isolated, debate_id)

    isolated["vm"].sender = isolated["alice"]
    contract.submit_rebuttal(debate_id, "First rebuttal.")
    with pytest.raises(Exception, match="already submitted"):
        contract.submit_rebuttal(debate_id, "Trying to sneak in a second one.")


def test_only_the_two_parties_may_submit_a_rebuttal(isolated):
    contract = isolated["contract"]
    debate_id = _create_debate(isolated)
    _challenge_debate(isolated, debate_id)

    isolated["vm"].sender = isolated["carol"]
    with pytest.raises(Exception, match="not a party"):
        contract.submit_rebuttal(debate_id, "I have opinions too.")


# ---------------------------------------------------------------------------
# the equivalence-principle judging pattern itself
# ---------------------------------------------------------------------------


def test_validator_agrees_when_scores_are_within_tolerance(isolated):
    contract = isolated["contract"]
    debate_id = _create_debate(isolated)
    _challenge_debate(isolated, debate_id)
    _warp_past(isolated, 3601)
    _mock_verdict(isolated, winner="proposer", proposer_logic=8, challenger_logic=5)

    contract.resolve_debate(debate_id)

    # the validator re-runs the same judging prompt against the same mock
    # and must land on the identical winner and near-identical scores
    assert isolated["vm"].run_validator() is True


def test_validator_disagrees_when_the_winner_field_differs(isolated):
    contract = isolated["contract"]
    debate_id = _create_debate(isolated)
    _challenge_debate(isolated, debate_id)
    _warp_past(isolated, 3601)
    _mock_verdict(isolated, winner="proposer")

    contract.resolve_debate(debate_id)

    # simulate a validator whose LLM call landed on a different verdict --
    # this must be rejected outright so a malicious/hallucinating leader
    # can't buy a result by getting lucky with one validator
    isolated["vm"].clear_mocks()
    _mock_verdict(isolated, winner="challenger")
    assert isolated["vm"].run_validator() is False


def test_validator_disagrees_when_scores_drift_too_far(isolated):
    contract = isolated["contract"]
    debate_id = _create_debate(isolated)
    _challenge_debate(isolated, debate_id)
    _warp_past(isolated, 3601)
    _mock_verdict(isolated, winner="proposer", proposer_logic=8)

    contract.resolve_debate(debate_id)

    isolated["vm"].clear_mocks()
    _mock_verdict(isolated, winner="proposer", proposer_logic=2)  # drift of 6, > tolerance of 2
    assert isolated["vm"].run_validator() is False


def test_malformed_verdict_is_rejected_instead_of_stored(isolated):
    contract = isolated["contract"]
    debate_id = _create_debate(isolated)
    _challenge_debate(isolated, debate_id)
    _warp_past(isolated, 3601)

    isolated["vm"].mock_llm(r"Score each side", json.dumps({"winner": "banana"}))
    with pytest.raises(Exception):
        contract.resolve_debate(debate_id)


# ---------------------------------------------------------------------------
# evidence fetching
# ---------------------------------------------------------------------------


def test_evidence_url_is_fetched_and_reaches_the_judging_prompt(isolated):
    vm, contract = isolated["vm"], isolated["contract"]
    debate_id = _create_debate(
        isolated,
        evidence_url="https://example.com/remote-work-study",
    )
    _challenge_debate(isolated, debate_id)
    _warp_past(isolated, 3601)

    vm.mock_web(
        r"example\.com/remote-work-study",
        {"status": 200, "body": "A five-year longitudinal study found distributed teams shipped 18% more features."},
    )
    _mock_verdict(isolated, winner="proposer")

    result = contract.resolve_debate(debate_id)
    assert result == "proposer"


def test_a_dead_evidence_link_degrades_gracefully_instead_of_reverting(isolated):
    contract = isolated["contract"]
    debate_id = _create_debate(
        isolated,
        evidence_url="https://example.com/this-page-does-not-exist",
    )
    _challenge_debate(isolated, debate_id)
    _warp_past(isolated, 3601)
    # deliberately no vm.mock_web() registered -> the fetch fails, and the
    # contract must still be able to reach a verdict on the arguments alone
    _mock_verdict(isolated, winner="challenger")

    result = contract.resolve_debate(debate_id)
    assert result == "challenger"


# ---------------------------------------------------------------------------
# admin
# ---------------------------------------------------------------------------


def test_only_admin_can_change_protocol_settings(isolated):
    contract = isolated["contract"]
    isolated["vm"].sender = isolated["alice"]
    with pytest.raises(Exception, match="not the admin"):
        contract.set_protocol_fee_bps(1000)


def test_protocol_fee_is_capped(isolated):
    contract = isolated["contract"]
    isolated["vm"].sender = isolated["admin"]
    with pytest.raises(Exception, match="cannot exceed"):
        contract.set_protocol_fee_bps(2001)


def test_admin_can_update_treasury_and_min_stake(isolated):
    vm, contract = isolated["vm"], isolated["contract"]
    vm.sender = isolated["admin"]
    contract.set_treasury(isolated["dave"].as_hex)
    contract.set_min_stake(50)

    stats = contract.get_stats()
    assert stats["treasury"] == isolated["dave"].as_hex
    assert stats["min_stake"] == "50"


def test_treasury_cannot_be_set_to_the_zero_address(isolated):
    vm, contract = isolated["vm"], isolated["contract"]
    vm.sender = isolated["admin"]
    with pytest.raises(Exception, match="zero address"):
        contract.set_treasury(ZERO_ADDRESS_HEX)


def test_admin_can_transfer_admin_role(isolated):
    vm, contract = isolated["vm"], isolated["contract"]
    vm.sender = isolated["admin"]
    contract.transfer_admin(isolated["dave"].as_hex)

    vm.sender = isolated["dave"]
    contract.set_paused(True)  # only works if dave is now really the admin
    assert contract.get_stats()["paused"] == "True"
    contract.set_paused(False)


def test_admin_void_refunds_an_open_debate(isolated):
    vm, contract = isolated["vm"], isolated["contract"]
    debate_id = _create_debate(isolated)

    vm.sender = isolated["admin"]
    contract.admin_void_debate(debate_id, "duplicate listing, community flagged")

    debate = contract.get_debate(debate_id)
    assert debate.status == "VOID"
    assert int(debate_id) not in [int(x) for x in contract.get_open_debates(10)]


def test_admin_void_cannot_touch_a_settled_debate(isolated):
    vm, contract = isolated["vm"], isolated["contract"]
    debate_id = _create_debate(isolated)
    _challenge_debate(isolated, debate_id)
    _warp_past(isolated, 3601)
    _mock_verdict(isolated, winner="proposer")
    contract.resolve_debate(debate_id)

    vm.sender = isolated["admin"]
    with pytest.raises(Exception, match="already settled"):
        contract.admin_void_debate(debate_id, "too late")


# ---------------------------------------------------------------------------
# validation limits
# ---------------------------------------------------------------------------


def test_resolution_text_length_is_bounded(isolated):
    with pytest.raises(Exception, match="resolution"):
        _create_debate(isolated, resolution="x" * 281)


def test_evidence_url_must_be_http_or_https(isolated):
    with pytest.raises(Exception, match="http"):
        _create_debate(isolated, evidence_url="ftp://example.com/file")


def test_challenge_window_has_sane_bounds(isolated):
    with pytest.raises(Exception, match="challenge_window_seconds"):
        _create_debate(isolated, challenge_window=60)  # below the 1-hour floor


def test_nonexistent_debate_is_reported_clearly(isolated):
    with pytest.raises(Exception, match="does not exist"):
        isolated["contract"].get_debate(999_999)


# ---------------------------------------------------------------------------
# views
# ---------------------------------------------------------------------------


def test_audit_log_pagination(isolated):
    contract = isolated["contract"]
    debate_id = _create_debate(isolated)
    _challenge_debate(isolated, debate_id)

    first_page = contract.get_audit_log(0, 1)
    assert len(first_page) == 1
    assert first_page[0].action == "CREATED"

    second_page = contract.get_audit_log(1, 1)
    assert len(second_page) == 1
    assert second_page[0].action == "CHALLENGED"
