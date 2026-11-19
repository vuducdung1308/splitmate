import "server-only";
import { createPublicClient, http, type Address } from "viem";
import { CHAINS, DEFAULT_CHAIN_ID, RPC_URLS, getDeployment } from "@/lib/config";
import { splitMateAbi } from "@/lib/splitmate-abi";

const serverRpc: Record<number, string | undefined> = {
  56: process.env.BSC_RPC,
  97: process.env.BSC_TESTNET_RPC,
  31337: process.env.LOCAL_RPC,
};

export const chainId = DEFAULT_CHAIN_ID;
export const deployment = getDeployment(chainId);
export const client = createPublicClient({
  chain: CHAINS[chainId],
  transport: http(serverRpc[chainId] || RPC_URLS[chainId]),
});

export function requireDeployment() {
  if (!deployment) throw new Error(`SplitMate is not deployed on chain ${chainId}`);
  return deployment;
}

/** Members + display names read from the contract (never from the client or the LLM). */
export async function readMembers(groupId: bigint) {
  const d = requireDeployment();
  const members = (await client.readContract({
    address: d.splitMate,
    abi: splitMateAbi,
    functionName: "getMembers",
    args: [groupId],
  })) as Address[];
  const names = await Promise.all(
    members.map(
      (m) =>
        client.readContract({ address: d.splitMate, abi: splitMateAbi, functionName: "displayName", args: [m] }) as Promise<string>,
    ),
  );
  return members.map((address, i) => ({ address, name: names[i] || "" }));
}

export async function readGroup(groupId: bigint) {
  const d = requireDeployment();
  const [name, token, organizer, closed] = (await client.readContract({
    address: d.splitMate,
    abi: splitMateAbi,
    functionName: "getGroup",
    args: [groupId],
  })) as readonly [string, Address, Address, boolean, bigint, bigint, bigint, bigint];
  return { name, token, organizer, closed };
}
