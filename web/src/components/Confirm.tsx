"use client";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { useT } from "@/lib/i18n";

// NFR-09: every money-moving transaction is shown to the user (recipient, amount,
// token) before the wallet prompt.
type Req = { title?: string; rows: [string, string][]; note?: string };
const Ctx = createContext<(r: Req) => Promise<boolean>>(async () => false);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const { t } = useT();
  const [req, setReq] = useState<(Req & { resolve: (v: boolean) => void }) | null>(null);
  const confirm = useCallback((r: Req) => new Promise<boolean>((resolve) => setReq({ ...r, resolve })), []);
  const done = (v: boolean) => {
    req?.resolve(v);
    setReq(null);
  };
  return (
    <Ctx.Provider value={confirm}>
      {children}
      {req && (
        <div className="modal-back" onClick={() => done(false)}>
          <div className="modal stack" role="dialog" aria-modal onClick={(e) => e.stopPropagation()}>
            <h2 style={{ margin: 0 }}>{req.title || t("confirmTitle")}</h2>
            <dl className="kv">
              {req.rows.map(([k, v]) => (
                <div key={k} style={{ display: "contents" }}>
                  <dt>{k}</dt>
                  <dd className={v.startsWith("0x") ? "mono" : ""}>{v}</dd>
                </div>
              ))}
            </dl>
            {req.note && <div className="warn">{req.note}</div>}
            <div className="row" style={{ justifyContent: "flex-end" }}>
              <button className="ghost" onClick={() => done(false)}>
                {t("cancel")}
              </button>
              <button onClick={() => done(true)}>{t("sign")}</button>
            </div>
          </div>
        </div>
      )}
    </Ctx.Provider>
  );
}

export const useConfirm = () => useContext(Ctx);
