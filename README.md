# AgoraStake

**An on-chain argumentation market judged by GenLayer validator consensus.**

Two wallets stake equal amounts of GEN on opposite sides of a resolution —
*"remote work increases team productivity"*, *"Rust is a better systems
language than C++ for new embedded projects"*, whatever the community wants
to fight about. Each side writes one opening argument, may cite a single
public evidence URL, and gets exactly one rebuttal. Once both sides have
spoken, anyone can call for a verdict: GenLayer's validators independently
fetch the cited evidence, score both cases on logic, evidence quality and
clarity, and agree on a winner. The winner takes the pot, minus a small
protocol fee. A genuine toss-up is declared a draw and both stakes are
refunded in full.

**Live deployment:** [`0x35BfFc75e4661Cb05bc91468616E2A301547722B`](https://github.com/reza9133/agorastake)
on **GenLayer Studionet** — deployed with `protocol_fee_bps=250` (2.5%) and
`min_stake=5000000000000000000` (5 GEN). Source: [github.com/reza9133/agorastake](https://github.com/reza9133/agorastake) ·
Updates: [@amirhp771 on X](https://x.com/amirhp771).

> Studionet is GenLayer's hosted, zero-setup environment — convenient for a
> live demo, but its state is [documented as temporary](https://docs.genlayer.com/developers/networks#studionet),
> not a persistent chain the way the testnets are. Treat this deployment as
> a demo instance, not a production one; redeploying to `testnet-asimov` or
> `testnet-bradbury` (see [Deploying](#deploying)) needs no code changes,
> just a different `VITE_NETWORK` value.

This is GenLayer's ["argumentation and debate market"](https://docs.genlayer.com/understand-genlayer-protocol/typical-use-cases)
use case built out as a working dApp: a subjective, evidence-grounded
judgment call that no deterministic contract could make on its own, settled
by a diverse set of independent AI validators instead of a single arbiter,
a moderator, or whoever shouts loudest in the replies.

## Why this needs GenLayer, not a backend

Running through GenLayer's own [fit checklist](https://docs.genlayer.com/developers/intelligent-contracts/when-to-use-genlayer):

- **Real on-chain consequence.** A verdict moves a real stake from a loser
  to a winner (or refunds both on a draw).
- **The outcome requires judgment.** "Which argument was more logical,
  better supported, and more clearly written" is not a comparison operator.
- **The evidence is independently checkable.** Every validator fetches the
  same cited URLs and re-reads the same argument text; nobody has to trust
  a single server's summary of what the evidence said.
- **Neutral consensus matters.** Neither debater should have to trust the
  *other* debater's backend, and nobody should have to trust the
  contract's own frontend to grade fairly.
- **The result is structured.** The contract asks for a `winner` field and
  six 0-10 sub-scores, not an essay — see [*The Verdict*](#the-verdict) below.

The flip side matters too: AgoraStake does **not** try to be a court. It's
an evidence-based settlement primitive for wagers on argument quality. If
you want a legally binding ruling, you still need real lawyers, a real
jurisdiction, and a real process around this contract — this is a
first-instance, internet-speed adjudication layer, not a replacement for
one.

## How a debate moves through the contract

```
 request_debate()                 challenge_debate()            resolve_debate()
 stake locked in ────► OPEN ────► matching stake in ────► ACTIVE ────► RESOLVED
        │              │                                   │            (winner
        │              │ cancel_debate()                   │ submit_    paid, fee
        │              ▼ (pre-challenge only)               │ rebuttal()  to treasury)
        │           CANCELLED                                │           or
        │                                                     ▼         DRAWN
        │              reclaim_expired()                (one shot each   (both
        └──────────► (challenge window lapsed) ──► VOID   side, then      refunded)
                                                       resolve_debate()
                                                       waits for the
                                                       rebuttal window
                                                       to close)
```

Every transition is enforced on-chain: you can't challenge your own
debate, can't send anything but the exact matching stake, can't rebut
twice, and can't call for a verdict while the rebuttal window is still
open. `admin_void_debate` exists as a moderation circuit breaker (abusive
listings, obvious spam) but only while a debate is still `OPEN` or
`ACTIVE` — once GenLayer has rendered a verdict, the admin cannot touch it.

## The verdict

`resolve_debate` builds one prompt containing the resolution, both opening
arguments, both rebuttals, and a fetched excerpt of each side's cited
evidence page (a missing or dead link degrades to "no evidence" instead of
blocking the debate). The leader validator asks its model for exactly this
shape:

```json
{
  "winner": "proposer" | "challenger" | "draw",
  "proposer_logic": 0-10,       "challenger_logic": 0-10,
  "proposer_evidence": 0-10,    "challenger_evidence": 0-10,
  "proposer_clarity": 0-10,     "challenger_clarity": 0-10,
  "summary": "one or two sentences"
}
```

Every other validator re-runs the *same* prompt against the *same*
evidence links, independently. A validator only agrees with the leader if:

1. its own `winner` field matches the leader's **exactly**, and
2. every one of the six sub-scores is within **±2 points** of the leader's.

The free-text `summary` is stored for readability but is never compared —
two honest validators will phrase their reasoning differently even when
they agree on the substance. This is the ["partial field matching" +
"numeric tolerance" pattern](https://docs.genlayer.com/developers/intelligent-contracts/equivalence-principle#pattern-1-partial-field-matching)
GenLayer recommends: agree on the decision, don't demand identical prose.
A validator that gets a malformed response, or one that lands on a
different winner, disagrees outright rather than rubber-stamping the
leader — see `tests/test_agora_stake.py` for both cases exercised directly.

## Economics

- Both sides stake the **same** amount; a challenger who doesn't match it
  exactly is rejected before anything else runs.
- On a decisive verdict, the pot is `2 × stake`. The protocol takes
  `protocol_fee_bps / 10000` of that pot (**2.5% on the live deployment**,
  hard-capped at 20% regardless of what the admin sets); the rest goes to
  the winner.
- On a draw, both sides get their own stake back — no fee is taken on a
  draw, since nobody actually lost the argument.
- `min_stake`, `protocol_fee_bps`, and `treasury` are admin-adjustable
  within the hard cap; `paused` is an emergency switch that only blocks
  *new* debates, never in-flight ones. The live instance was deployed with
  `min_stake` set to 5 GEN.

## Project structure

```
contracts/agora_stake.py     the Intelligent Contract
tests/test_agora_stake.py    direct-mode test suite (29 tests, see below)
deploy/                      genlayer CLI deploy script
frontend/                    React + Vite + Tailwind + genlayer-js client
```

## Contract API

| Method | Type | Notes |
|---|---|---|
| `request_debate(resolution, category, argument, evidence_url, challenge_window_seconds)` | payable write | opens a debate, returns its id |
| `challenge_debate(debate_id, argument, evidence_url, rebuttal_window_seconds)` | payable write | value must exactly match the proposer's stake |
| `submit_rebuttal(debate_id, rebuttal)` | write | one shot per side, before the rebuttal deadline |
| `resolve_debate(debate_id)` | write | callable by anyone once the rebuttal window has closed |
| `cancel_debate(debate_id)` | write | proposer only, only before a challenger joins |
| `reclaim_expired(debate_id)` | write | proposer only, only after the challenge window lapses unchallenged |
| `admin_void_debate(debate_id, reason)` | write, admin | refunds and voids an `OPEN`/`ACTIVE` debate; never a settled one |
| `set_protocol_fee_bps` / `set_treasury` / `set_min_stake` / `set_paused` / `transfer_admin` | write, admin | protocol configuration |
| `get_debate(debate_id)` | view | full debate record |
| `get_open_debates(limit)` | view | ids currently awaiting a challenger |
| `get_wallet_debates(wallet)` | view | every debate a wallet has proposed or challenged |
| `get_audit_log(start, count)` | view | paginated event trail |
| `get_stats()` | view | aggregate counters and current config |

Run `genvm-lint schema contracts/agora_stake.py` for the machine-readable
version of this table.

## Running the tests

The suite uses [`genlayer-test`](https://docs.genlayer.com/api-references/genlayer-test)'s
**Direct Mode**, which runs the contract's actual Python code in-process —
no Docker, no GenVM, no network — so the whole suite finishes in well under
a second.

```bash
pip install -r requirements.txt
pytest tests/ -v
```

The first run downloads and caches the pinned GenVM release
(`v0.2.12`, matched to the `Depends` header in `agora_stake.py`) under
`~/.cache/gltest-direct/`; later runs are instant.

**A note on how the suite is structured.** The installed Direct Mode
runner registers a contract's Python class the first time its module runs
and refuses to register a second `Contract` subclass in the same process —
so instead of the usual "redeploy a fresh contract per test" pattern, this
suite deploys **one** `AgoraStake` instance in a session-scoped fixture and
gives every test a clean slate with `vm.snapshot()` / `vm.revert()`. It's a
property of the currently-installed test runner, not of the contract, and
it's exactly what snapshot/revert exists for.

Two things Direct Mode intentionally does not simulate, matching GenLayer's
own documented Studio limitations: it doesn't move real GEN between
accounts (payout correctness is verified by state, not balance deltas), and
it only runs one validator, so cross-validator disagreement is exercised
manually via `vm.run_validator()` rather than by an actual appeal round.
Both are covered explicitly in the tests that need them
(`test_validator_disagrees_when_the_winner_field_differs`,
`test_validator_disagrees_when_scores_drift_too_far`).

Static checks, if you have [`genvm-linter`](https://docs.genlayer.com/api-references/genlayer-linter)
installed:

```bash
genvm-lint check contracts/agora_stake.py       # AST safety + SDK validation
genvm-lint typecheck contracts/agora_stake.py   # pyright with the SDK preloaded
```

## Deploying

```bash
npm install -g genlayer
genlayer network studionet      # or testnet-asimov / testnet-bradbury
genlayer deploy                      # runs deploy/001_deploy_agorastake.ts
```

Or without a deploy script, straight from the CLI:

```bash
genlayer deploy --contract contracts/agora_stake.py --args 250 5000000000000000000
```

(`250` = 2.5% protocol fee in basis points, the second argument is the
minimum stake in wei — 5 GEN. These are the exact values the live instance
at `0x35BfFc75e4661Cb05bc91468616E2A301547722B` was deployed with; both
`deploy/001_deploy_agorastake.ts` and the CLI example above are kept in
sync with it.)

## Frontend

A full landing page plus a working market, in Vite + React + TypeScript +
Tailwind, using [`genlayer-js`](https://docs.genlayer.com/api-references/genlayer-js)
for every read and write. It ships pre-configured for the live deployment
above — `frontend/.env` already points `VITE_CONTRACT_ADDRESS` at
`0x35BfFc75e4661Cb05bc91468616E2A301547722B` on `studionet`:

```bash
cd frontend
npm install
npm run dev
```

To point it at a different deployment or network, edit `frontend/.env`
(see `frontend/.env.example`) — `VITE_NETWORK` accepts `localnet`,
`studionet`, `testnetAsimov`, or `testnetBradbury`.

The page is a single scroll with four sections plus the header/footer:

- **Hero** — the pitch, live on-chain stats (debates opened, verdicts
  reached, draws, GEN staked), and links out to the [source](https://github.com/reza9133/agorastake)
  and [@amirhp771 on X](https://x.com/amirhp771).
- **How it works** — the four-step lifecycle (propose & stake, challenge &
  match, one rebuttal each, GenLayer verdict) plus a short explanation of
  the scoring/tolerance mechanism from [*The Verdict*](#the-verdict).
- **Open the floor** (`#app`) — the actual market: a form to open a debate;
  a browser with an *Open* tab (awaiting a challenger), a *My debates* tab
  scoped to the connected wallet regardless of status, and a jump-to-ID
  search; a recent-activity feed built from the on-chain audit log; and a
  detail pane that adapts its available actions (challenge, rebut,
  resolve, cancel, reclaim) to the connected wallet and the debate's
  current status. All of it works read-only without a connected wallet,
  and the selected debate is kept in the URL so a refresh doesn't lose
  your place.
- **About** — what the project is, why it needs GenLayer rather than a
  backend, and the same GitHub/X links again in the footer.

`src/lib/client.ts` handles wallet connection and network selection;
`src/lib/contract.ts` is a thin, fully-typed wrapper around the contract's
methods (`requestDebate`, `challengeDebate`, `submitRebuttal`,
`resolveDebate`, and the read-only getters); `src/lib/format.ts` converts
between GEN and wei without floating point. There is deliberately no
backend service anywhere in this stack — unlike dApps that need a server
to talk to a third-party OAuth provider, AgoraStake's entire evidence
pipeline (fetching URLs, judging arguments, reaching consensus) already
runs inside the Intelligent Contract itself.

## Design notes and honest limitations

- **Anti-spam bounds, not because the idea needs limits, but because open
  text fields on a public contract always end up needing them:** a 280
  character resolution, a 4,000 character argument, a 2,000 character
  rebuttal, and a 1 hour–30 day challenge window are enforced on-chain, not
  just in the frontend.
- **The rebuttal round is symmetric and one-shot.** Neither side can drown
  the other in follow-ups, and neither side can wait to see the other's
  rebuttal before writing their own (both windows run in parallel from the
  moment the challenge is accepted).
- **`admin_void_debate` is a moderation valve, not a veto over verdicts.**
  It refunds an unsettled debate; it cannot be used to reverse, replace, or
  second-guess a result GenLayer has already reached. If you're building on
  top of this contract for anything with real legal stakes, keep the
  agreements, jurisdiction, and escalation process GenLayer's own docs ask
  every adjudication dApp to carry around a case like this.
- **Evidence fetches are best-effort by design.** A dead link, a paywall,
  or a slow server degrades to "no evidence was available" rather than
  reverting the whole resolution — the debate is still judged on the
  argument text itself.
- **`_pay()` silently no-ops on a zero-address recipient by design** — a
  debate with no challenger yet has `challenger == ZERO_ADDRESS`, and
  refund/payout paths would otherwise try to pay it. The same silent
  no-op applies to `treasury`: `set_treasury` does **not** currently guard
  against being set to the zero address, so a mistaken call there would
  swallow every future protocol fee with no error at all. The treasury is
  set to the deployer's own address at construction and stays that way
  unless an admin deliberately changes it, so this hasn't affected the
  live deployment — but if you're operating this contract, simply never
  call `set_treasury` with the zero address. (A guard was drafted and then
  reverted here specifically to keep this repository's source matching
  the bytecode already live at `0x35BfFc75e4661Cb05bc91468616E2A301547722B`
  exactly, rather than let the two drift apart — see the note below.)

## Fixed since the initial Studionet deployment

Two gaps surfaced in review after the contract above was already live.
Both were fixed **in the frontend only** — they don't touch the contract's
ABI, so they apply immediately against the already-deployed instance with
no redeploy needed:

- **The frontend now actually uses `get_wallet_debates` and
  `get_audit_log`.** Both were defined in `contract.ts` from the start but
  never called from a component. In practice that meant a debate vanished
  from the UI the moment it left `OPEN` status — `get_open_debates` only
  ever returns debates still waiting for a challenger, and once challenged
  a debate is removed from that list on-chain (`_remove_open`). There was
  no way to get back to it to submit a rebuttal or call for a verdict
  short of remembering its numeric ID. `DebateBrowser.tsx` now has a
  wallet-scoped "My debates" tab (any status, not just `OPEN`), and the
  selected debate ID is mirrored into the URL query string so a refresh —
  or a link handed to the other side of the debate — doesn't lose it.
  `RecentActivity.tsx` surfaces the audit trail globally.
- **`get_stats()` is now fully wired into `CreateDebateForm`.** The
  minimum stake shown and defaulted in the form now comes from
  `stats.min_stake` instead of a hardcoded number, so it stays correct if
  an admin calls `set_min_stake`. The form also now surfaces
  `stats.paused` as a visible banner instead of only failing at
  submission time with the contract's `"debate creation is paused"`
  error.

A `set_treasury` zero-address guard was drafted for the contract during
the same review, but deliberately **reverted** — adding it would have made
this repository's `contracts/agora_stake.py` diverge from the source that
actually produced the bytecode at
`0x35BfFc75e4661Cb05bc91468616E2A301547722B`, silently, since the
contract has no upgrade path and a source-only change there does nothing
for a contract already deployed. Keeping the repo an exact match for
what's live took priority over a cosmetic hardening; see the note in
*Design notes and honest limitations* above for the operational
mitigation instead. If this contract is redeployed fresh, re-adding that
guard is a one-line, well-understood change.

## License

MIT
