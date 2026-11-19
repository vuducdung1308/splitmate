import { NextResponse } from "next/server";
import { formatEther, type Address } from "viem";
import { splitMateAbi } from "@/lib/splitmate-abi";
import { simplifyDebts } from "@/lib/simplify";
import { isNative } from "@/lib/format";
import { client, readGroup, readMembers, requireDeployment, chainId } from "@/server/chain";

// Read-only tool for AI agents (FR-18): what does `address` owe / is owed, per group,
// plus the suggested payments that involve it. No keys, no signing.
export async function GET(req: Request) {
  const address = new URL(req.url).searchParams.get("address") || "";
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) return NextResponse.json({ error: "address required" }, { status: 400 });
  const d = requireDeployment();
  let owner = address as Address;
  // An Agentic Wallet asks on behalf of its linked main wallet.
  const linked = (await client.readContract({ address: d.splitMate, abi: splitMateAbi, functionName: "agentOwner", args: [owner] })) as Address;
  if (!/^0x0+$/.test(linked)) owner = linked;

  const groupIds = (await client.readContract({ address: d.splitMate, abi: splitMateAbi, functionName: "getUserGroups", args: [owner] })) as bigint[];
  const groups = await Promise.all(
    groupIds.map(async (gid) => {
      const [g, members] = await Promise.all([readGroup(gid), readMembers(gid)]);
      const [addrs, bals] = (await client.readContract({ address: d.splitMate, abi: splitMateAbi, functionName: "getBalances", args: [gid] })) as [Address[], bigint[]];
      const map = Object.fromEntries(addrs.map((a, i) => [a, bals[i]]));
      const name = (a: string) => members.find((m) => m.address === a)?.name || a;
      const plan = simplifyDebts(map)
        .filter((p) => p.from.toLowerCase() === owner.toLowerCase() || p.to.toLowerCase() === owner.toLowerCase())
        .map((p) => ({ from: name(p.from), fromAddress: p.from, to: name(p.to), toAddress: p.to, amount: formatEther(p.amount) }));
      return {
        groupId: gid.toString(),
        name: g.name,
        token: isNative(g.token) ? "BNB" : "USDT",
        closed: g.closed,
        myBalance: formatEther(map[owner] ?? 0n),
        suggestedPayments: plan,
      };
    }),
  );
  return NextResponse.json({ chainId, contract: d.splitMate, account: owner, queriedAs: address, groups });
}
