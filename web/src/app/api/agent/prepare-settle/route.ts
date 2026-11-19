import { NextResponse } from "next/server";
import { encodeFunctionData, parseEther, type Address } from "viem";
import { splitMateAbi } from "@/lib/splitmate-abi";
import { erc20Abi } from "@/lib/abis";
import { isNative } from "@/lib/format";
import { client, readGroup, requireDeployment, chainId } from "@/server/chain";

// FR-18: prepares UNSIGNED transactions for a debtor to review and sign in their own
// wallet. The recipient is validated against contract state, never taken on trust.
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const groupId = q.get("groupId") || "";
  const debtor = q.get("debtor") || "";
  const creditor = q.get("creditor") || "";
  const amount = q.get("amount") || "";
  if (!/^\d+$/.test(groupId) || ![debtor, creditor].every((a) => /^0x[0-9a-fA-F]{40}$/.test(a)) || !/^\d+(\.\d+)?$/.test(amount))
    return NextResponse.json({ error: "groupId, debtor, creditor, amount required" }, { status: 400 });

  const d = requireDeployment();
  const gid = BigInt(groupId);
  const wei = parseEther(amount);
  const [g, dBal, cBal] = await Promise.all([
    readGroup(gid),
    client.readContract({ address: d.splitMate, abi: splitMateAbi, functionName: "netBalance", args: [gid, debtor as Address] }) as Promise<bigint>,
    client.readContract({ address: d.splitMate, abi: splitMateAbi, functionName: "netBalance", args: [gid, creditor as Address] }) as Promise<bigint>,
  ]);
  if (dBal > -wei || cBal < wei) return NextResponse.json({ error: "amount exceeds what is owed" }, { status: 409 });

  const native = isNative(g.token);
  const txs = native
    ? [
        {
          description: `Pay ${amount} BNB to ${creditor} for group "${g.name}"`,
          to: d.splitMate,
          value: wei.toString(),
          data: encodeFunctionData({ abi: splitMateAbi, functionName: "settle", args: [gid, creditor as Address] }),
        },
      ]
    : [
        {
          description: `Approve exactly ${amount} USDT for SplitMate (no unlimited approval)`,
          to: g.token,
          value: "0",
          data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [d.splitMate, wei] }),
        },
        {
          description: `Pay ${amount} USDT to ${creditor} for group "${g.name}"`,
          to: d.splitMate,
          value: "0",
          data: encodeFunctionData({ abi: splitMateAbi, functionName: "settleToken", args: [gid, creditor as Address, wei] }),
        },
      ];
  return NextResponse.json({
    chainId,
    from: debtor,
    note: "Unsigned. The wallet owner must review recipient, amount and token, then sign. Agentic Wallets that can only transfer may instead send BNB directly to the contract address (receive()).",
    transactions: txs,
    agenticWalletTransfer: native ? { to: d.splitMate, amountBNB: amount } : null,
  });
}
