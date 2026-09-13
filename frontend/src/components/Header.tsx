import { Github, Menu, Scale, Twitter, Wallet, X as CloseIcon } from "lucide-react";
import { useState } from "react";
import { GITHUB_URL, TWITTER_URL } from "../lib/links";

interface HeaderProps {
  address: string | null;
  connecting: boolean;
  onConnect: () => void;
  onNavigate: (id: string) => void;
}

function shorten(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

const NAV_LINKS = [
  { id: "how-it-works", label: "How it works" },
  { id: "app", label: "Launch app" },
  { id: "about", label: "About" },
];

export default function Header({ address, connecting, onConnect, onNavigate }: HeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  function navigate(id: string) {
    setMenuOpen(false);
    onNavigate(id);
  }

  return (
    <header className="sticky top-0 z-30 border-b border-agora-border bg-agora-bg/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <button
          onClick={() => navigate("top")}
          className="flex items-center gap-2 text-left"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-agora-accent/15">
            <Scale className="h-5 w-5 text-agora-accent" />
          </span>
          <span>
            <span className="block text-lg font-semibold leading-none">AgoraStake</span>
            <span className="block text-xs text-slate-400">Argue. Stake. Let the validators decide.</span>
          </span>
        </button>

        <nav className="hidden items-center gap-6 md:flex">
          {NAV_LINKS.map((link) => (
            <button
              key={link.id}
              onClick={() => navigate(link.id)}
              className="text-sm text-slate-300 transition hover:text-white"
            >
              {link.label}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            className="hidden text-slate-400 transition hover:text-white sm:block"
            title="GitHub"
          >
            <Github className="h-5 w-5" />
          </a>
          <a
            href={TWITTER_URL}
            target="_blank"
            rel="noreferrer"
            className="hidden text-slate-400 transition hover:text-white sm:block"
            title="Follow on X"
          >
            <Twitter className="h-5 w-5" />
          </a>

          <button
            onClick={onConnect}
            disabled={connecting}
            className="flex items-center gap-2 rounded-lg border border-agora-border bg-agora-panel px-4 py-2 text-sm font-medium text-slate-100 transition hover:border-agora-accent disabled:opacity-60"
          >
            <Wallet className="h-4 w-4" />
            <span className="hidden sm:inline">
              {address ? shorten(address) : connecting ? "Connecting…" : "Connect wallet"}
            </span>
          </button>

          <button
            className="text-slate-300 md:hidden"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Toggle menu"
          >
            {menuOpen ? <CloseIcon className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {menuOpen && (
        <div className="flex flex-col gap-1 border-t border-agora-border px-6 py-3 md:hidden">
          {NAV_LINKS.map((link) => (
            <button
              key={link.id}
              onClick={() => navigate(link.id)}
              className="rounded-lg px-2 py-2 text-left text-sm text-slate-300 hover:bg-agora-panel"
            >
              {link.label}
            </button>
          ))}
          <div className="mt-1 flex gap-4 px-2 pt-1">
            <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="text-slate-400 hover:text-white">
              <Github className="h-5 w-5" />
            </a>
            <a href={TWITTER_URL} target="_blank" rel="noreferrer" className="text-slate-400 hover:text-white">
              <Twitter className="h-5 w-5" />
            </a>
          </div>
        </div>
      )}
    </header>
  );
}
