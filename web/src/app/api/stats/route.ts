import { NextResponse } from "next/server";
import { agentIdInteractionStats } from "@/server/indexer";

// KPI helper: unique addresses that interacted with the contract (G1: >= 30 Agent ID holders).
export async function GET() {
  try {
    return NextResponse.json(await agentIdInteractionStats());
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
