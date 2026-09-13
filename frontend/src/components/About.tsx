import { Github, Scale, ShieldCheck, Twitter } from "lucide-react";
import { GENLAYER_DOCS_URL, GITHUB_URL, TWITTER_URL } from "../lib/links";

export default function About() {
  return (
    <section id="about" className="border-b border-agora-border py-20">
      <div className="mx-auto grid max-w-6xl gap-10 px-6 md:grid-cols-[1.2fr_1fr]">
        <div>
          <h2 className="text-2xl font-bold text-white sm:text-3xl">About AgoraStake</h2>
          <p className="mt-4 text-sm leading-relaxed text-slate-400">
            AgoraStake is an on-chain argumentation market built on{" "}
            <a href={GENLAYER_DOCS_URL} target="_blank" rel="noreferrer" className="text-agora-accent hover:underline">
              GenLayer
            </a>
            , the adjudication layer for the agentic economy. Instead of a moderator, a
            single AI model, or whoever shouts loudest, disagreements here are settled by
            a diverse set of independent validators who each read the same arguments,
            fetch the same cited evidence, and have to agree on a structured verdict
            before a single unit of GEN moves.
          </p>
          <p className="mt-4 text-sm leading-relaxed text-slate-400">
            It's a demonstration of what GenLayer calls a "judgment call" primitive:
            evidence-grounded, subjective, and impossible for a purely deterministic
            smart contract to resolve on its own — but exactly the kind of thing a
            network of AI validators, reaching consensus the same way they would on any
            other transaction, was built to handle.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 rounded-lg border border-agora-border bg-agora-panel px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-slate-500"
            >
              <Github className="h-4 w-4" />
              View the source on GitHub
            </a>
            <a
              href={TWITTER_URL}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 rounded-lg border border-agora-border bg-agora-panel px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-slate-500"
            >
              <Twitter className="h-4 w-4" />
              Follow @amirhp771
            </a>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-agora-border bg-agora-panel p-5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-agora-accent/15 text-agora-accent">
              <Scale className="h-4.5 w-4.5" />
            </span>
            <h3 className="mt-3 text-sm font-semibold text-slate-100">Not a court</h3>
            <p className="mt-1.5 text-sm text-slate-400">
              AgoraStake settles wagers on argument quality. It is an evidence-based
              settlement primitive, not a legal ruling — treat it accordingly.
            </p>
          </div>
          <div className="rounded-xl border border-agora-border bg-agora-panel p-5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-agora-for/15 text-agora-for">
              <ShieldCheck className="h-4.5 w-4.5" />
            </span>
            <h3 className="mt-3 text-sm font-semibold text-slate-100">No backend, by design</h3>
            <p className="mt-1.5 text-sm text-slate-400">
              Every part of the judging pipeline — fetching evidence, scoring arguments,
              reaching consensus — runs inside the Intelligent Contract itself.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
