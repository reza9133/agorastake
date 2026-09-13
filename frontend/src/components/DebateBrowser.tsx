import { useEffect, useState } from "react";
import { ArrowRight, Flame, RefreshCcw, UserRound } from "lucide-react";
import { getDebate, getOpenDebates, getWalletDebates } from "../lib/contract";
import { formatGen } from "../lib/format";
import type { Debate } from "../lib/types";

interface DebateBrowserProps {
  selectedId: bigint | null;
  onSelect: (id: bigint) => void;
  refreshToken: number;
  connectedAddress: string | null;
}

type Tab = "open" | "mine";

const STATUS_DOT: Record<string, string> = {
  OPEN: "bg-amber-400",
  ACTIVE: "bg-sky-400",
  RESOLVED: "bg-agora-for",
  DRAWN: "bg-slate-400",
  VOID: "bg-slate-600",
  CANCELLED: "bg-slate-600",
};

export default function DebateBrowser({
  selectedId,
  onSelect,
  refreshToken,
  connectedAddress,
}: DebateBrowserProps) {
  const [tab, setTab] = useState<Tab>("open");
  const [debates, setDebates] = useState<Debate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [jumpValue, setJumpValue] = useState("");
  const [jumpError, setJumpError] = useState<string | null>(null);
  const [jumping, setJumping] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      if (tab === "mine") {
        if (!connectedAddress) {
          setDebates([]);
          return;
        }
        const ids = await getWalletDebates(connectedAddress);
        const loaded = await Promise.all(ids.map((id) => getDebate(id)));
        loaded.sort((a, b) => Number(b.id) - Number(a.id));
        setDebates(loaded);
      } else {
        const ids = await getOpenDebates(50);
        const loaded = await Promise.all(ids.map((id) => getDebate(id)));
        loaded.sort((a, b) => Number(b.id) - Number(a.id));
        setDebates(loaded);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load debates.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, refreshToken, connectedAddress]);

  async function handleJump(event: React.FormEvent) {
    event.preventDefault();
    const raw = jumpValue.trim();
    if (!/^\d+$/.test(raw)) {
      setJumpError("Enter a numeric debate ID.");
      return;
    }
    setJumping(true);
    setJumpError(null);
    try {
      const debate = await getDebate(BigInt(raw));
      onSelect(debate.id);
      setJumpValue("");
    } catch {
      setJumpError(`No debate #${raw} found.`);
    } finally {
      setJumping(false);
    }
  }

  return (
    <div className="rounded-xl border border-agora-border bg-agora-panel p-5">
      <form onSubmit={handleJump} className="mb-4 flex gap-2">
        <input
          value={jumpValue}
          onChange={(e) => setJumpValue(e.target.value)}
          placeholder="Jump to debate #ID"
          inputMode="numeric"
          className="w-full rounded-lg border border-agora-border bg-agora-bg px-3 py-2 text-sm outline-none focus:border-agora-accent"
        />
        <button
          type="submit"
          disabled={jumping || jumpValue.trim() === ""}
          className="flex shrink-0 items-center gap-1 rounded-lg border border-agora-border px-3 py-2 text-sm text-slate-200 transition hover:border-agora-accent disabled:opacity-50"
        >
          Go <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </form>
      {jumpError && <p className="-mt-2 mb-3 text-xs text-agora-against">{jumpError}</p>}

      <div className="mb-3 flex items-center justify-between">
        <div className="flex rounded-lg border border-agora-border p-0.5 text-xs">
          <TabButton active={tab === "open"} onClick={() => setTab("open")} icon={Flame} label="Open" />
          <TabButton active={tab === "mine"} onClick={() => setTab("mine")} icon={UserRound} label="My debates" />
        </div>
        <button onClick={load} className="text-slate-400 hover:text-slate-200" title="Refresh">
          <RefreshCcw className="h-4 w-4" />
        </button>
      </div>

      {loading && <p className="text-sm text-slate-500">Loading…</p>}
      {error && <p className="text-sm text-agora-against">{error}</p>}

      {!loading && !error && tab === "mine" && !connectedAddress && (
        <p className="text-sm text-slate-500">
          Connect a wallet to see every debate you've proposed or challenged, whatever
          its current status.
        </p>
      )}

      {!loading && !error && debates.length === 0 && (tab === "open" || connectedAddress) && (
        <p className="text-sm text-slate-500">
          {tab === "open"
            ? "No open debates right now — be the first to stake a position."
            : "You haven't proposed or challenged a debate yet."}
        </p>
      )}

      <ul className="space-y-2">
        {debates.map((debate) => (
          <li key={debate.id.toString()}>
            <button
              onClick={() => onSelect(debate.id)}
              className={`w-full rounded-lg border px-3 py-2 text-left text-sm transition ${
                selectedId === debate.id
                  ? "border-agora-accent bg-agora-accent/10"
                  : "border-agora-border hover:border-slate-600"
              }`}
            >
              <p className="line-clamp-2 font-medium text-slate-100">{debate.resolution}</p>
              <p className="mt-1 flex items-center gap-1.5 text-xs text-slate-400">
                <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[debate.status] ?? "bg-slate-500"}`} />
                {debate.status} · #{debate.id.toString()} · {formatGen(debate.stake)} GEN
              </p>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Flame;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 font-medium transition ${
        active ? "bg-agora-accent text-white" : "text-slate-400 hover:text-slate-200"
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}
