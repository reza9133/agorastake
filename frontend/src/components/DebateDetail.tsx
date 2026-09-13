import { useEffect, useState } from "react";
import { Gavel, Link as LinkIcon, ShieldCheck, Swords } from "lucide-react";
import {
  cancelDebate,
  challengeDebate,
  getDebate,
  reclaimExpired,
  resolveDebate,
  submitRebuttal,
} from "../lib/contract";
import { formatGen } from "../lib/format";
import type { Debate } from "../lib/types";

interface DebateDetailProps {
  debateId: bigint;
  connectedAddress: string | null;
  onChanged: () => void;
}

const STATUS_STYLES: Record<string, string> = {
  OPEN: "bg-amber-500/15 text-amber-300",
  ACTIVE: "bg-sky-500/15 text-sky-300",
  RESOLVED: "bg-agora-for/15 text-agora-for",
  DRAWN: "bg-slate-500/15 text-slate-300",
  VOID: "bg-slate-600/15 text-slate-400",
  CANCELLED: "bg-slate-600/15 text-slate-400",
};

function sameAddress(a: string | null | undefined, b: string | null | undefined): boolean {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase();
}

function ScoreRow({ label, proposer, challenger }: { label: string; proposer: number; challenger: number }) {
  return (
    <div className="grid grid-cols-3 items-center gap-2 text-xs">
      <span className="text-right text-agora-for">{proposer}/10</span>
      <span className="text-center text-slate-500">{label}</span>
      <span className="text-agora-against">{challenger}/10</span>
    </div>
  );
}

export default function DebateDetail({ debateId, connectedAddress, onChanged }: DebateDetailProps) {
  const [debate, setDebate] = useState<Debate | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [challengeArgument, setChallengeArgument] = useState("");
  const [challengeEvidence, setChallengeEvidence] = useState("");
  const [rebuttal, setRebuttal] = useState("");

  async function load() {
    try {
      setDebate(await getDebate(debateId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load this debate.");
    }
  }

  useEffect(() => {
    setDebate(null);
    setError(null);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debateId]);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await load();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That action was rejected by the contract.");
    } finally {
      setBusy(false);
    }
  }

  if (!debate) {
    return (
      <div className="rounded-xl border border-agora-border bg-agora-panel p-5 text-sm text-slate-500">
        {error ?? "Select a debate to see its full argument thread."}
      </div>
    );
  }

  const isProposer = sameAddress(connectedAddress, debate.proposer);
  const isChallenger = sameAddress(connectedAddress, debate.challenger);
  const canSubmitRebuttal =
    debate.status === "ACTIVE" &&
    ((isProposer && debate.proposer_rebuttal === "") ||
      (isChallenger && debate.challenger_rebuttal === ""));

  return (
    <div className="space-y-4 rounded-xl border border-agora-border bg-agora-panel p-5">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-100">{debate.resolution}</h2>
        <span className={`whitespace-nowrap rounded-full px-2 py-1 text-xs font-medium ${STATUS_STYLES[debate.status]}`}>
          {debate.status}
        </span>
      </div>

      <p className="text-xs text-slate-500">
        {debate.category} · {formatGen(debate.stake)} GEN per side · #{debate.id.toString()}
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        <Side
          title="FOR"
          color="text-agora-for"
          address={debate.proposer}
          argument={debate.proposer_argument}
          rebuttal={debate.proposer_rebuttal}
          evidenceUrl={debate.proposer_evidence_url}
        />
        <Side
          title="AGAINST"
          color="text-agora-against"
          address={debate.challenger}
          argument={debate.challenger_argument}
          rebuttal={debate.challenger_rebuttal}
          evidenceUrl={debate.challenger_evidence_url}
        />
      </div>

      {(debate.status === "RESOLVED" || debate.status === "DRAWN") && (
        <div className="rounded-lg border border-agora-border bg-agora-bg p-4">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-200">
            <ShieldCheck className="h-4 w-4 text-agora-accent" />
            GenLayer verdict
          </h3>
          <div className="space-y-1">
            <ScoreRow label="logic" proposer={debate.proposer_logic} challenger={debate.challenger_logic} />
            <ScoreRow
              label="evidence"
              proposer={debate.proposer_evidence_score}
              challenger={debate.challenger_evidence_score}
            />
            <ScoreRow label="clarity" proposer={debate.proposer_clarity} challenger={debate.challenger_clarity} />
          </div>
          <p className="mt-3 text-sm text-slate-300">{debate.verdict_summary}</p>
          <p className="mt-2 text-xs font-medium text-agora-accent">
            {debate.status === "DRAWN" ? "Declared a draw — both stakes refunded." : `Winner: ${debate.winning_side}`}
          </p>
        </div>
      )}

      {error && <p className="text-sm text-agora-against">{error}</p>}

      {/* --- status-specific actions --- */}

      {debate.status === "OPEN" && !isProposer && (
        <div className="space-y-2 rounded-lg border border-agora-border bg-agora-bg p-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-200">
            <Swords className="h-4 w-4 text-agora-against" />
            Take the AGAINST side ({formatGen(debate.stake)} GEN required)
          </h3>
          <textarea
            rows={3}
            maxLength={4000}
            value={challengeArgument}
            onChange={(e) => setChallengeArgument(e.target.value)}
            placeholder="Your opening case against the resolution..."
            className="w-full rounded-lg border border-agora-border bg-agora-panel px-3 py-2 text-sm outline-none focus:border-agora-accent"
          />
          <input
            value={challengeEvidence}
            onChange={(e) => setChallengeEvidence(e.target.value)}
            placeholder="Evidence URL (optional)"
            className="w-full rounded-lg border border-agora-border bg-agora-panel px-3 py-2 text-sm outline-none focus:border-agora-accent"
          />
          <button
            disabled={busy || !challengeArgument.trim()}
            onClick={() =>
              run(() =>
                challengeDebate({
                  debateId: debate.id,
                  argument: challengeArgument.trim(),
                  evidenceUrl: challengeEvidence.trim(),
                  rebuttalWindowSeconds: 2 * 3600,
                  stakeWei: debate.stake,
                }),
              )
            }
            className="w-full rounded-lg bg-agora-against px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
          >
            Match the stake and challenge
          </button>
        </div>
      )}

      {debate.status === "OPEN" && isProposer && (
        <div className="flex gap-2">
          <button
            disabled={busy}
            onClick={() => run(() => cancelDebate(debate.id))}
            className="flex-1 rounded-lg border border-agora-border px-4 py-2 text-sm hover:border-slate-500"
          >
            Cancel & reclaim stake
          </button>
          <button
            disabled={busy}
            onClick={() => run(() => reclaimExpired(debate.id))}
            className="flex-1 rounded-lg border border-agora-border px-4 py-2 text-sm hover:border-slate-500"
          >
            Reclaim (if window expired)
          </button>
        </div>
      )}

      {canSubmitRebuttal && (
        <div className="space-y-2 rounded-lg border border-agora-border bg-agora-bg p-4">
          <h3 className="text-sm font-semibold text-slate-200">Submit your one rebuttal</h3>
          <textarea
            rows={3}
            maxLength={2000}
            value={rebuttal}
            onChange={(e) => setRebuttal(e.target.value)}
            className="w-full rounded-lg border border-agora-border bg-agora-panel px-3 py-2 text-sm outline-none focus:border-agora-accent"
          />
          <button
            disabled={busy || !rebuttal.trim()}
            onClick={() => run(() => submitRebuttal(debate.id, rebuttal.trim()))}
            className="w-full rounded-lg bg-agora-accent px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
          >
            Submit rebuttal
          </button>
        </div>
      )}

      {debate.status === "ACTIVE" && (
        <button
          disabled={busy}
          onClick={() => run(() => resolveDebate(debate.id))}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-agora-accent px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
        >
          <Gavel className="h-4 w-4" />
          Call for a GenLayer verdict
        </button>
      )}
    </div>
  );
}

function Side({
  title,
  color,
  address,
  argument,
  rebuttal,
  evidenceUrl,
}: {
  title: string;
  color: string;
  address: string;
  argument: string;
  rebuttal: string;
  evidenceUrl: string;
}) {
  const empty = address === "0x0000000000000000000000000000000000000000";
  return (
    <div className="rounded-lg border border-agora-border bg-agora-bg p-4">
      <p className={`text-xs font-semibold uppercase tracking-wide ${color}`}>{title}</p>
      {empty ? (
        <p className="mt-2 text-sm text-slate-500">Awaiting a challenger…</p>
      ) : (
        <>
          <p className="mt-1 truncate text-xs text-slate-500">{address}</p>
          <p className="mt-2 whitespace-pre-wrap text-sm text-slate-200">{argument}</p>
          {rebuttal && (
            <p className="mt-2 whitespace-pre-wrap border-t border-agora-border pt-2 text-sm text-slate-400">
              <span className="font-semibold text-slate-300">Rebuttal: </span>
              {rebuttal}
            </p>
          )}
          {evidenceUrl && (
            <a
              href={evidenceUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-2 flex items-center gap-1 text-xs text-agora-accent hover:underline"
            >
              <LinkIcon className="h-3 w-3" />
              cited evidence
            </a>
          )}
        </>
      )}
    </div>
  );
}
