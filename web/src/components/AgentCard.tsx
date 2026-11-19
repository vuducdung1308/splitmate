"use client";
import Link from "next/link";
import { useState } from "react";
import { useAccount, useReadContract } from "wagmi";
import { parseEther } from "viem";
import { splitMateAbi } from "@/lib/splitmate-abi";
import { agentIdAbi, mockUsdtAbi } from "@/lib/abis";
import { useT } from "@/lib/i18n";
import { useDeployment, useIsAgentHolder, useTx } from "./hooks";

export function AgentCard() {
  const { t } = useT();
  const { address } = useAccount();
  const d = useDeployment();
  const holder = useIsAgentHolder(address);
  const name = useReadContract({
    address: d?.splitMate,
    abi: splitMateAbi,
    functionName: "displayName",
    args: address ? [address] : undefined,
    query: { enabled: !!address && !!d },
  });
  const [draft, setDraft] = useState("");
  const tx = useTx();
  if (!address || !d) return null;

  return (
    <section className="card stack">
      <div className="row between">
        <h2 style={{ margin: 0 }}>{t("agentStatus")}</h2>
        {holder.data ? <span className="badge ok">✓ {t("hasAgent")}</span> : <span className="badge">✗</span>}
      </div>
      {holder.data === false && (
        <>
          <p className="muted" style={{ margin: 0 }}>
            {t("noAgent")}
          </p>
          <Link href="/agent" className="btn ghost">
            {t("linkAgent")}
          </Link>
        </>
      )}
      {holder.data && (
        <>
          <label>{t("displayName")}</label>
          <div className="row" style={{ flexWrap: "nowrap" }}>
            <input placeholder={name.data || "yourname.ai"} value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={64} />
            <button
              className="small"
              disabled={!draft || tx.pending}
              onClick={async () => {
                await tx.send({ address: d.splitMate, abi: splitMateAbi, functionName: "setDisplayName", args: [draft.trim()] });
                setDraft("");
                name.refetch();
              }}
            >
              {t("setName")}
            </button>
          </div>
          <Link href="/agent" className="muted">
            {t("linkAgent")} →
          </Link>
        </>
      )}
      {d.mocks && (
        <div className="row">
          <button
            className="ghost small"
            disabled={tx.pending}
            onClick={async () => {
              await tx.send({ address: d.agentId, abi: agentIdAbi, functionName: "mint", args: [address] });
              await tx.send({ address: d.usdt, abi: mockUsdtAbi, functionName: "mint", args: [address, parseEther("1000")] });
              holder.refetch();
            }}
          >
            {t("testnetFaucet")}
          </button>
        </div>
      )}
      {tx.pending && <span className="muted">{t("pending")}</span>}
      {tx.error && <div className="err">{tx.error}</div>}
    </section>
  );
}
