import { bsc, bscTestnet, hardhat } from "viem/chains";
import type { Address, Chain } from "viem";
import deployments from "./deployments.json";

export type Deployment = {
  splitMate: Address;
  agentId: Address;
  usdt: Address;
  mocks: boolean;
  deployBlock: number;
};

export const CHAINS: Record<number, Chain> = { 56: bsc, 97: bscTestnet, 31337: hardhat };

/** Chain the app targets (56 mainnet, 97 testnet, 31337 local). */
export const DEFAULT_CHAIN_ID = Number(process.env.NEXT_PUBLIC_CHAIN_ID || 97);

export const RPC_URLS: Record<number, string> = {
  56: process.env.NEXT_PUBLIC_BSC_RPC || "https://bsc-dataseed.bnbchain.org",
  97: process.env.NEXT_PUBLIC_BSC_TESTNET_RPC || "https://bsc-testnet-rpc.publicnode.com",
  31337: process.env.NEXT_PUBLIC_LOCAL_RPC || "http://127.0.0.1:8545",
};

export function getDeployment(chainId: number): Deployment | undefined {
  return (deployments as Record<string, Deployment>)[String(chainId)];
}

export function explorerTx(chainId: number, hash: string) {
  if (chainId === 56) return `https://bscscan.com/tx/${hash}`;
  if (chainId === 97) return `https://testnet.bscscan.com/tx/${hash}`;
  return undefined;
}

export function explorerAddress(chainId: number, addr: string) {
  if (chainId === 56) return `https://bscscan.com/address/${addr}`;
  if (chainId === 97) return `https://testnet.bscscan.com/address/${addr}`;
  return undefined;
}
