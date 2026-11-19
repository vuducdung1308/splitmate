// Split calculators (FR-08). All math in integer wei; shares always sum to `amount`.
export type SplitMode = "equal" | "exact" | "percent" | "shares";

export class SplitError extends Error {}

const SCALE = 10n ** 18n;

/** Parse a non-negative decimal string ("1.5", "1,5") into 18-decimals bigint. */
export function parseUnits18(v: string): bigint {
  const s = v.trim().replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(s)) throw new SplitError(`Invalid number: ${v}`);
  const [i, f = ""] = s.split(".");
  if (f.length > 18) throw new SplitError(`Too many decimals: ${v}`);
  return BigInt(i) * SCALE + BigInt((f + "0".repeat(18)).slice(0, 18));
}

/** Distribute `amount` proportionally to integer `weights`; remainder wei to the first entries. */
function byWeights(amount: bigint, weights: bigint[]): bigint[] {
  const total = weights.reduce((a, b) => a + b, 0n);
  if (total <= 0n) throw new SplitError("Weights must be positive");
  const shares = weights.map((w) => (amount * w) / total);
  let rest = amount - shares.reduce((a, b) => a + b, 0n);
  for (let i = 0; rest > 0n; i = (i + 1) % shares.length) {
    if (weights[i] > 0n) {
      shares[i] += 1n;
      rest -= 1n;
    }
  }
  return shares;
}

/**
 * @param amount total in wei
 * @param mode   split mode
 * @param values per participant: ignored for "equal"; token amounts for "exact";
 *               percentages for "percent" (must total 100); integer parts for "shares".
 */
export function computeShares(amount: bigint, mode: SplitMode, count: number, values: string[] = []): bigint[] {
  if (amount <= 0n) throw new SplitError("Amount must be > 0");
  if (count <= 0) throw new SplitError("Pick at least one participant");
  switch (mode) {
    case "equal":
      return byWeights(amount, Array(count).fill(1n));
    case "exact": {
      const s = values.slice(0, count).map(parseUnits18);
      if (s.length !== count) throw new SplitError("Missing amounts");
      const sum = s.reduce((a, b) => a + b, 0n);
      if (sum !== amount) throw new SplitError("Exact amounts must add up to the total");
      return s;
    }
    case "percent": {
      const p = values.slice(0, count).map(parseUnits18);
      if (p.length !== count) throw new SplitError("Missing percentages");
      if (p.reduce((a, b) => a + b, 0n) !== 100n * SCALE) throw new SplitError("Percentages must add up to 100");
      return byWeights(amount, p);
    }
    case "shares": {
      const w = values.slice(0, count).map((v) => {
        if (!/^\d+$/.test(v.trim())) throw new SplitError(`Parts must be whole numbers: ${v}`);
        return BigInt(v.trim());
      });
      if (w.length !== count) throw new SplitError("Missing parts");
      return byWeights(amount, w);
    }
  }
}
