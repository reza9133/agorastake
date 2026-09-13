# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
"""
AgoraStake
==========

An on-chain argumentation market adjudicated by GenLayer validator consensus.

Two wallets stake equal amounts of GEN on opposite sides of a resolution
statement ("remote work increases productivity", "Rust is a better systems
language than C++", ...). Each side writes a one-shot argument and may
attach a single public evidence URL. Once both arguments (and the optional
rebuttal round) are in, anyone can trigger resolution: GenLayer fetches the
cited evidence, scores both sides on logic, evidence quality and clarity,
and declares a winner. The winner collects the pot, minus a small protocol
fee; a declared draw refunds both sides in full.

This is the "argumentation and debate market" primitive described in
GenLayer's use-case catalogue: a subjective, evidence-grounded judgment call
that a deterministic contract could never make on its own, resolved by a
diverse set of independent AI validators instead of a single arbiter.

Design notes
------------
* Winner selection is a *decision field* the leader proposes and validators
  either confirm or reject outright (exact match required). Component
  scores are compared with a bounded numeric tolerance, following the
  "partial field matching" + "numeric tolerance" patterns recommended for
  the Equivalence Principle. Free-form reasoning text is never compared.
* Web evidence is fetched independently by the leader and by every
  validator that re-runs the judging prompt; a fetch failure degrades to
  "no evidence" rather than aborting the whole resolution.
* This contract does not attempt to be a court. It is an evidence-based
  settlement primitive for wagers on argument quality; see the README for
  the same disclaimer GenLayer asks every adjudication dApp to carry.
"""

from genlayer import *
from dataclasses import dataclass
from datetime import datetime, timezone
import typing

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

ZERO_ADDRESS = Address("0x0000000000000000000000000000000000000000")

STATUS_OPEN = "OPEN"
STATUS_ACTIVE = "ACTIVE"
STATUS_RESOLVED = "RESOLVED"
STATUS_DRAWN = "DRAWN"
STATUS_VOID = "VOID"
STATUS_CANCELLED = "CANCELLED"

SIDE_PROPOSER = "proposer"
SIDE_CHALLENGER = "challenger"
SIDE_DRAW = "draw"

MAX_RESOLUTION_CHARS = 280
MAX_CATEGORY_CHARS = 40
MAX_ARGUMENT_CHARS = 4000
MAX_REBUTTAL_CHARS = 2000
MAX_EVIDENCE_URL_CHARS = 300
MAX_SUMMARY_CHARS = 500

MIN_CHALLENGE_WINDOW = 3600            # 1 hour
MAX_CHALLENGE_WINDOW = 30 * 24 * 3600  # 30 days
MIN_REBUTTAL_WINDOW = 1800             # 30 minutes
MAX_REBUTTAL_WINDOW = 7 * 24 * 3600    # 7 days

SCORE_TOLERANCE = 2          # +/- points (out of 10) validators may diverge by
MAX_PROTOCOL_FEE_BPS = 2000  # 20% hard ceiling, enforced regardless of admin

ERR_EXPECTED = "[EXPECTED]"  # deterministic, business-logic errors
ERR_LLM = "[LLM]"            # malformed / non-deterministic model output


def _now() -> int:
    """Deterministic transaction-time Unix timestamp."""
    return int(datetime.now(timezone.utc).timestamp())


def _now_iso() -> str:
    """Deterministic transaction-time ISO 8601 timestamp."""
    return datetime.now(timezone.utc).isoformat()


def _clamp_score(value: typing.Any) -> int:
    try:
        score = int(round(float(value)))
    except (TypeError, ValueError):
        raise gl.vm.UserError(f"{ERR_LLM} non-numeric score in verdict: {value!r}")
    return max(0, min(10, score))


@gl.evm.contract_interface
class _Payee:
    """Typed stub used only to move GEN to an EOA (see Value Transfers docs)."""

    class View:
        pass

    class Write:
        pass


@allow_storage
@dataclass
class Debate:
    id: u256
    category: str
    resolution: str

    proposer: Address
    challenger: Address
    stake: u256

    proposer_argument: str
    proposer_evidence_url: str
    proposer_rebuttal: str

    challenger_argument: str
    challenger_evidence_url: str
    challenger_rebuttal: str

    created_at: str
    challenge_deadline: u256
    rebuttal_deadline: u256

    status: str
    winner: Address
    winning_side: str

    proposer_logic: u8
    proposer_evidence_score: u8
    proposer_clarity: u8
    challenger_logic: u8
    challenger_evidence_score: u8
    challenger_clarity: u8

    verdict_summary: str
    resolved_at: str


@allow_storage
@dataclass
class AuditEntry:
    id: u256
    debate_id: u256
    actor: Address
    action: str
    detail: str
    timestamp: str


class AgoraStake(gl.Contract):
    admin: Address
    treasury: Address
    protocol_fee_bps: u32
    min_stake: u256
    paused: bool

    next_id: u256
    next_audit_id: u256
    total_resolved: u256
    total_drawn: u256
    total_volume: u256

    debates: TreeMap[str, Debate]
    open_ids: DynArray[u256]
    audit_log: DynArray[AuditEntry]

    # -----------------------------------------------------------------
    # constructor
    # -----------------------------------------------------------------

    def __init__(self, protocol_fee_bps: u32, min_stake: u256):
        if protocol_fee_bps > MAX_PROTOCOL_FEE_BPS:
            raise gl.vm.UserError(
                f"{ERR_EXPECTED} protocol_fee_bps cannot exceed {MAX_PROTOCOL_FEE_BPS}"
            )
        self.admin = gl.message.sender_address
        self.treasury = gl.message.sender_address
        self.protocol_fee_bps = protocol_fee_bps
        self.min_stake = min_stake
        self.paused = False
        self.next_id = u256(1)
        self.next_audit_id = u256(1)
        self.total_resolved = u256(0)
        self.total_drawn = u256(0)
        self.total_volume = u256(0)

    # -----------------------------------------------------------------
    # internal helpers
    # -----------------------------------------------------------------

    def _require_admin(self) -> None:
        if gl.message.sender_address != self.admin:
            raise gl.vm.UserError(f"{ERR_EXPECTED} caller is not the admin")

    def _get_debate(self, debate_id: u256) -> Debate:
        key = str(debate_id)
        if key not in self.debates:
            raise gl.vm.UserError(f"{ERR_EXPECTED} debate {debate_id} does not exist")
        return self.debates[key]

    def _check_len(self, text: str, limit: int, field: str) -> None:
        if len(text) == 0:
            raise gl.vm.UserError(f"{ERR_EXPECTED} {field} cannot be empty")
        if len(text) > limit:
            raise gl.vm.UserError(
                f"{ERR_EXPECTED} {field} exceeds {limit} characters"
            )

    def _check_evidence_url(self, url: str) -> None:
        if len(url) == 0:
            return
        if len(url) > MAX_EVIDENCE_URL_CHARS:
            raise gl.vm.UserError(
                f"{ERR_EXPECTED} evidence url exceeds {MAX_EVIDENCE_URL_CHARS} characters"
            )
        if not (url.startswith("https://") or url.startswith("http://")):
            raise gl.vm.UserError(f"{ERR_EXPECTED} evidence url must be http(s)")

    def _record(self, debate_id: u256, action: str, detail: str) -> None:
        entry = AuditEntry(
            id=self.next_audit_id,
            debate_id=debate_id,
            actor=gl.message.sender_address,
            action=action,
            detail=detail,
            timestamp=_now_iso(),
        )
        self.audit_log.append(entry)
        self.next_audit_id = u256(int(self.next_audit_id) + 1)

    def _remove_open(self, debate_id: u256) -> None:
        target = int(debate_id)
        idx = -1
        for i in range(len(self.open_ids)):
            if int(self.open_ids[i]) == target:
                idx = i
                break
        if idx == -1:
            return
        last = len(self.open_ids) - 1
        if idx != last:
            self.open_ids[idx] = self.open_ids[last]
        self.open_ids.pop()

    def _pay(self, to: Address, amount: int) -> None:
        if amount <= 0:
            return
        if to == ZERO_ADDRESS:
            return
        _Payee(to).emit_transfer(value=u256(amount))

    # -----------------------------------------------------------------
    # lifecycle: write methods
    # -----------------------------------------------------------------

    @gl.public.write.payable
    def request_debate(
        self,
        resolution: str,
        category: str,
        argument: str,
        evidence_url: str,
        challenge_window_seconds: u32,
    ) -> u256:
        if self.paused:
            raise gl.vm.UserError(f"{ERR_EXPECTED} debate creation is paused")

        stake = gl.message.value
        if stake < self.min_stake:
            raise gl.vm.UserError(
                f"{ERR_EXPECTED} stake {stake} is below the minimum of {self.min_stake}"
            )

        self._check_len(resolution, MAX_RESOLUTION_CHARS, "resolution")
        self._check_len(category, MAX_CATEGORY_CHARS, "category")
        self._check_len(argument, MAX_ARGUMENT_CHARS, "argument")
        self._check_evidence_url(evidence_url)

        window = int(challenge_window_seconds)
        if window < MIN_CHALLENGE_WINDOW or window > MAX_CHALLENGE_WINDOW:
            raise gl.vm.UserError(
                f"{ERR_EXPECTED} challenge_window_seconds must be between "
                f"{MIN_CHALLENGE_WINDOW} and {MAX_CHALLENGE_WINDOW}"
            )

        debate_id = self.next_id
        debate = Debate(
            id=debate_id,
            category=category,
            resolution=resolution,
            proposer=gl.message.sender_address,
            challenger=ZERO_ADDRESS,
            stake=stake,
            proposer_argument=argument,
            proposer_evidence_url=evidence_url,
            proposer_rebuttal="",
            challenger_argument="",
            challenger_evidence_url="",
            challenger_rebuttal="",
            created_at=_now_iso(),
            challenge_deadline=u256(_now() + window),
            rebuttal_deadline=u256(0),
            status=STATUS_OPEN,
            winner=ZERO_ADDRESS,
            winning_side="",
            proposer_logic=u8(0),
            proposer_evidence_score=u8(0),
            proposer_clarity=u8(0),
            challenger_logic=u8(0),
            challenger_evidence_score=u8(0),
            challenger_clarity=u8(0),
            verdict_summary="",
            resolved_at="",
        )
        self.debates[str(debate_id)] = debate
        self.open_ids.append(debate_id)
        self.next_id = u256(int(debate_id) + 1)
        self.total_volume = u256(int(self.total_volume) + int(stake))

        self._record(debate_id, "CREATED", f"resolution posted, stake={stake}")
        return debate_id

    @gl.public.write.payable
    def challenge_debate(
        self,
        debate_id: u256,
        argument: str,
        evidence_url: str,
        rebuttal_window_seconds: u32,
    ) -> None:
        debate = self._get_debate(debate_id)

        if debate.status != STATUS_OPEN:
            raise gl.vm.UserError(f"{ERR_EXPECTED} debate is not open for a challenger")
        if _now() > int(debate.challenge_deadline):
            raise gl.vm.UserError(f"{ERR_EXPECTED} challenge window has expired")

        sender = gl.message.sender_address
        if sender == debate.proposer:
            raise gl.vm.UserError(f"{ERR_EXPECTED} the proposer cannot self-challenge")

        if gl.message.value != debate.stake:
            raise gl.vm.UserError(
                f"{ERR_EXPECTED} stake must exactly match {debate.stake}"
            )

        self._check_len(argument, MAX_ARGUMENT_CHARS, "argument")
        self._check_evidence_url(evidence_url)

        window = int(rebuttal_window_seconds)
        if window < MIN_REBUTTAL_WINDOW or window > MAX_REBUTTAL_WINDOW:
            raise gl.vm.UserError(
                f"{ERR_EXPECTED} rebuttal_window_seconds must be between "
                f"{MIN_REBUTTAL_WINDOW} and {MAX_REBUTTAL_WINDOW}"
            )

        debate.challenger = sender
        debate.challenger_argument = argument
        debate.challenger_evidence_url = evidence_url
        debate.rebuttal_deadline = u256(_now() + window)
        debate.status = STATUS_ACTIVE

        self._remove_open(debate_id)
        self.total_volume = u256(int(self.total_volume) + int(debate.stake))

        self._record(debate_id, "CHALLENGED", f"challenger joined, stake={debate.stake}")

    @gl.public.write
    def submit_rebuttal(self, debate_id: u256, rebuttal: str) -> None:
        debate = self._get_debate(debate_id)

        if debate.status != STATUS_ACTIVE:
            raise gl.vm.UserError(f"{ERR_EXPECTED} debate has no open rebuttal round")
        if _now() > int(debate.rebuttal_deadline):
            raise gl.vm.UserError(f"{ERR_EXPECTED} rebuttal window has closed")

        self._check_len(rebuttal, MAX_REBUTTAL_CHARS, "rebuttal")

        sender = gl.message.sender_address
        if sender == debate.proposer:
            if len(debate.proposer_rebuttal) > 0:
                raise gl.vm.UserError(f"{ERR_EXPECTED} proposer already submitted a rebuttal")
            debate.proposer_rebuttal = rebuttal
        elif sender == debate.challenger:
            if len(debate.challenger_rebuttal) > 0:
                raise gl.vm.UserError(f"{ERR_EXPECTED} challenger already submitted a rebuttal")
            debate.challenger_rebuttal = rebuttal
        else:
            raise gl.vm.UserError(f"{ERR_EXPECTED} caller is not a party to this debate")

        self._record(debate_id, "REBUTTAL", f"rebuttal submitted by {sender.as_hex}")

    @gl.public.write
    def cancel_debate(self, debate_id: u256) -> None:
        debate = self._get_debate(debate_id)

        if gl.message.sender_address != debate.proposer:
            raise gl.vm.UserError(f"{ERR_EXPECTED} only the proposer may cancel")
        if debate.status != STATUS_OPEN:
            raise gl.vm.UserError(f"{ERR_EXPECTED} debate already has a challenger")

        debate.status = STATUS_CANCELLED
        self._remove_open(debate_id)
        stake = int(debate.stake)

        self._record(debate_id, "CANCELLED", "proposer withdrew before a challenge")
        self._pay(debate.proposer, stake)

    @gl.public.write
    def reclaim_expired(self, debate_id: u256) -> None:
        debate = self._get_debate(debate_id)

        if debate.status != STATUS_OPEN:
            raise gl.vm.UserError(f"{ERR_EXPECTED} debate is not awaiting a challenger")
        if _now() <= int(debate.challenge_deadline):
            raise gl.vm.UserError(f"{ERR_EXPECTED} challenge window has not expired yet")

        debate.status = STATUS_VOID
        self._remove_open(debate_id)
        stake = int(debate.stake)

        self._record(debate_id, "EXPIRED", "no challenger joined before the deadline")
        self._pay(debate.proposer, stake)

    @gl.public.write
    def resolve_debate(self, debate_id: u256) -> str:
        debate = self._get_debate(debate_id)

        if debate.status != STATUS_ACTIVE:
            raise gl.vm.UserError(f"{ERR_EXPECTED} debate is not awaiting resolution")
        if _now() <= int(debate.rebuttal_deadline):
            raise gl.vm.UserError(f"{ERR_EXPECTED} rebuttal window is still open")

        resolution = debate.resolution
        category = debate.category
        proposer_argument = debate.proposer_argument
        proposer_rebuttal = debate.proposer_rebuttal
        proposer_evidence_url = debate.proposer_evidence_url
        challenger_argument = debate.challenger_argument
        challenger_rebuttal = debate.challenger_rebuttal
        challenger_evidence_url = debate.challenger_evidence_url

        def leader_fn():
            def _fetch_excerpt(url: str) -> str:
                if len(url) == 0:
                    return "(no evidence link supplied)"
                try:
                    response = gl.nondet.web.get(url)
                    text = response.body.decode("utf-8", errors="ignore")
                    text = " ".join(text.split())
                    return text[:3000] if len(text) > 0 else "(evidence page was empty)"
                except Exception:
                    return "(evidence link could not be fetched)"

            proposer_evidence = _fetch_excerpt(proposer_evidence_url)
            challenger_evidence = _fetch_excerpt(challenger_evidence_url)

            prompt = f"""
You are an impartial debate judge on a decentralized argumentation market.
Score both sides honestly. Do not let style or length substitute for
substance; reward sound logic, specific evidence, and clear writing.

Resolution being debated: "{resolution}"
Category: {category}

--- PROPOSER (arguing FOR the resolution) ---
Opening argument:
{proposer_argument}

Rebuttal (may be empty if none was submitted):
{proposer_rebuttal if len(proposer_rebuttal) > 0 else "(no rebuttal submitted)"}

Cited evidence excerpt:
{proposer_evidence}

--- CHALLENGER (arguing AGAINST the resolution) ---
Opening argument:
{challenger_argument}

Rebuttal (may be empty if none was submitted):
{challenger_rebuttal if len(challenger_rebuttal) > 0 else "(no rebuttal submitted)"}

Cited evidence excerpt:
{challenger_evidence}

Score each side from 0 to 10 on three dimensions: logic (internal
consistency and reasoning quality), evidence (relevance and reliability of
what was cited), and clarity (how clearly the case was communicated).
Declare "draw" only if the two sides are genuinely too close to call.

Respond with ONLY this JSON object, no other text:
{{
  "winner": "proposer" | "challenger" | "draw",
  "proposer_logic": <int 0-10>,
  "proposer_evidence": <int 0-10>,
  "proposer_clarity": <int 0-10>,
  "challenger_logic": <int 0-10>,
  "challenger_evidence": <int 0-10>,
  "challenger_clarity": <int 0-10>,
  "summary": "<one or two sentence explanation, max 400 characters>"
}}
"""
            raw = gl.nondet.exec_prompt(prompt, response_format="json")
            if not isinstance(raw, dict):
                raise gl.vm.UserError(f"{ERR_LLM} verdict was not a JSON object")

            winner = raw.get("winner")
            if winner not in (SIDE_PROPOSER, SIDE_CHALLENGER, SIDE_DRAW):
                raise gl.vm.UserError(f"{ERR_LLM} invalid winner field: {winner!r}")

            summary = str(raw.get("summary", ""))[:MAX_SUMMARY_CHARS]

            return {
                "winner": winner,
                "proposer_logic": _clamp_score(raw.get("proposer_logic", 0)),
                "proposer_evidence": _clamp_score(raw.get("proposer_evidence", 0)),
                "proposer_clarity": _clamp_score(raw.get("proposer_clarity", 0)),
                "challenger_logic": _clamp_score(raw.get("challenger_logic", 0)),
                "challenger_evidence": _clamp_score(raw.get("challenger_evidence", 0)),
                "challenger_clarity": _clamp_score(raw.get("challenger_clarity", 0)),
                "summary": summary,
            }

        def validator_fn(leaders_res: gl.vm.Result) -> bool:
            if not isinstance(leaders_res, gl.vm.Return):
                # The leader hit a malformed-verdict or transient error.
                # Never rubber-stamp a failed leader run: force a rotation.
                return False

            leader_verdict = leaders_res.calldata
            my_verdict = leader_fn()

            if my_verdict["winner"] != leader_verdict["winner"]:
                return False

            for field in (
                "proposer_logic",
                "proposer_evidence",
                "proposer_clarity",
                "challenger_logic",
                "challenger_evidence",
                "challenger_clarity",
            ):
                if abs(my_verdict[field] - leader_verdict[field]) > SCORE_TOLERANCE:
                    return False

            return True

        verdict = gl.vm.run_nondet_unsafe(leader_fn, validator_fn)

        debate.proposer_logic = u8(verdict["proposer_logic"])
        debate.proposer_evidence_score = u8(verdict["proposer_evidence"])
        debate.proposer_clarity = u8(verdict["proposer_clarity"])
        debate.challenger_logic = u8(verdict["challenger_logic"])
        debate.challenger_evidence_score = u8(verdict["challenger_evidence"])
        debate.challenger_clarity = u8(verdict["challenger_clarity"])
        debate.verdict_summary = verdict["summary"]
        debate.resolved_at = _now_iso()
        debate.winning_side = verdict["winner"]

        stake = int(debate.stake)
        pot = stake * 2

        if verdict["winner"] == SIDE_DRAW:
            debate.status = STATUS_DRAWN
            self.total_drawn = u256(int(self.total_drawn) + 1)
            self._record(debate_id, "DRAWN", debate.verdict_summary)
            self._pay(debate.proposer, stake)
            self._pay(debate.challenger, stake)
        else:
            fee = (pot * int(self.protocol_fee_bps)) // 10000
            payout = pot - fee
            winner_addr = (
                debate.proposer if verdict["winner"] == SIDE_PROPOSER else debate.challenger
            )
            debate.winner = winner_addr
            debate.status = STATUS_RESOLVED
            self.total_resolved = u256(int(self.total_resolved) + 1)
            self._record(
                debate_id,
                "RESOLVED",
                f"winner={verdict['winner']} payout={payout} fee={fee}",
            )
            self._pay(winner_addr, payout)
            self._pay(self.treasury, fee)

        return verdict["winner"]

    # -----------------------------------------------------------------
    # admin
    # -----------------------------------------------------------------

    @gl.public.write
    def set_protocol_fee_bps(self, new_bps: u32) -> None:
        self._require_admin()
        if new_bps > MAX_PROTOCOL_FEE_BPS:
            raise gl.vm.UserError(
                f"{ERR_EXPECTED} protocol_fee_bps cannot exceed {MAX_PROTOCOL_FEE_BPS}"
            )
        self.protocol_fee_bps = new_bps
        self._record(u256(0), "ADMIN_FEE", f"protocol_fee_bps set to {new_bps}")

    @gl.public.write
    def set_treasury(self, new_treasury: str) -> None:
        self._require_admin()
        treasury = Address(new_treasury)
        if treasury == ZERO_ADDRESS:
            raise gl.vm.UserError(
                f"{ERR_EXPECTED} treasury cannot be the zero address"
            )
        self.treasury = treasury
        self._record(u256(0), "ADMIN_TREASURY", f"treasury set to {new_treasury}")

    @gl.public.write
    def set_min_stake(self, new_min_stake: u256) -> None:
        self._require_admin()
        self.min_stake = new_min_stake
        self._record(u256(0), "ADMIN_MIN_STAKE", f"min_stake set to {new_min_stake}")

    @gl.public.write
    def set_paused(self, paused: bool) -> None:
        self._require_admin()
        self.paused = paused
        self._record(u256(0), "ADMIN_PAUSE", f"paused set to {paused}")

    @gl.public.write
    def transfer_admin(self, new_admin: str) -> None:
        self._require_admin()
        self.admin = Address(new_admin)
        self._record(u256(0), "ADMIN_TRANSFER", f"admin transferred to {new_admin}")

    @gl.public.write
    def admin_void_debate(self, debate_id: u256, reason: str) -> None:
        """Emergency circuit breaker for abusive or unresolvable listings.

        Only usable before a verdict has been reached; refunds whoever has
        already staked. This is a moderation safety valve, not a way to
        override a GenLayer verdict once one has been rendered.
        """
        self._require_admin()
        debate = self._get_debate(debate_id)
        if debate.status not in (STATUS_OPEN, STATUS_ACTIVE):
            raise gl.vm.UserError(f"{ERR_EXPECTED} debate is already settled")

        was_open = debate.status == STATUS_OPEN
        debate.status = STATUS_VOID
        if was_open:
            self._remove_open(debate_id)

        self._record(debate_id, "ADMIN_VOID", reason)
        self._pay(debate.proposer, int(debate.stake))
        if not was_open:
            self._pay(debate.challenger, int(debate.stake))

    # -----------------------------------------------------------------
    # views
    # -----------------------------------------------------------------

    @gl.public.view
    def get_debate(self, debate_id: u256) -> typing.Any:
        return self._get_debate(debate_id)

    @gl.public.view
    def get_open_debates(self, limit: u32) -> list:
        cap = int(limit)
        result = []
        for did in self.open_ids:
            if len(result) >= cap:
                break
            result.append(did)
        return result

    @gl.public.view
    def get_wallet_debates(self, wallet: str) -> list:
        addr = Address(wallet)
        result = []
        total = int(self.next_id)
        for i in range(1, total):
            debate = self.debates[str(i)]
            if debate.proposer == addr or debate.challenger == addr:
                result.append(debate.id)
        return result

    @gl.public.view
    def get_audit_log(self, start: u32, count: u32) -> list:
        begin = int(start)
        length = len(self.audit_log)
        end = min(length, begin + int(count))
        result = []
        for i in range(begin, end):
            result.append(self.audit_log[i])
        return result

    @gl.public.view
    def get_stats(self) -> dict[str, str]:
        return {
            "total_debates": str(int(self.next_id) - 1),
            "open_debates": str(len(self.open_ids)),
            "total_resolved": str(self.total_resolved),
            "total_drawn": str(self.total_drawn),
            "total_volume": str(self.total_volume),
            "protocol_fee_bps": str(self.protocol_fee_bps),
            "min_stake": str(self.min_stake),
            "paused": str(self.paused),
            "admin": self.admin.as_hex,
            "treasury": self.treasury.as_hex,
        }
