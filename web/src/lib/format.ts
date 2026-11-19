import { formatUnits, keccak256, toBytes, encodePacked, type Hex } from "viem";

export const short = (a?: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");

export function fmt(v: bigint, maxDecimals = 4) {
  const neg = v < 0n;
  const s = formatUnits(neg ? -v : v, 18);
  const [i, f = ""] = s.split(".");
  const ff = f.slice(0, maxDecimals).replace(/0+$/, "");
  return (neg ? "-" : "") + i.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (ff ? "." + ff : "");
}

export const tokenSymbol = (token: string) => (/^0x0+$/.test(token) ? "BNB" : "USDT");
export const isNative = (token: string) => /^0x0+$/.test(token);

/** 32-byte random invite code (hex), kept only in the invite link. */
export function newInviteCode(): Hex {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return ("0x" + Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("")) as Hex;
}

export const inviteHash = (groupId: bigint, code: Hex) =>
  keccak256(encodePacked(["uint256", "bytes32"], [groupId, code]));

/** Canonical JSON (sorted keys) so the same metadata always hashes the same. */
export function canonical(obj: unknown): string {
  if (Array.isArray(obj)) return `[${obj.map(canonical).join(",")}]`;
  if (obj && typeof obj === "object")
    return `{${Object.keys(obj as object)
      .sort()
      .map((k) => JSON.stringify(k) + ":" + canonical((obj as Record<string, unknown>)[k]))
      .join(",")}}`;
  return JSON.stringify(obj);
}
export const metaHash = (meta: unknown) => keccak256(toBytes(canonical(meta)));
