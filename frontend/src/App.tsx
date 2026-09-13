import { useEffect, useState } from "react";
import Header from "./components/Header";
import Hero from "./components/Hero";
import HowItWorks from "./components/HowItWorks";
import About from "./components/About";
import Footer from "./components/Footer";
import CreateDebateForm from "./components/CreateDebateForm";
import DebateBrowser from "./components/DebateBrowser";
import DebateDetail from "./components/DebateDetail";
import RecentActivity from "./components/RecentActivity";
import {
  connectWallet,
  disconnectWallet,
  getConnectedAddress,
  restoreWalletConnection,
} from "./lib/client";
import { getStats } from "./lib/contract";
import type { Stats } from "./lib/types";

const DEBATE_QUERY_PARAM = "debate";

function readDebateIdFromUrl(): bigint | null {
  if (typeof window === "undefined") return null;
  const raw = new URLSearchParams(window.location.search).get(DEBATE_QUERY_PARAM);
  if (!raw || !/^\d+$/.test(raw)) return null;
  try {
    return BigInt(raw);
  } catch {
    return null;
  }
}

export default function App() {
  const [address, setAddress] = useState<string | null>(getConnectedAddress());
  const [connecting, setConnecting] = useState(false);
  const [selectedId, setSelectedId] = useState<bigint | null>(readDebateIdFromUrl);
  const [refreshToken, setRefreshToken] = useState(0);
  const [stats, setStats] = useState<Stats | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);

  useEffect(() => {
    restoreWalletConnection().then((restored) => {
      if (restored) setAddress(restored);
    });
  }, []);

  useEffect(() => {
    getStats()
      .then((s) => {
        setStats(s);
        setStatsError(null);
      })
      .catch((err) => {
        setStats(null);
        setStatsError(err instanceof Error ? err.message : "Could not reach the contract.");
      });
  }, [refreshToken]);

  // Keep the selected debate in the URL so a refresh, or a link shared with
  // the other side of the debate, lands back on the same thread.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (selectedId !== null) url.searchParams.set(DEBATE_QUERY_PARAM, selectedId.toString());
    else url.searchParams.delete(DEBATE_QUERY_PARAM);
    window.history.replaceState(null, "", url.toString());
  }, [selectedId]);

  async function handleConnect() {
    setConnecting(true);
    try {
      setAddress(await connectWallet());
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not connect a wallet.");
    } finally {
      setConnecting(false);
    }
  }

  function handleDisconnect() {
    disconnectWallet();
    setAddress(null);
  }

  function bump() {
    setRefreshToken((n) => n + 1);
  }

  function scrollTo(id: string) {
    if (id === "top") {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="min-h-screen">
      <Header
        address={address}
        connecting={connecting}
        onConnect={handleConnect}
        onDisconnect={handleDisconnect}
        onNavigate={scrollTo}
      />

      <Hero stats={stats} onLaunch={() => scrollTo("app")} onLearnMore={() => scrollTo("how-it-works")} />

      <HowItWorks />

      <section id="app" className="border-b border-agora-border py-20">
        <div className="mx-auto max-w-6xl px-6">
          <div className="mb-8 text-center">
            <h2 className="text-2xl font-bold text-white sm:text-3xl">Open the floor</h2>
            <p className="mx-auto mt-3 max-w-xl text-sm text-slate-400">
              Connect a wallet to stake a position, challenge one that's already open, or
              call for a verdict once a debate's rebuttal window has closed.
            </p>
          </div>

          {statsError && (
            <p className="mx-auto mb-6 max-w-xl rounded-lg border border-agora-against/30 bg-agora-against/10 px-4 py-3 text-center text-sm text-agora-against">
              {statsError} — set <code>VITE_CONTRACT_ADDRESS</code> in <code>frontend/.env</code> and
              make sure it points at a deployed AgoraStake instance.
            </p>
          )}

          {!address && (
            <p className="mx-auto mb-6 max-w-xl rounded-lg border border-agora-border bg-agora-panel px-4 py-3 text-center text-sm text-slate-400">
              You can browse every open debate without a wallet. Connect one when you're
              ready to stake, challenge, rebut, or call for a verdict.
            </p>
          )}

          <div className="grid gap-6 md:grid-cols-[380px_1fr]">
            <div className="space-y-6">
              <CreateDebateForm disabled={!address} stats={stats} onCreated={bump} />
              <DebateBrowser
                selectedId={selectedId}
                onSelect={setSelectedId}
                refreshToken={refreshToken}
                connectedAddress={address}
              />
              <RecentActivity refreshToken={refreshToken} onSelectDebate={setSelectedId} />
            </div>

            <div>
              {selectedId !== null ? (
                <DebateDetail debateId={selectedId} connectedAddress={address} onChanged={bump} />
              ) : (
                <div className="flex h-full min-h-[320px] items-center justify-center rounded-xl border border-dashed border-agora-border p-10 text-center text-sm text-slate-500">
                  Pick a debate on the left, or open a new one, to see the full argument
                  thread and trigger a GenLayer verdict once both sides have spoken.
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <About />
      <Footer />
    </div>
  );
}
