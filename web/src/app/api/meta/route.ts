import { NextResponse } from "next/server";
import { z } from "zod";
import { metaHash } from "@/lib/format";
import { getMetas, putMeta } from "@/server/metaStore";

const Meta = z.object({
  description: z.string().max(200),
  createdBy: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  groupId: z.string().regex(/^\d+$/),
  nonce: z.string().max(80),
});

// POST: store an expense description, returns its hash for addExpense(metaHash).
export async function POST(req: Request) {
  const parsed = Meta.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid metadata" }, { status: 400 });
  const hash = metaHash(parsed.data);
  await putMeta(hash, parsed.data);
  return NextResponse.json({ hash });
}

// GET ?h=0x..,0x..
export async function GET(req: Request) {
  const hs = (new URL(req.url).searchParams.get("h") || "").split(",").filter((h) => /^0x[0-9a-fA-F]{64}$/.test(h)).slice(0, 200);
  return NextResponse.json(await getMetas(hs));
}
