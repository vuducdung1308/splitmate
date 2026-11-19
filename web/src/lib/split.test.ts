import { test } from "node:test";
import assert from "node:assert/strict";
import { computeShares, parseUnits18, SplitError } from "./split.ts";
import { simplifyDebts } from "./simplify.ts";

const e = (n: string) => parseUnits18(n);

test("equal split gives remainder dust to first participants and sums exactly", () => {
  const s = computeShares(10n, "equal", 3);
  assert.deepEqual(s, [4n, 3n, 3n]);
});

test("exact must sum to total", () => {
  assert.deepEqual(computeShares(e("3"), "exact", 2, ["1", "2"]), [e("1"), e("2")]);
  assert.throws(() => computeShares(e("3"), "exact", 2, ["1", "1"]), SplitError);
});

test("percent and shares", () => {
  assert.deepEqual(computeShares(e("200"), "percent", 2, ["25", "75"]), [e("50"), e("150")]);
  assert.throws(() => computeShares(e("1"), "percent", 2, ["50", "40"]), SplitError);
  assert.deepEqual(computeShares(e("90"), "shares", 3, ["1", "1", "1"]), [e("30"), e("30"), e("30")]);
  const s = computeShares(e("1"), "shares", 3, ["2", "0", "1"]);
  assert.equal(s.reduce((a, b) => a + b, 0n), e("1"));
  assert.equal(s[1], 0n);
});

test("parseUnits18", () => {
  assert.equal(parseUnits18("1,5"), 15n * 10n ** 17n);
  assert.throws(() => parseUnits18("-1"), SplitError);
  assert.throws(() => parseUnits18("abc"), SplitError);
});

test("BRD Da Lat example: 3 payments settle everyone", () => {
  const bal = { A: e("120"), B: e("10"), C: -e("80"), D: -e("50") };
  const plan = simplifyDebts(bal);
  assert.equal(plan.length, 3);
  const after = { ...bal } as Record<string, bigint>;
  for (const p of plan) {
    after[p.from] += p.amount;
    after[p.to] -= p.amount;
  }
  assert.ok(Object.values(after).every((v) => v === 0n));
});

test("random balances always settle in <= n-1 payments", () => {
  let seed = 7;
  const rnd = () => (seed = (seed * 48271) % 2147483647);
  for (let k = 0; k < 200; k++) {
    const n = 2 + (rnd() % 8);
    const bal: Record<string, bigint> = {};
    let sum = 0n;
    for (let i = 0; i < n - 1; i++) {
      const v = BigInt(rnd() % 1_000_000) - 500_000n;
      bal["m" + i] = v;
      sum += v;
    }
    bal["m" + (n - 1)] = -sum;
    const plan = simplifyDebts(bal);
    assert.ok(plan.length <= n - 1);
    for (const p of plan) {
      bal[p.from] += p.amount;
      bal[p.to] -= p.amount;
      assert.ok(p.amount > 0n);
    }
    assert.ok(Object.values(bal).every((v) => v === 0n));
  }
});
