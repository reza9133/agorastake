const DECIMALS = 18n;
const SCALE = 10n ** DECIMALS;

/**
 * Converts a decimal GEN amount (e.g. "12.5") to wei as a bigint, without
 * going through floating point. genlayer-js does not re-export a helper
 * for this (see genlayer-js's own docs, which build the value manually as
 * `BigInt(amount) * BigInt(10 ** 18)`), so this mirrors that approach for
 * amounts that aren't whole numbers.
 */
export function parseGen(amount: string): bigint {
  const trimmed = amount.trim();
  if (trimmed.length === 0) return 0n;

  const negative = trimmed.startsWith("-");
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  const [wholePart, fractionPart = ""] = unsigned.split(".");

  if (!/^\d*$/.test(wholePart) || !/^\d*$/.test(fractionPart)) {
    throw new Error(`"${amount}" is not a valid GEN amount`);
  }

  const paddedFraction = (fractionPart + "0".repeat(Number(DECIMALS))).slice(0, Number(DECIMALS));
  const whole = BigInt(wholePart || "0");
  const fraction = BigInt(paddedFraction || "0");
  const value = whole * SCALE + fraction;

  return negative ? -value : value;
}

/** Converts wei to a trimmed decimal GEN string for display. */
export function formatGen(wei: bigint | string): string {
  const value = typeof wei === "bigint" ? wei : BigInt(wei);
  const whole = value / SCALE;
  const remainder = value % SCALE;

  if (remainder === 0n) return whole.toString();

  const fraction = remainder.toString().padStart(Number(DECIMALS), "0").replace(/0+$/, "");
  return `${whole}.${fraction}`;
}
