"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAccount, useReadContract } from "wagmi";
import type { Hex } from "viem";
import { splitMateAbi } from "@/lib/splitmate-abi";
import { tokenSymbol } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { useDeployment, useIsAgentHolder, useTx } from "@/components/hooks";
import { AgentCard } from "@/components/AgentCard";

export default function JoinPage() {
  return (
    <Suspense>
      <Join />
    </Suspense>
  );
}

function Join() {
  const { t } = useT();
  const q = useSearchParams();
  const router = useRouter();
  const d = useDeployment();
  const { address } = useAccount();
  const holder = useIsAgentHolder(address);
  const tx = useTx();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const g = q.get("g") || "";
  const c = q.get("c") || "";
  const valid = /^\d+$/.test(g) && /^0x[0-9a-fA-F]{64}$/.test(c);
  const groupId = BigInt(valid ? g : "0");
  const group = useReadContract({ address: d?.splitMate, abi: splitMateAbi, functionName: "getGroup", args: [groupId], query: { enabled: valid && !!d } });
  const member = useReadContract({
    address: d?.splitMate,
    abi: splitMateAbi,
    functionName: "isMember",
    args: address ? [groupId, address] : undefined,
    query: { enabled: valid && !!d && !!address },
  });

  if (!mounted) return null;
  if (!valid) return <div className="err">Invalid invite link</div>;
  if (!d) return <div className="warn">{t("notDeployed")}</div>;
  const info = group.data as readonly [string, string, string, boolean, bigint, bigint, bigint, bigint] | undefined;

  return (
    <>
      <section className="card stack">
        <h2>{t("join")}</h2>
        {info && (
          <p style={{ margin: 0 }}>
            <b>{info[0]}</b> · {tokenSymbol(info[1])} · {info[6].toString()} 👤
          </p>
        )}
        <p className="muted" style={{ margin: 0 }}>
          {t("joinNeedAgent")}
        </p>
        {!address && <div className="warn">{t("connect")} ↑</div>}
        {member.data ? (
          <button onClick={() => router.push(`/group/${g}`)}>→ {info?.[0]}</button>
        ) : (
          <button
            disabled={!address || !holder.data || tx.pending}
            onClick={async () => {
              await tx.send({ address: d.splitMate, abi: splitMateAbi, functionName: "joinGroup", args: [groupId, c as Hex] }).catch(() => {});
              const r = await member.refetch();
              if (r.data) router.push(`/group/${g}`);
            }}
          >
            {tx.pending ? t("pending") : t("join")}
          </button>
        )}
        {tx.error && <div className="err">{tx.error}</div>}
      </section>
      {address && !holder.data && <AgentCard />}
    </>
  );
}
