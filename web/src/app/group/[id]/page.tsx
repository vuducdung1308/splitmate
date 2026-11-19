"use client";
import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAccount, useReadContract, useReadContracts } from "wagmi";
import type { Address, Hex } from "viem";
import { splitMateAbi } from "@/lib/splitmate-abi";
import { erc20Abi } from "@/lib/abis";
import { DEFAULT_CHAIN_ID, explorerTx } from "@/lib/config";
import { fmt, inviteHash, isNative, newInviteCode, short, tokenSymbol } from "@/lib/format";
import { simplifyDebts } from "@/lib/simplify";
import { useT } from "@/lib/i18n";
import { useConfirm } from "@/components/Confirm";
import { useDeployment, useTx } from "@/components/hooks";
import { ExpenseForm } from "@/components/ExpenseForm";

type GroupTuple = readonly [string, Address, Address, boolean, bigint, bigint, bigint, bigint];

export default function GroupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const groupId = BigInt(/^\d+$/.test(id) ? id : "0");
  const { t } = useT();
  const d = useDeployment();
  const { address } = useAccount();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const group = useReadContract({ address: d?.splitMate, abi: splitMateAbi, functionName: "getGroup", args: [groupId], query: { enabled: !!d } });
  const bal = useReadContract({ address: d?.splitMate, abi: splitMateAbi, functionName: "getBalances", args: [groupId], query: { enabled: !!d } });
  const members = ((bal.data as [Address[], bigint[]] | undefined)?.[0] || []) as Address[];
  const balances = ((bal.data as [Address[], bigint[]] | undefined)?.[1] || []) as bigint[];
  const names = useReadContracts({
    contracts: members.map((m) => ({ address: d?.splitMate, abi: splitMateAbi, functionName: "displayName", args: [m] })),
    query: { enabled: !!d && members.length > 0 },
  });
  const nameOf = useMemo(() => {
    const map = new Map<string, string>();
    members.forEach((m, i) => map.set(m.toLowerCase(), (names.data?.[i]?.result as string) || short(m)));
    return (a: string) => (a.toLowerCase() === address?.toLowerCase() ? `${map.get(a.toLowerCase()) ?? short(a)} (${t("you")})` : map.get(a.toLowerCase()) ?? short(a));
  }, [members, names.data, address, t]);

  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = () => {
    group.refetch();
    bal.refetch();
    setRefreshKey((k) => k + 1);
  };

  if (!mounted) return null;
  if (!d) return <div className="warn">{t("notDeployed")}</div>;
  if (group.isError) return <div className="err">Group not found</div>;
  const g = group.data as GroupTuple | undefined;
  if (!g) return <p className="muted">…</p>;

  const [name, token, organizer, closed] = g;
  const sym = tokenSymbol(token);
  const isMember = !!address && members.some((m) => m.toLowerCase() === address.toLowerCase());

  return (
    <>
      <Link href="/" className="muted">
        {t("back")}
      </Link>
      <section className="card">
        <div className="row between">
          <h2 style={{ margin: 0, fontSize: 20 }}>{name}</h2>
          <span className="badge">
            {sym}
            {closed ? ` · ${t("closed")}` : ""}
          </span>
        </div>
        <p className="muted" style={{ margin: "6px 0 0" }}>
          {t("members")}: {members.map((m) => nameOf(m)).join(", ")}
        </p>
      </section>

      {address?.toLowerCase() === organizer.toLowerCase() && !closed && <OrganizerPanel groupId={groupId} onChange={refresh} />}

      <Balances groupId={groupId} token={token} members={members} balances={balances} nameOf={nameOf} onPaid={refresh} />

      {isMember && !closed && <ExpenseForm groupId={groupId} token={token} members={members} nameOf={nameOf} onSaved={refresh} />}

      <Expenses groupId={groupId} count={Number(g[7])} sym={sym} nameOf={nameOf} refreshKey={refreshKey} onChange={refresh} />

      <History groupId={groupId} sym={sym} nameOf={nameOf} refreshKey={refreshKey} />
    </>
  );
}

function OrganizerPanel({ groupId, onChange }: { groupId: bigint; onChange: () => void }) {
  const { t } = useT();
  const d = useDeployment()!;
  const tx = useTx();
  const key = `invite:${DEFAULT_CHAIN_ID}:${groupId}`;
  const [code, setCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    try {
      setCode(localStorage.getItem(key));
    } catch {}
  }, [key]);
  const link = code && typeof window !== "undefined" ? `${window.location.origin}/join?g=${groupId}&c=${code}` : null;

  async function rotate() {
    const c = newInviteCode();
    await tx.send({
      address: d.splitMate,
      abi: splitMateAbi,
      functionName: "setInvite",
      args: [groupId, inviteHash(groupId, c), BigInt(Math.floor(Date.now() / 1000) + 7 * 86400)],
    });
    try {
      localStorage.setItem(key, c);
    } catch {}
    setCode(c);
  }

  return (
    <section className="card stack">
      <h2>{t("invite")}</h2>
      {link ? (
        <div className="row" style={{ flexWrap: "nowrap" }}>
          <input readOnly value={link} className="mono" onFocus={(e) => e.target.select()} />
          <button
            className="small"
            onClick={() => {
              navigator.clipboard?.writeText(link);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? t("copied") : t("copy")}
          </button>
        </div>
      ) : null}
      <p className="muted" style={{ margin: 0 }}>
        {t("inviteNote")}
      </p>
      <div className="row">
        <button className="ghost small" disabled={tx.pending} onClick={() => rotate().catch(() => {})}>
          {t("newInvite")}
        </button>
        <button
          className="ghost small"
          disabled={tx.pending}
          onClick={async () => {
            await tx.send({ address: d.splitMate, abi: splitMateAbi, functionName: "closeGroup", args: [groupId] }).catch(() => {});
            onChange();
          }}
        >
          {t("closeGroup")}
        </button>
      </div>
      {tx.error && <div className="err">{tx.error}</div>}
    </section>
  );
}

function Balances(props: {
  groupId: bigint;
  token: Address;
  members: Address[];
  balances: bigint[];
  nameOf: (a: string) => string;
  onPaid: () => void;
}) {
  const { t } = useT();
  const d = useDeployment()!;
  const { address } = useAccount();
  const confirm = useConfirm();
  const tx = useTx();
  const sym = tokenSymbol(props.token);
  const map = Object.fromEntries(props.members.map((m, i) => [m, props.balances[i] ?? 0n]));
  const plan = simplifyDebts(map);
  const me = address?.toLowerCase();

  async function pay(to: Address, amount: bigint) {
    const ok = await confirm({
      rows: [
        [t("recipient"), `${props.nameOf(to)}\n${to}`],
        [t("amount"), `${fmt(amount, 6)} ${sym}`],
        [t("token"), isNative(props.token) ? "BNB (native)" : `${sym} ${props.token}`],
      ],
      note: isNative(props.token) ? undefined : `${t("approveExact")}: ${fmt(amount, 6)} ${sym}`,
    });
    if (!ok) return;
    if (isNative(props.token)) {
      await tx.send({ address: d.splitMate, abi: splitMateAbi, functionName: "settle", args: [props.groupId, to], value: amount });
    } else {
      // FR-13 / red line: approve exactly this payment, never unlimited.
      await tx.send({ address: props.token, abi: erc20Abi, functionName: "approve", args: [d.splitMate, amount] });
      await tx.send({ address: d.splitMate, abi: splitMateAbi, functionName: "settleToken", args: [props.groupId, to, amount] });
    }
    props.onPaid();
  }

  async function received(from: Address, amount: bigint) {
    const ok = await confirm({
      title: t("markReceived"),
      rows: [
        [t("owes"), props.nameOf(from)],
        [t("amount"), `${fmt(amount, 6)} ${sym}`],
      ],
    });
    if (!ok) return;
    await tx.send({ address: d.splitMate, abi: splitMateAbi, functionName: "markPaidOffChain", args: [props.groupId, from, amount] });
    props.onPaid();
  }

  return (
    <section className="card stack">
      <h2>{t("balances")}</h2>
      <ul className="list">
        {props.members.map((m, i) => {
          const b = props.balances[i] ?? 0n;
          return (
            <li key={m} className="row between">
              <span>{props.nameOf(m)}</span>
              <span className={b > 0n ? "pos" : b < 0n ? "neg" : "muted"}>
                {b > 0n ? "+" : ""}
                {fmt(b)} {sym}
              </span>
            </li>
          );
        })}
      </ul>
      <h2 style={{ marginTop: 14 }}>{t("suggested")}</h2>
      {plan.length === 0 && <p className="muted">{t("allSettled")}</p>}
      <ul className="list">
        {plan.map((p) => (
          <li key={p.from + p.to} className="row between">
            <span>
              {props.nameOf(p.from)} → {props.nameOf(p.to)}: <b>{fmt(p.amount)} {sym}</b>
            </span>
            <span className="row">
              {p.from.toLowerCase() === me && (
                <button className="small" disabled={tx.pending} onClick={() => pay(p.to as Address, p.amount).catch(() => {})}>
                  {t("pay")}
                </button>
              )}
              {p.to.toLowerCase() === me && (
                <button className="ghost small" disabled={tx.pending} onClick={() => received(p.from as Address, p.amount).catch(() => {})}>
                  {t("markReceived")}
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>
      {tx.pending && <span className="muted">{t("pending")}</span>}
      {tx.error && <div className="err">{tx.error}</div>}
    </section>
  );
}

type ExpenseTuple = readonly [Address, bigint, Hex, bigint, boolean, Address[], bigint[]];

function Expenses(props: { groupId: bigint; count: number; sym: string; nameOf: (a: string) => string; refreshKey: number; onChange: () => void }) {
  const { t } = useT();
  const d = useDeployment()!;
  const { address } = useAccount();
  const tx = useTx();
  const ids = Array.from({ length: props.count }, (_, i) => props.count - 1 - i).slice(0, 50);
  const ex = useReadContracts({
    contracts: ids.map((i) => ({ address: d.splitMate, abi: splitMateAbi, functionName: "getExpense", args: [props.groupId, BigInt(i)] })),
  });
  const disputes = useReadContracts({
    contracts: address
      ? ids.map((i) => ({ address: d.splitMate, abi: splitMateAbi, functionName: "disputed", args: [props.groupId, BigInt(i), address] }))
      : [],
  });
  const [meta, setMeta] = useState<Record<string, { description?: string } | null>>({});
  const hashes = (ex.data || []).map((r) => (r.result as ExpenseTuple | undefined)?.[2]).filter(Boolean) as string[];
  useEffect(() => {
    ex.refetch();
    disputes.refetch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.refreshKey]);
  useEffect(() => {
    const missing = hashes.filter((h) => !(h in meta) && !/^0x0+$/.test(h));
    if (!missing.length) return;
    fetch(`/api/meta?h=${missing.join(",")}`)
      .then((r) => r.json())
      .then((m) => setMeta((old) => ({ ...old, ...m })))
      .catch(() => {});
  }, [hashes.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!props.count) return null;
  const total = (ex.data || []).reduce((s, r) => {
    const e = r.result as ExpenseTuple | undefined;
    return e && !e[4] ? s + e[1] : s;
  }, 0n);

  return (
    <section className="card">
      <div className="row between">
        <h2 style={{ margin: 0 }}>{t("expenses")}</h2>
        <span className="muted">
          {t("totalSpent")}: {fmt(total)} {props.sym}
        </span>
      </div>
      <ul className="list">
        {ids.map((id, k) => {
          const e = ex.data?.[k]?.result as ExpenseTuple | undefined;
          if (!e) return null;
          const [payer, amount, hash, createdAt, cancelled, parts, shares] = e;
          const myIdx = parts.findIndex((p) => p.toLowerCase() === address?.toLowerCase());
          const iDisputed = (disputes.data?.[k]?.result as unknown) === true;
          const canDispute = myIdx >= 0 && shares[myIdx] > 0n && payer.toLowerCase() !== address?.toLowerCase() && !cancelled && !iDisputed && Date.now() / 1000 < Number(createdAt) + 3 * 86400;
          const isPayer = payer.toLowerCase() === address?.toLowerCase();
          return (
            <li key={id} className="stack">
              <div className="row between">
                <b style={{ textDecoration: cancelled ? "line-through" : undefined }}>{meta[hash]?.description || `#${id}`}</b>
                <span>
                  {fmt(amount)} {props.sym}
                </span>
              </div>
              <div className="muted">
                {props.nameOf(payer)} → {parts.map((p, i) => `${props.nameOf(p)} ${fmt(shares[i])}`).join(", ")} · {new Date(Number(createdAt) * 1000).toLocaleDateString()}
                {cancelled && ` · ${t("cancelled")}`}
                {iDisputed && ` · ${t("disputed")}`}
              </div>
              {(canDispute || (isPayer && !cancelled)) && (
                <div className="row">
                  {canDispute && (
                    <button
                      className="ghost small"
                      disabled={tx.pending}
                      onClick={async () => {
                        await tx.send({ address: d.splitMate, abi: splitMateAbi, functionName: "disputeExpense", args: [props.groupId, BigInt(id)] }).catch(() => {});
                        props.onChange();
                      }}
                    >
                      {t("dispute")}
                    </button>
                  )}
                  {isPayer && !cancelled && (
                    <button
                      className="ghost small"
                      disabled={tx.pending}
                      onClick={async () => {
                        await tx.send({ address: d.splitMate, abi: splitMateAbi, functionName: "cancelExpense", args: [props.groupId, BigInt(id)] }).catch(() => {});
                        props.onChange();
                      }}
                    >
                      {t("cancel")}
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {tx.error && <div className="err">{tx.error}</div>}
    </section>
  );
}

type Ev = { name: string; args: Record<string, string>; txHash: string; block: number };

function History({ groupId, sym, nameOf, refreshKey }: { groupId: bigint; sym: string; nameOf: (a: string) => string; refreshKey: number }) {
  const { t } = useT();
  const [events, setEvents] = useState<Ev[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    fetch(`/api/events?groupId=${groupId}`)
      .then((r) => r.json())
      .then((j) => (Array.isArray(j) ? setEvents(j) : setErr(j.error)))
      .catch((e) => setErr(String(e)));
  }, [groupId, refreshKey]);

  const label = (e: Ev) => {
    const a = e.args;
    const amt = (v?: string) => (v ? `${fmt(BigInt(v))} ${sym}` : "");
    switch (e.name) {
      case "Settled":
        return `💸 ${nameOf(a.debtor)} → ${nameOf(a.creditor)} ${amt(a.amount)}${a.paidBy.toLowerCase() !== a.debtor.toLowerCase() ? " (Agentic Wallet)" : ""}`;
      case "PaidOffChain":
        return `🤝 ${nameOf(a.debtor)} → ${nameOf(a.creditor)} ${amt(a.amount)} (off-chain)`;
      case "ExpenseAdded":
        return `🧾 ${nameOf(a.payer)} ${amt(a.amount)}`;
      case "ExpenseDisputed":
        return `⚠️ ${nameOf(a.participant)} #${a.expenseId}`;
      case "ExpenseCancelled":
        return `✖ #${a.expenseId}`;
      case "MemberJoined":
        return `👋 ${nameOf(a.member)}`;
      case "GroupCreated":
        return `✨ ${a.name}`;
      case "GroupClosed":
        return `🔒 ${t("closed")}`;
      default:
        return e.name;
    }
  };

  return (
    <section className="card">
      <h2>{t("history")}</h2>
      {err && <div className="muted">{err}</div>}
      <ul className="list">
        {(events || [])
          .slice()
          .reverse()
          .map((e) => {
            const url = explorerTx(DEFAULT_CHAIN_ID, e.txHash);
            return (
              <li key={e.txHash + e.name + JSON.stringify(e.args)} className="row between">
                <span>{label(e)}</span>
                {url ? (
                  <a href={url} target="_blank" rel="noreferrer" className="muted">
                    BscScan ↗
                  </a>
                ) : (
                  <span className="muted mono">{short(e.txHash)}</span>
                )}
              </li>
            );
          })}
      </ul>
    </section>
  );
}
