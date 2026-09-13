import { useEffect, useState } from "react";
import { Activity } from "lucide-react";
import { getAuditLog } from "../lib/contract";
import type { AuditEntry } from "../lib/types";

interface RecentActivityProps {
  refreshToken: number;
  onSelectDebate: (id: bigint) => void;
}

const FEED_SIZE = 8;
// The contract only exposes get_audit_log(start, count) -- there is no
// "give me the length" view -- so we pull a generous page from the start
// and take the tail client-side. Fine for a project at this scale; a
// dedicated get_audit_log_count() view would be a cleaner fix but would
// change the contract's ABI, which the already-deployed instance can't
// pick up without a redeploy.
const PAGE_SIZE = 200;

const ACTION_LABEL: Record<string, string> = {
  CREATED: "opened",
  CHALLENGED: "was challenged",
  REBUTTAL: "got a rebuttal",
  RESOLVED: "was resolved",
  DRAWN: "ended in a draw",
  CANCELLED: "was cancelled",
  EXPIRED: "expired unchallenged",
  ADMIN_VOID: "was voided by an admin",
};

function describe(entry: AuditEntry): string {
  const label = ACTION_LABEL[entry.action];
  if (label) return `Debate #${entry.debate_id.toString()} ${label}`;
  return `${entry.action.replace(/^ADMIN_/, "Admin: ").toLowerCase()}`;
}

export default function RecentActivity({ refreshToken, onSelectDebate }: RecentActivityProps) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    getAuditLog(0, PAGE_SIZE)
      .then((page) => {
        if (cancelled) return;
        setEntries(page.slice(-FEED_SIZE).reverse());
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Could not load recent activity.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [refreshToken]);

  if (!loading && !error && entries.length === 0) return null;

  return (
    <div className="rounded-xl border border-agora-border bg-agora-panel p-5">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-200">
        <Activity className="h-4 w-4 text-agora-accent" />
        Recent activity
      </h3>

      {loading && <p className="text-sm text-slate-500">Loading…</p>}
      {error && <p className="text-sm text-agora-against">{error}</p>}

      <ul className="space-y-2">
        {entries.map((entry) => (
          <li key={entry.id.toString()}>
            <button
              onClick={() => entry.debate_id > 0n && onSelectDebate(entry.debate_id)}
              disabled={entry.debate_id === 0n}
              className="w-full rounded-lg px-2 py-1.5 text-left text-xs text-slate-400 transition hover:bg-agora-bg hover:text-slate-200 disabled:cursor-default disabled:hover:bg-transparent"
            >
              <span className="text-slate-300">{describe(entry)}</span>
              <span className="ml-2 text-slate-600">
                {new Date(entry.timestamp).toLocaleString()}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
