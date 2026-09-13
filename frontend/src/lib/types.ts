export type DebateStatus =
  | "OPEN"
  | "ACTIVE"
  | "RESOLVED"
  | "DRAWN"
  | "VOID"
  | "CANCELLED";

export type WinningSide = "proposer" | "challenger" | "draw" | "";

export interface Debate {
  id: bigint;
  category: string;
  resolution: string;

  proposer: string;
  challenger: string;
  stake: bigint;

  proposer_argument: string;
  proposer_evidence_url: string;
  proposer_rebuttal: string;

  challenger_argument: string;
  challenger_evidence_url: string;
  challenger_rebuttal: string;

  created_at: string;
  challenge_deadline: bigint;
  rebuttal_deadline: bigint;

  status: DebateStatus;
  winner: string;
  winning_side: WinningSide;

  proposer_logic: number;
  proposer_evidence_score: number;
  proposer_clarity: number;
  challenger_logic: number;
  challenger_evidence_score: number;
  challenger_clarity: number;

  verdict_summary: string;
  resolved_at: string;
}

export interface AuditEntry {
  id: bigint;
  debate_id: bigint;
  actor: string;
  action: string;
  detail: string;
  timestamp: string;
}

export interface Stats {
  total_debates: string;
  open_debates: string;
  total_resolved: string;
  total_drawn: string;
  total_volume: string;
  protocol_fee_bps: string;
  min_stake: string;
  paused: string;
  admin: string;
  treasury: string;
}
