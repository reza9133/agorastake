import { createClient } from "genlayer-js";
import { localnet, studionet, testnetAsimov, testnetBradbury } from "genlayer-js/chains";

export const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS as
  | `0x${string}`
  | undefined;

const CHAINS = { localnet, studionet, testnetAsimov, testnetBradbury } as const;
type ChainName = keyof typeof CHAINS;

const NETWORK = (import.meta.env.VITE_NETWORK as ChainName | undefined) ?? "studionet";
const CHAIN = CHAINS[NETWORK] ?? studionet;

const STORAGE_KEY = "agorastake.connectedAddress";
const DISCONNECT_FLAG = "agorastake.manualDisconnect";

declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      on?: (event: string, handler: (...args: unknown[]) => void) => void;
      removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
    };
  }
}

/** Read-only client — works without a wallet, used for every view call. */
export const readClient = createClient({ chain: CHAIN });

let writeClient: ReturnType<typeof createClient> | null = null;
let connectedAddress: string | null =
  typeof window !== "undefined" && window.localStorage.getItem(DISCONNECT_FLAG) !== "true"
    ? window.localStorage.getItem(STORAGE_KEY)
    : null;

function rememberAddress(address: string | null) {
  connectedAddress = address;
  if (typeof window === "undefined") return;
  if (address) {
    window.localStorage.setItem(STORAGE_KEY, address);
    window.localStorage.removeItem(DISCONNECT_FLAG);
  } else {
    window.localStorage.removeItem(STORAGE_KEY);
    window.localStorage.setItem(DISCONNECT_FLAG, "true");
  }
}

function buildWriteClient(address: `0x${string}`) {
  writeClient = createClient({
    chain: CHAIN,
    account: address,
    provider: window.ethereum,
  });
  rememberAddress(address);
}

export function getConnectedAddress(): string | null {
  if (typeof window !== "undefined" && window.localStorage.getItem(DISCONNECT_FLAG) === "true") {
    return null;
  }
  return connectedAddress;
}

/** Throws if the wallet has not connected yet — every write flow calls this first. */
export function getWriteClient(): ReturnType<typeof createClient> {
  if (!writeClient) {
    throw new Error("Connect a wallet before submitting a debate, stake, or verdict trigger.");
  }
  return writeClient;
}

export async function connectWallet(): Promise<string> {
  if (!window.ethereum) {
    throw new Error("No injected wallet found. Install MetaMask or a compatible wallet.");
  }

  if (typeof window !== "undefined") {
    window.localStorage.removeItem(DISCONNECT_FLAG);
  }

  const accounts = (await window.ethereum.request({
    method: "eth_requestAccounts",
  })) as string[];

  if (!accounts.length) throw new Error("The wallet returned no accounts.");
  const address = accounts[0] as `0x${string}`;

  buildWriteClient(address);

  // Best-effort chain switch — the write client already targets the
  // configured network, this just spares the user a manual switch prompt.
  try {
    await window.ethereum.request?.({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: `0x${CHAIN.id.toString(16)}` }],
    });
  } catch {
    // ignore — the user can switch manually, transactions still route
    // correctly through the genlayer-js client's configured chain
  }

  return address;
}

export async function restoreWalletConnection(): Promise<string | null> {
  if (!window.ethereum) return null;
  if (typeof window !== "undefined" && window.localStorage.getItem(DISCONNECT_FLAG) === "true") {
    return null;
  }

  const remembered = getConnectedAddress();
  if (!remembered) return null;

  const accounts = (await window.ethereum.request({ method: "eth_accounts" })) as string[];
  const address = accounts.find((a) => a.toLowerCase() === remembered.toLowerCase()) ?? accounts[0];

  if (!address) {
    disconnectWallet();
    return null;
  }

  buildWriteClient(address as `0x${string}`);
  return address;
}

export function disconnectWallet() {
  writeClient = null;
  rememberAddress(null);
}
