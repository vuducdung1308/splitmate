"use client";
import { useState } from "react";
import { useAccount } from "wagmi";
import type { Address } from "viem";
import { splitMateAbi } from "@/lib/splitmate-abi";
import { fmt, tokenSymbol } from "@/lib/format";
import { computeShares, parseUnits18, SplitError, type SplitMode } from "@/lib/split";
import { useT } from "@/lib/i18n";
import { useDeployment, useIsAgentHolder, useTx } from "./hooks";

type Proposal = {
  description: string;
  amount: string | null;
  participants: Address[];
  splitMode: SplitMode;
  values: string[];
  notes: string;
  source: "claude" | "heuristic";
};

export function ExpenseForm(props: { groupId: bigint; token: Address; members: Address[]; nameOf: (a: string) => string; onSaved: () => void }) {
  const { t, lang } = useT();
  const d = useDeployment()!;
  const { address } = useAccount();
  const holder = useIsAgentHolder(address);
  const tx = useTx();
  const sym = tokenSymbol(props.token);

  const [desc, setDesc] = useState("");
  const [amount, setAmount] = useState("");
  const [picked, setPicked] = useState<Address[]>(props.members);
  const [mode, setMode] = useState<SplitMode>("equal");
  const [values, setValues] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);

  // Agent assist
  const [note, setNote] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [thinking, setThinking] = useState(false);
  const [agentNote, setAgentNote] = useState<string | null>(null);

  const ordered = props.members.filter((m) => picked.includes(m));
  let preview: bigint[] | null = null;
  let previewErr: string | null = null;
  try {
    if (amount) preview = computeShares(parseUnits18(amount), mode, ordered.length, ordered.map((m) => values[m] ?? ""));
  } catch (e) {
    previewErr = e instanceof SplitError ? e.message : String(e);
  }

  async function askAgent() {
    setThinking(true);
    setAgentNote(null);
    try {
      const r = await fetch("/api/agent/propose", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ groupId: props.groupId.toString(), payer: address, text: note || undefined, image: image || undefined, lang }),
      });
      const p = (await r.json()) as Proposal & { error?: string };
      if (!r.ok) throw new Error(p.error || r.statusText);
      // Proposal only fills the form. Participants are on-chain members chosen server-side.
      const valid = p.participants.filter((a) => props.members.some((m) => m.toLowerCase() === a.toLowerCase()));
      setDesc(p.description);
      if (p.amount) setAmount(p.amount);
      setPicked(valid.length ? valid : props.members);
      setMode(p.splitMode);
      setValues(Object.fromEntries(valid.map((a, i) => [a, p.values[i] ?? ""])));
      setAgentNote(`${p.source === "claude" ? "🤖" : "⚙️"} ${p.notes}`);
      setImage(null);
    } catch (e) {
      setAgentNote(`⚠️ ${(e as Error).message}`);
    } finally {
      setThinking(false);
    }
  }

  async function onImage(file?: File) {
    if (!file) return;
    if (file.size > 5_000_000) return setAgentNote("⚠️ Max 5 MB");
    const reader = new FileReader();
    reader.onload = () => setImage(String(reader.result));
    reader.readAsDataURL(file);
  }

  async function save() {
    setErr(null);
    if (!preview) return setErr(previewErr || "Invalid split");
    const total = parseUnits18(amount);
    // Drop zero shares (e.g. 0 parts) so the on-chain list only has real consumers.
    const parts: Address[] = [];
    const shares: bigint[] = [];
    ordered.forEach((m, i) => {
      if (preview![i] > 0n) {
        parts.push(m);
        shares.push(preview![i]);
      }
    });
    const r = await fetch("/api/meta", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ description: desc.trim() || "—", createdBy: address, groupId: props.groupId.toString(), nonce: crypto.randomUUID() }),
    });
    const { hash, error } = await r.json();
    if (!r.ok) return setErr(error);
    await tx.send({ address: d.splitMate, abi: splitMateAbi, functionName: "addExpense", args: [props.groupId, total, parts, shares, hash] });
    setDesc("");
    setAmount("");
    setValues({});
    setAgentNote(null);
    setNote("");
    props.onSaved();
  }

  const toggle = (m: Address) => setPicked((p) => (p.includes(m) ? p.filter((x) => x !== m) : [...p, m]));

  return (
    <section className="card stack">
      <h2>{t("addExpense")}</h2>

      <details>
        <summary style={{ cursor: "pointer", fontWeight: 600 }}>{t("agentAssist")}</summary>
        <div className="stack" style={{ marginTop: 8 }}>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("agentPlaceholder")} maxLength={2000} />
          <div className="row between">
            <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={(e) => onImage(e.target.files?.[0])} style={{ width: "auto", flex: 1 }} />
            <button className="small" disabled={thinking || (!note && !image)} onClick={askAgent}>
              {thinking ? t("pending") : t("propose")}
            </button>
          </div>
          {image && <img src={image} alt="" style={{ maxHeight: 140, borderRadius: 8, objectFit: "contain" }} />}
          <p className="muted" style={{ margin: 0 }}>
            {t("agentNote")}
          </p>
          {agentNote && <div className="warn">{agentNote}</div>}
        </div>
      </details>

      <div className="grid2">
        <div>
          <label>{t("description")}</label>
          <input value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={200} />
        </div>
        <div>
          <label>
            {t("amount")} ({sym})
          </label>
          <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="0.00" />
        </div>
      </div>
      <p className="muted" style={{ margin: 0 }}>
        {t("privacyWarn")}
      </p>

      <div>
        <label>{t("whoUsed")}</label>
        <div className="chips">
          {props.members.map((m) => (
            <button key={m} type="button" className={`chip ${picked.includes(m) ? "on" : ""}`} onClick={() => toggle(m)}>
              {props.nameOf(m)}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label>{t("splitMode")}</label>
        <div className="chips">
          {(["equal", "exact", "percent", "shares"] as const).map((k) => (
            <button key={k} type="button" className={`chip ${mode === k ? "on" : ""}`} onClick={() => setMode(k)}>
              {t(k)}
            </button>
          ))}
        </div>
      </div>

      <ul className="list">
        {ordered.map((m, i) => (
          <li key={m} className="row between" style={{ flexWrap: "nowrap" }}>
            <span style={{ flex: 1 }}>{props.nameOf(m)}</span>
            {mode !== "equal" && (
              <input
                style={{ width: 100 }}
                inputMode="decimal"
                value={values[m] ?? ""}
                placeholder={mode === "percent" ? "%" : mode === "shares" ? "1" : sym}
                onChange={(e) => setValues((v) => ({ ...v, [m]: e.target.value }))}
              />
            )}
            <span className="muted" style={{ width: 90, textAlign: "right" }}>
              {preview ? `${fmt(preview[i])} ${sym}` : "—"}
            </span>
          </li>
        ))}
      </ul>
      {amount && previewErr && <div className="err">{previewErr}</div>}
      {holder.data === false && <div className="warn">{t("noAgent")}</div>}
      <button disabled={!preview || tx.pending || !holder.data} onClick={() => save().catch(() => {})}>
        {tx.pending ? t("pending") : t("save")}
      </button>
      {(err || tx.error) && <div className="err">{err || tx.error}</div>}
    </section>
  );
}
