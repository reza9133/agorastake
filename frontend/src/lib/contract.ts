import type { CalldataEncodable } from "genlayer-js/types";
import { TransactionStatus } from "genlayer-js/types";
import { CONTRACT_ADDRESS, getWriteClient, readClient } from "./client";
import type { AuditEntry, Debate, Stats } from "./types";

function requireAddress(): `0x${string}` {
  if (!CONTRACT_ADDRESS) {
    throw new Error("VITE_CONTRACT_ADDRESS is not set — see frontend/.env.example.");
  }
  return CONTRACT_ADDRESS;
}

async function read<T>(functionName: string, args: CalldataEncodable[] = []): Promise<T> {
  return readClient.readContract({
    address: requireAddress(),
    functionName,
    args,
  }) as Promise<T>;
}

/** Sends a write transaction and waits for it to be accepted by consensus. */
async function write(functionName: string, args: CalldataEncodable[], value: bigint = 0n) {
  const client = getWriteClient();
  const hash = await client.writeContract({
    address: requireAddress(),
    functionName,
    args,
    value,
  });
  return client.waitForTransactionReceipt({
    hash,
    status: TransactionStatus.ACCEPTED,
  });
}

// --- reads -----------------------------------------------------------------

export function getDebate(debateId: bigint | number): Promise<Debate> {
  return read<Debate>("get_debate", [debateId]);
}

export function getOpenDebates(limit = 50): Promise<bigint[]> {
  return read<bigint[]>("get_open_debates", [limit]);
}

export function getWalletDebates(wallet: string): Promise<bigint[]> {
  return read<bigint[]>("get_wallet_debates", [wallet]);
}

export function getAuditLog(start = 0, count = 50): Promise<AuditEntry[]> {
  return read<AuditEntry[]>("get_audit_log", [start, count]);
}

export function getStats(): Promise<Stats> {
  return read<Stats>("get_stats", []);
}

// --- writes ------------------------------------------------------------

export interface RequestDebateInput {
  resolution: string;
  category: string;
  argument: string;
  evidenceUrl: string;
  challengeWindowSeconds: number;
  stakeWei: bigint;
}

export function requestDebate(input: RequestDebateInput) {
  return write(
    "request_debate",
    [
      input.resolution,
      input.category,
      input.argument,
      input.evidenceUrl,
      input.challengeWindowSeconds,
    ],
    input.stakeWei,
  );
}

export interface ChallengeDebateInput {
  debateId: bigint | number;
  argument: string;
  evidenceUrl: string;
  rebuttalWindowSeconds: number;
  stakeWei: bigint;
}

export function challengeDebate(input: ChallengeDebateInput) {
  return write(
    "challenge_debate",
    [input.debateId, input.argument, input.evidenceUrl, input.rebuttalWindowSeconds],
    input.stakeWei,
  );
}

export function submitRebuttal(debateId: bigint | number, rebuttal: string) {
  return write("submit_rebuttal", [debateId, rebuttal]);
}

export function cancelDebate(debateId: bigint | number) {
  return write("cancel_debate", [debateId]);
}

export function reclaimExpired(debateId: bigint | number) {
  return write("reclaim_expired", [debateId]);
}

/** Triggers GenLayer consensus to judge the debate. Callable by anyone. */
export function resolveDebate(debateId: bigint | number) {
  return write("resolve_debate", [debateId]);
}
