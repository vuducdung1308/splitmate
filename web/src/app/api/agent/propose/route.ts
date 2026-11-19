import { NextResponse } from "next/server";
import { z } from "zod";
import { isNative } from "@/lib/format";
import { proposeSplit } from "@/server/agent";
import { readGroup, readMembers } from "@/server/chain";

export const runtime = "nodejs";
export const maxDuration = 60;

const Body = z.object({
  groupId: z.string().regex(/^\d+$/),
  payer: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
  text: z.string().max(2000).optional(),
  image: z
    .string()
    .regex(/^data:image\/(jpeg|png|webp|gif);base64,[A-Za-z0-9+/=]+$/)
    .max(7_000_000)
    .optional(),
  lang: z.enum(["vi", "en"]).default("vi"),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "invalid request" }, { status: 400 });
  const { groupId, payer, text, image, lang } = parsed.data;
  if (!text && !image) return NextResponse.json({ error: "text or image required" }, { status: 400 });

  // Members come from the contract, never from the client or the model (NFR-10).
  const [members, group] = await Promise.all([readMembers(BigInt(groupId)), readGroup(BigInt(groupId))]);
  if (!members.some((m) => m.address.toLowerCase() === payer.toLowerCase()))
    return NextResponse.json({ error: "payer is not a member" }, { status: 403 });

  let imageBase64: string | undefined;
  let imageMediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif" | undefined;
  if (image) {
    const m = image.match(/^data:(image\/[a-z]+);base64,(.*)$/)!;
    imageMediaType = m[1] as typeof imageMediaType;
    imageBase64 = m[2];
  }
  // The receipt image lives only in this request's memory; it is never stored (NFR-12).
  const proposal = await proposeSplit({
    text,
    imageBase64,
    imageMediaType,
    members,
    payer: payer as `0x${string}`,
    tokenSymbol: isNative(group.token) ? "BNB" : "USDT",
    lang,
  });
  return NextResponse.json(proposal);
}
