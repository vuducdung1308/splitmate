"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount, useReadContract, useReadContracts } from "wagmi";
import { decodeEventLog, zeroAddress } from "viem";
import { splitMateAbi } from "@/lib/splitmate-abi";
import { inviteHash, newInviteCode, tokenSymbol } from "@/lib/format";
import { DEFAULT_CHAIN_ID } from "@/lib/config";
import { useT } from "@/lib/i18n";
import { AgentCard } from "@/components/AgentCard";
import { useDeployment, useIsAgentHolder, useTx } from "@/components/hooks";

export default function Home() {
  const { t } = useT();
  const d = useDeployment();
  const { address } = useAccount();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) return null;
  return (
    <>
      <p className="muted">{t("appTagline")}</p>
      {!d && <div className="warn">{t("notDeployed")}</div>}
      {address && d && (
        <>
          <AgentCard />
          <MyGroups />
          <CreateGroup />
        </>
      )}
      {!address && <HowItWorks />}
    </>
  );
}

function HowItWorks() {
  const { lang } = useT();
  const steps =
    lang === "vi"
      ? ["Kết nối Binance Wallet có Agent ID", "Tạo chuyến đi, gửi link mời cho bạn bè (cần Agent ID)", "Ghi khoản chi, chọn ai dùng dịch vụ — hoặc nhờ agent đọc hóa đơn", "Xem gợi ý trả nợ tối thiểu, mỗi người tự ký trả thẳng cho chủ nợ"]
      : ["Connect a Binance Wallet with an Agent ID", "Create a trip and share the invite link (Agent ID required)", "Record expenses and pick who used what — or let the agent read the receipt", "See the minimal settlement plan; each debtor signs and pays the creditor directly"];
  return (
    <section className="card">
      <ol style={{ margin: 0, paddingLeft: 20 }}>
        {steps.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
    </section>
  );
}

function MyGroups() {
  const { t } = useT();
  const d = useDeployment()!;
  const { address } = useAccount();
  const ids = useReadContract({ address: d.splitMate, abi: splitMateAbi, functionName: "getUserGroups", args: [address!] });
  const groups = useReadContracts({
    contracts: ((ids.data as bigint[]) || []).map((id) => ({
      address: d.splitMate,
      abi: splitMateAbi,
      functionName: "getGroup",
      args: [id],
    })),
  });
  const list = (ids.data as bigint[]) || [];
  return (
    <section className="card">
      <h2>{t("myGroups")}</h2>
      {list.length === 0 && <p className="muted">{t("noGroups")}</p>}
      <ul className="list">
        {list.map((id, i) => {
          const g = groups.data?.[i]?.result as readonly [string, string, string, boolean, bigint, bigint, bigint, bigint] | undefined;
          return (
            <li key={id.toString()} className="row between">
              <Link href={`/group/${id}`}>{g ? g[0] : `#${id}`}</Link>
              {g && (
                <span className="muted">
                  {tokenSymbol(g[1])} · {g[6].toString()} 👤 · {g[7].toString()} 🧾 {g[3] ? `· ${t("closed")}` : ""}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function CreateGroup() {
  const { t } = useT();
  const d = useDeployment()!;
  const router = useRouter();
  const { address } = useAccount();
  const holder = useIsAgentHolder(address);
  const [name, setName] = useState("");
  const [token, setToken] = useState<"BNB" | "USDT">("USDT");
  const tx = useTx();

  async function create() {
    const code = newInviteCode();
    // groupId is assigned on-chain; the invite hash binds to the id we expect next.
    const { readContract } = await import("wagmi/actions");
    const { wagmiConfig } = await import("@/lib/wagmi");
    const next = (await readContract(wagmiConfig, { address: d.splitMate, abi: splitMateAbi, functionName: "groupCount" })) as bigint;
    const expiry = BigInt(Math.floor(Date.now() / 1000) + 7 * 86400);
    const receipt = await tx.send({
      address: d.splitMate,
      abi: splitMateAbi,
      functionName: "createGroup",
      args: [name.trim(), token === "BNB" ? zeroAddress : d.usdt, inviteHash(next, code), expiry],
    });
    let gid = next;
    for (const l of receipt.logs) {
      try {
        const ev = decodeEventLog({ abi: splitMateAbi, data: l.data, topics: l.topics });
        if (ev.eventName === "GroupCreated") gid = (ev.args as { groupId: bigint }).groupId;
      } catch {}
    }
    try {
      if (gid === next) localStorage.setItem(`invite:${DEFAULT_CHAIN_ID}:${gid}`, code);
    } catch {}
    router.push(`/group/${gid}`);
  }

  return (
    <section className="card stack">
      <h2>{t("createGroup")}</h2>
      <div>
        <label>{t("groupName")}</label>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={64} placeholder="Đà Lạt 12/2026" />
      </div>
      <div>
        <label>{t("payToken")}</label>
        <div className="chips">
          {(["USDT", "BNB"] as const).map((k) => (
            <button key={k} type="button" className={`chip ${token === k ? "on" : ""}`} onClick={() => setToken(k)}>
              {k}
            </button>
          ))}
        </div>
      </div>
      {holder.data === false && <div className="warn">{t("noAgent")}</div>}
      <button disabled={!name.trim() || tx.pending || !holder.data} onClick={() => create().catch(() => {})}>
        {tx.pending ? t("pending") : t("create")}
      </button>
      {tx.error && <div className="err">{tx.error}</div>}
    </section>
  );
}
