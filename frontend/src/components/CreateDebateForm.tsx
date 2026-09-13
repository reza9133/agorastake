import { useEffect, useState } from "react";
import { PauseCircle, PlusCircle } from "lucide-react";
import { requestDebate } from "../lib/contract";
import { formatGen, parseGen } from "../lib/format";
import type { Stats } from "../lib/types";

interface CreateDebateFormProps {
  disabled: boolean;
  stats: Stats | null;
  onCreated: () => void;
}

const CATEGORIES = ["technology", "economics", "workplace", "science", "culture", "other"];
const FALLBACK_MIN_STAKE_GEN = "5"; // shown only until get_stats() resolves

export default function CreateDebateForm({ disabled, stats, onCreated }: CreateDebateFormProps) {
  const isPaused = stats?.paused.toLowerCase() === "true";
  const minStakeGen = stats ? formatGen(stats.min_stake) : FALLBACK_MIN_STAKE_GEN;

  const [resolution, setResolution] = useState("");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [argument, setArgument] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [stake, setStake] = useState(minStakeGen);
  const [stakeTouched, setStakeTouched] = useState(false);
  const [windowDays, setWindowDays] = useState("3");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Once real config loads from the chain, default the stake field to the
  // live minimum -- but only if the user hasn't already typed a value.
  useEffect(() => {
    if (!stakeTouched) setStake(minStakeGen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minStakeGen]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await requestDebate({
        resolution: resolution.trim(),
        category,
        argument: argument.trim(),
        evidenceUrl: evidenceUrl.trim(),
        challengeWindowSeconds: Math.round(Number(windowDays) * 86400),
        stakeWei: parseGen(stake || "0"),
      });
      setResolution("");
      setArgument("");
      setEvidenceUrl("");
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to open the debate.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-3 rounded-xl border border-agora-border bg-agora-panel p-5"
    >
      <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-200">
        <PlusCircle className="h-4 w-4 text-agora-accent" />
        Open a debate
      </h2>

      {isPaused && (
        <p className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
          <PauseCircle className="h-4 w-4 shrink-0" />
          The admin has paused new debates. Existing ones are unaffected — check back later.
        </p>
      )}

      <fieldset disabled={isPaused} className="space-y-3 disabled:opacity-50">
        <input
          required
          maxLength={280}
          value={resolution}
          onChange={(e) => setResolution(e.target.value)}
          placeholder='Resolution, e.g. "Remote work increases team productivity"'
          className="w-full rounded-lg border border-agora-border bg-agora-bg px-3 py-2 text-sm outline-none focus:border-agora-accent"
        />

        <div className="grid grid-cols-2 gap-3">
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="rounded-lg border border-agora-border bg-agora-bg px-3 py-2 text-sm outline-none focus:border-agora-accent"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <input
            value={evidenceUrl}
            onChange={(e) => setEvidenceUrl(e.target.value)}
            placeholder="Evidence URL (optional)"
            className="rounded-lg border border-agora-border bg-agora-bg px-3 py-2 text-sm outline-none focus:border-agora-accent"
          />
        </div>

        <textarea
          required
          maxLength={4000}
          rows={4}
          value={argument}
          onChange={(e) => setArgument(e.target.value)}
          placeholder="Make your opening case for the FOR side..."
          className="w-full rounded-lg border border-agora-border bg-agora-bg px-3 py-2 text-sm outline-none focus:border-agora-accent"
        />

        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs text-slate-400">
            Stake (GEN)
            <input
              type="number"
              min={minStakeGen}
              step="0.1"
              value={stake}
              onChange={(e) => {
                setStakeTouched(true);
                setStake(e.target.value);
              }}
              className="mt-1 w-full rounded-lg border border-agora-border bg-agora-bg px-3 py-2 text-sm outline-none focus:border-agora-accent"
            />
            <span className="mt-1 block text-[11px] text-slate-500">
              Minimum {minStakeGen} GEN{!stats && " (loading current minimum…)"}
            </span>
          </label>
          <label className="text-xs text-slate-400">
            Challenge window (days)
            <input
              type="number"
              min="1"
              max="30"
              value={windowDays}
              onChange={(e) => setWindowDays(e.target.value)}
              className="mt-1 w-full rounded-lg border border-agora-border bg-agora-bg px-3 py-2 text-sm outline-none focus:border-agora-accent"
            />
          </label>
        </div>

        {error && <p className="text-xs text-agora-against">{error}</p>}

        <button
          type="submit"
          disabled={disabled || submitting || isPaused}
          className="w-full rounded-lg bg-agora-accent px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
        >
          {submitting ? "Staking…" : "Stake and open the floor"}
        </button>
      </fieldset>
    </form>
  );
}
