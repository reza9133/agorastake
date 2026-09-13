import { Coins, Gavel, MessageSquareText, Swords } from "lucide-react";

const STEPS = [
  {
    icon: Coins,
    title: "1. Propose & stake",
    description:
      "Post a resolution, make your opening case for it, and lock in a GEN stake. Anyone can attach a public evidence link to back their argument.",
    color: "text-agora-for",
  },
  {
    icon: Swords,
    title: "2. Challenge & match",
    description:
      "A challenger takes the opposing side by matching the exact stake and posting their own opening argument, before the challenge window expires.",
    color: "text-agora-against",
  },
  {
    icon: MessageSquareText,
    title: "3. One rebuttal each",
    description:
      "Both sides get exactly one rebuttal, submitted in parallel within a shared window — no side gets to see and out-write the other's response.",
    color: "text-sky-400",
  },
  {
    icon: Gavel,
    title: "4. GenLayer verdict",
    description:
      "Once the window closes, anyone can call for a verdict. Independent validators fetch the cited evidence, score logic, evidence and clarity, and must agree on a winner before the pot moves.",
    color: "text-agora-accent",
  },
];

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="border-b border-agora-border py-20">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-2xl font-bold text-white sm:text-3xl">How it works</h2>
          <p className="mt-3 text-sm text-slate-400">
            Four on-chain steps, all enforced by the contract itself — no off-chain moderator
            decides who was right.
          </p>
        </div>

        <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step) => (
            <div
              key={step.title}
              className="rounded-xl border border-agora-border bg-agora-panel p-5 transition hover:border-slate-600"
            >
              <span className={`flex h-10 w-10 items-center justify-center rounded-lg bg-white/5 ${step.color}`}>
                <step.icon className="h-5 w-5" />
              </span>
              <h3 className="mt-4 text-sm font-semibold text-slate-100">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{step.description}</p>
            </div>
          ))}
        </div>

        <div className="mt-8 rounded-xl border border-agora-border bg-agora-panel/60 p-5 text-sm text-slate-400">
          <span className="font-semibold text-slate-200">The verdict, in detail: </span>
          every validator re-runs the same judging prompt against the same evidence
          independently. A validator only agrees with the leader if the declared winner
          matches exactly and every 0–10 sub-score (logic, evidence, clarity, for both
          sides) is within two points — never by comparing the written reasoning itself.
          A genuine toss-up is settled as a draw and both stakes are refunded in full.
        </div>
      </div>
    </section>
  );
}
