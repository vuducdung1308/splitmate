// Debt simplification (FR-11): turn net balances into a short list of payments.
// Greedy max-creditor / max-debtor matching: at most n-1 payments, exact in wei.
export type Payment = { from: string; to: string; amount: bigint };

export function simplifyDebts(balances: Record<string, bigint>): Payment[] {
  const debtors: [string, bigint][] = [];
  const creditors: [string, bigint][] = [];
  for (const [addr, bal] of Object.entries(balances)) {
    if (bal < 0n) debtors.push([addr, -bal]);
    else if (bal > 0n) creditors.push([addr, bal]);
  }
  const out: Payment[] = [];
  const byAmount = (a: [string, bigint], b: [string, bigint]) => (b[1] > a[1] ? 1 : b[1] < a[1] ? -1 : a[0] < b[0] ? -1 : 1);
  while (debtors.length && creditors.length) {
    debtors.sort(byAmount);
    creditors.sort(byAmount);
    const d = debtors[0];
    const c = creditors[0];
    const amt = d[1] < c[1] ? d[1] : c[1];
    out.push({ from: d[0], to: c[0], amount: amt });
    d[1] -= amt;
    c[1] -= amt;
    if (d[1] === 0n) debtors.shift();
    if (c[1] === 0n) creditors.shift();
  }
  return out;
}
