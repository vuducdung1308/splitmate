import { NextResponse } from "next/server";
import { getEvents } from "@/server/indexer";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const groupId = q.get("groupId") ?? undefined;
  if (groupId !== undefined && !/^\d+$/.test(groupId)) return NextResponse.json({ error: "bad groupId" }, { status: 400 });
  try {
    return NextResponse.json(await getEvents({ groupId }));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
