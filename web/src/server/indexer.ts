import "server-only";
import { parseAbiItem, type Log } from "viem";
import { client, chainId, requireDeployment } from "./chain";

// Minimal event indexer (NFR-13): incrementally scans SplitMate logs and keeps
// them in memory. Balances themselves are read from contract state, so this is
// only used for the history list and BscScan links.
const EVENTS = [
  parseAbiItem("event GroupCreated(uint256 indexed groupId, address indexed organizer, string name, address token)"),
  parseAbiItem("event MemberJoined(uint256 indexed groupId, address indexed member)"),
  parseAbiItem("event ExpenseAdded(uint256 indexed groupId, uint256 indexed expenseId, address indexed payer, uint256 amount, bytes32 metaHash)"),
  parseAbiItem("event ExpenseDisputed(uint256 indexed groupId, uint256 indexed expenseId, address indexed participant, uint256 share)"),
  parseAbiItem("event ExpenseCancelled(uint256 indexed groupId, uint256 indexed expenseId)"),
  parseAbiItem("event Settled(uint256 indexed groupId, address indexed debtor, address indexed creditor, uint256 amount, address paidBy)"),
  parseAbiItem("event PaidOffChain(uint256 indexed groupId, address indexed debtor, address indexed creditor, uint256 amount)"),
  parseAbiItem("event GroupClosed(uint256 indexed groupId)"),
  parseAbiItem("event AgentLinked(address indexed owner, address indexed agent)"),
];

export type IndexedEvent = {
  name: string;
  groupId?: string;
  args: Record<string, string>;
  txHash: string;
  block: number;
  logIndex: number;
};

const CHUNK = BigInt(process.env.INDEXER_CHUNK || 4000);
const state = { next: -1n, events: [] as IndexedEvent[], running: null as Promise<void> | null };

function toJson(v: unknown): string {
  return typeof v === "bigint" ? v.toString() : String(v);
}

async function catchUp() {
  const d = requireDeployment();
  if (state.next < 0n) state.next = BigInt(d.deployBlock);
  const latest = await client.getBlockNumber();
  while (state.next <= latest) {
    const to = state.next + CHUNK - 1n > latest ? latest : state.next + CHUNK - 1n;
    const logs = (await client.getLogs({ address: d.splitMate, events: EVENTS, fromBlock: state.next, toBlock: to })) as (Log & {
      eventName: string;
      args: Record<string, unknown>;
    })[];
    for (const l of logs) {
      const args = Object.fromEntries(Object.entries(l.args).map(([k, v]) => [k, toJson(v)]));
      state.events.push({
        name: l.eventName,
        groupId: args.groupId,
        args,
        txHash: l.transactionHash!,
        block: Number(l.blockNumber),
        logIndex: l.logIndex!,
      });
    }
    state.next = to + 1n;
  }
}

export async function getEvents(filter: { groupId?: string; address?: string }) {
  if (!state.running) state.running = catchUp().finally(() => (state.running = null));
  await state.running;
  const addr = filter.address?.toLowerCase();
  return state.events.filter(
    (e) =>
      (filter.groupId === undefined || e.groupId === filter.groupId) &&
      (!addr || Object.values(e.args).some((v) => v.toLowerCase() === addr)),
  );
}

export async function agentIdInteractionStats() {
  const all = await getEvents({});
  const addrs = new Set<string>();
  for (const e of all) {
    for (const k of ["organizer", "member", "payer", "debtor", "paidBy", "agent", "participant"]) {
      if (e.args[k]) addrs.add(e.args[k].toLowerCase());
    }
  }
  return { chainId, uniqueAddresses: addrs.size, events: all.length };
}
