import { ArrowRight, Github, Sparkles, Twitter } from "lucide-react";
import { GITHUB_URL, TWITTER_URL } from "../lib/links";
import type { Stats } from "../lib/types";
import { formatGen } from "../lib/format";

interface HeroProps {
  stats: Stats | null;
  onLaunch: () => void;
  onLearnMore: () => void;
}

export default function Hero({ stats, onLaunch, onLearnMore }: HeroProps) {
  return (
    <section id="top" className="relative overflow-hidden border-b border-agora-border">
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background:
            "radial-gradient(600px circle at 15% 10%, rgba(124,92,255,0.18), transparent 60%), radial-gradient(500px circle at 85% 25%, rgba(62,207,142,0.12), transparent 55%)",
        }}
      />

      <div className="relative mx-auto max-w-6xl px-6 py-20 text-center">
        <span className="mx-auto mb-6 flex w-fit items-center gap-2 rounded-full border border-agora-border bg-agora-panel px-4 py-1.5 text-xs font-medium text-slate-300">
          <Sparkles className="h-3.5 w-3.5 text-agora-accent" />
          Built on GenLayer — adjudication by AI validator consensus
        </span>

        <h1 className="mx-auto max-w-3xl text-4xl font-bold leading-tight text-white sm:text-5xl">
          Stake your position.
          <br />
          Let <span className="text-agora-accent">GenLayer</span> judge who's right.
        </h1>

        <p className="mx-auto mt-5 max-w-xl text-base text-slate-400">
          AgoraStake is an on-chain argumentation market. Two wallets stake equal GEN on
          opposite sides of a resolution, each makes their case, and a diverse set of
          independent GenLayer validators score the arguments and settle the pot —
          no moderators, no single judge, no backend in between.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <button
            onClick={onLaunch}
            className="flex items-center gap-2 rounded-lg bg-agora-accent px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-agora-accent/20 transition hover:opacity-90"
          >
            Launch the app
            <ArrowRight className="h-4 w-4" />
          </button>
          <button
            onClick={onLearnMore}
            className="rounded-lg border border-agora-border bg-agora-panel px-6 py-3 text-sm font-semibold text-slate-200 transition hover:border-slate-500"
          >
            How it works
          </button>
        </div>

        <div className="mt-6 flex items-center justify-center gap-4 text-slate-500">
          <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-sm transition hover:text-white">
            <Github className="h-4 w-4" /> Source
          </a>
          <span className="text-slate-700">·</span>
          <a href={TWITTER_URL} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-sm transition hover:text-white">
            <Twitter className="h-4 w-4" /> Follow updates
          </a>
        </div>

        {stats && (
          <div className="mx-auto mt-14 grid max-w-2xl grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Debates opened" value={stats.total_debates} />
            <Stat label="Verdicts reached" value={stats.total_resolved} />
            <Stat label="Draws" value={stats.total_drawn} />
            <Stat label="GEN staked (lifetime)" value={formatGen(stats.total_volume)} />
          </div>
        )}
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-agora-border bg-agora-panel/70 px-4 py-3">
      <p className="text-xl font-semibold text-white">{value}</p>
      <p className="mt-0.5 text-xs text-slate-500">{label}</p>
    </div>
  );
}
