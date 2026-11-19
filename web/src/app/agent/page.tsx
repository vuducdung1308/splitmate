"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAccount, useReadContract } from "wagmi";
import { formatEther, isAddress, zeroAddress, type Address } from "viem";
import { splitMateAbi } from "@/lib/splitmate-abi";
import { useT } from "@/lib/i18n";
import { useDeployment, useTx } from "@/components/hooks";

// Option B (BRD section 7): main wallet manages groups; the Agentic Wallet that holds
// the Agent ID is linked by a plain BNB transfer of a unique challenge amount.
export default function AgentLinkPage() {
  const { lang, t } = useT();
  const vi = lang === "vi";
  const d = useDeployment();
  const { address } = useAccount();
  const tx = useTx();
  const [agent, setAgent] = useState("");
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const opts = { query: { enabled: !!address && !!d, refetchInterval: 5000 } };
  const declared = useReadContract({ address: d?.splitMate, abi: splitMateAbi, functionName: "declaredAgent", args: address ? [address] : undefined, ...opts });
  const challenge = useReadContract({ address: d?.splitMate, abi: splitMateAbi, functionName: "pendingChallenge", args: address ? [address] : undefined, ...opts });
  const decl = declared.data as Address | undefined;
  const owner = useReadContract({
    address: d?.splitMate,
    abi: splitMateAbi,
    functionName: "agentOwner",
    args: decl ? [decl] : undefined,
    query: { enabled: !!decl && decl !== zeroAddress, refetchInterval: 5000 },
  });

  if (!mounted) return null;
  if (!d) return <div className="warn">{t("notDeployed")}</div>;
  if (!address) return <div className="warn">{t("connect")} ↑</div>;

  const linked = decl && decl !== zeroAddress && (owner.data as Address | undefined)?.toLowerCase() === address.toLowerCase();
  const pendingAmt = challenge.data as bigint | undefined;

  return (
    <>
      <Link href="/" className="muted">
        {t("back")}
      </Link>
      <section className="card stack">
        <h2>{t("linkAgent")}</h2>
        <p className="muted" style={{ margin: 0 }}>
          {vi
            ? "Nếu Agent ID nằm ở Agentic Wallet (ví riêng cho AI agent), hãy liên kết nó với ví chính này. Sau khi liên kết, ví chính dùng được Agent ID để tạo/tham gia nhóm, và Agentic Wallet có thể trả nợ bằng một lệnh chuyển BNB thường."
            : "If your Agent ID lives in your Agentic Wallet, link it to this main wallet. Once linked, this wallet can create/join groups with that Agent ID, and the Agentic Wallet can pay BNB debts with a plain transfer."}
        </p>

        {linked ? (
          <div className="warn">
            ✓ {vi ? "Đã liên kết" : "Linked"}: <span className="mono">{decl}</span>
          </div>
        ) : pendingAmt && pendingAmt > 0n ? (
          <ol className="stack" style={{ paddingLeft: 20, margin: 0 }}>
            <li>{vi ? "Thêm địa chỉ contract này vào Address Book trong Binance App:" : "Add this contract to the Address Book in the Binance App:"}
              <div className="mono">{d.splitMate}</div>
            </li>
            <li>
              {vi ? "Từ Agentic Wallet " : "From the Agentic Wallet "}
              <span className="mono">{decl}</span>
              {vi ? ", chuyển ĐÚNG số BNB sau tới contract:" : ", send EXACTLY this amount of BNB to the contract:"}
              <div style={{ fontSize: 20, fontWeight: 700 }}>{formatEther(pendingAmt)} BNB</div>
              <div className="muted">
                {vi
                  ? `Ví dụ nói với agent: "Send ${formatEther(pendingAmt)} BNB to SplitMate". Số tiền được hoàn lại đầy đủ ngay trong giao dịch.`
                  : `e.g. tell your agent: "Send ${formatEther(pendingAmt)} BNB to SplitMate". It is refunded in full in the same transaction.`}
              </div>
            </li>
            <li className="muted">{vi ? "Trang này tự cập nhật khi liên kết thành công." : "This page updates once the link is confirmed."}</li>
          </ol>
        ) : null}

        <label>{vi ? "Địa chỉ Agentic Wallet (đang giữ Agent ID)" : "Agentic Wallet address (holding the Agent ID)"}</label>
        <input value={agent} onChange={(e) => setAgent(e.target.value.trim())} placeholder="0x…" className="mono" />
        <div className="row">
          <button
            disabled={!isAddress(agent) || tx.pending}
            onClick={async () => {
              await tx.send({ address: d.splitMate, abi: splitMateAbi, functionName: "declareAgent", args: [agent as Address] }).catch(() => {});
              declared.refetch();
              challenge.refetch();
            }}
          >
            {vi ? "Khai báo" : "Declare"}
          </button>
          {decl && decl !== zeroAddress && (
            <button
              className="ghost"
              disabled={tx.pending}
              onClick={async () => {
                await tx.send({ address: d.splitMate, abi: splitMateAbi, functionName: "unlinkAgent" }).catch(() => {});
                declared.refetch();
              }}
            >
              {vi ? "Hủy liên kết" : "Unlink"}
            </button>
          )}
        </div>
        {tx.error && <div className="err">{tx.error}</div>}
      </section>

      <section className="card stack">
        <h2>{vi ? "Trả nợ từ Agentic Wallet" : "Paying from the Agentic Wallet"}</h2>
        <p className="muted" style={{ margin: 0 }}>
          {vi
            ? "Với nhóm trả bằng BNB: Agentic Wallet đã liên kết chỉ cần chuyển BNB tới contract. Contract trả các khoản nợ cũ nhất của bạn, chuyển thẳng cho chủ nợ, và hoàn lại tiền thừa. Không có trừ tiền tự động: mỗi lần chuyển do bạn xác nhận."
            : "For BNB groups: the linked Agentic Wallet just sends BNB to the contract. It pays your oldest debts straight to creditors and refunds any excess. Nothing is debited automatically: you confirm every transfer."}
        </p>
      </section>
    </>
  );
}
