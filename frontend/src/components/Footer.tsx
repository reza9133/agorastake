import { Github, Scale, Twitter } from "lucide-react";
import { GENLAYER_DOCS_URL, GITHUB_URL, TWITTER_URL } from "../lib/links";

export default function Footer() {
  return (
    <footer className="py-10">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 text-sm text-slate-500 sm:flex-row">
        <div className="flex items-center gap-2">
          <Scale className="h-4 w-4 text-agora-accent" />
          <span>
            AgoraStake — powered by{" "}
            <a href={GENLAYER_DOCS_URL} target="_blank" rel="noreferrer" className="hover:text-slate-300">
              GenLayer
            </a>
          </span>
        </div>

        <div className="flex items-center gap-4">
          <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 hover:text-slate-300">
            <Github className="h-4 w-4" />
            reza9133/agorastake
          </a>
          <a href={TWITTER_URL} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 hover:text-slate-300">
            <Twitter className="h-4 w-4" />
            @amirhp771
          </a>
        </div>
      </div>
    </footer>
  );
}
