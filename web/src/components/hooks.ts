"use client";
import { useCallback, useState } from "react";
import { useAccount, useChainId, usePublicClient, useReadContract, useWriteContract } from "wagmi";
import { BaseError, type Abi, type Address } from "viem";
import { DEFAULT_CHAIN_ID, getDeployment } from "@/lib/config";
import { splitMateAbi } from "@/lib/splitmate-abi";

export function useDeployment() {
  return getDeployment(DEFAULT_CHAIN_ID);
}

export function useWrongChain() {
  const { isConnected } = useAccount();
  const chainId = useChainId();
  return isConnected && chainId !== DEFAULT_CHAIN_ID;
}

export function useIsAgentHolder(address?: Address) {
  const d = useDeployment();
  return useReadContract({
    address: d?.splitMate,
    abi: splitMateAbi,
    functionName: "isAgentHolder",
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!d },
  });
}

/** Send a tx, wait for 1 confirmation, surface a readable error. */
export function useTx() {
  const { writeContractAsync } = useWriteContract();
  const pc = usePublicClient();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const send = useCallback(
    async (args: { address: Address; abi: Abi; functionName: string; args?: readonly unknown[]; value?: bigint }) => {
      setPending(true);
      setError(null);
      try {
        const hash = await writeContractAsync(args as never);
        const receipt = await pc!.waitForTransactionReceipt({ hash });
        if (receipt.status !== "success") throw new Error("Transaction reverted");
        return receipt;
      } catch (e) {
        const msg = e instanceof BaseError ? e.shortMessage : (e as Error).message;
        setError(msg);
        throw e;
      } finally {
        setPending(false);
      }
    },
    [writeContractAsync, pc],
  );
  return { send, pending, error, setError };
}
