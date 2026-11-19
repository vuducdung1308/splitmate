"use client";
import Link from "next/link";
import { useAccount, useConnect, useDisconnect, useSwitchChain } from "wagmi";
import { useEffect, useState } from "react";
import { CHAINS, DEFAULT_CHAIN_ID } from "@/lib/config";
import { short } from "@/lib/format";
import { useT } from "@/lib/i18n";
import { useWrongChain } from "./hooks";

export function Header() {
  const { t, lang, setLang } = useT();
  const { address, isConnected } = useAccount();
  const { connectors, connect, error } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const wrong = useWrongChain();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Prefer a Binance Wallet provider when several are announced (EIP-6963).
  const connector =
    connectors.find((c) => /binance/i.test(c.name)) ?? connectors.find((c) => c.id !== "injected") ?? connectors[0];

  return (
    <>
      <header className="top">
        <Link href="/" className="brand">
          SplitMate
        </Link>
        <div className="row">
          <button className="ghost small" onClick={() => setLang(lang === "vi" ? "en" : "vi")} aria-label="language">
            {lang === "vi" ? "EN" : "VI"}
          </button>
          {mounted &&
            (isConnected ? (
              <button className="ghost small" onClick={() => disconnect()} title={t("disconnect")}>
                {short(address)}
              </button>
            ) : (
              <button className="small" onClick={() => connector && connect({ connector, chainId: DEFAULT_CHAIN_ID })} disabled={!connector}>
                {t("connect")}
              </button>
            ))}
        </div>
      </header>
      {mounted && (
        <main style={{ paddingBottom: 0 }}>
          {!connector && <div className="warn">{t("noWallet")}</div>}
          {error && <div className="err">{error.message}</div>}
          {wrong && (
            <div className="warn row between">
              <span>
                {t("wrongChain")} {CHAINS[DEFAULT_CHAIN_ID].name}
              </span>
              <button className="small" onClick={() => switchChain({ chainId: DEFAULT_CHAIN_ID })}>
                OK
              </button>
            </div>
          )}
        </main>
      )}
    </>
  );
}
