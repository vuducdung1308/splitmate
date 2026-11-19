"use client";
import Link from "next/link";
import { useT } from "@/lib/i18n";
import { useDeployment } from "./hooks";
import { DEFAULT_CHAIN_ID, explorerAddress } from "@/lib/config";

export function Footer() {
  const { t } = useT();
  const d = useDeployment();
  const url = d && explorerAddress(DEFAULT_CHAIN_ID, d.splitMate);
  return (
    <footer className="muted">
      <Link href="/privacy">{t("privacy")}</Link>
      {url && (
        <>
          {" · "}
          <a href={url} target="_blank" rel="noreferrer">
            Contract
          </a>
        </>
      )}
      {" · "}
      <a href="https://github.com/vuducdung1308/splitmate" target="_blank" rel="noreferrer">
        Source (MIT)
      </a>
    </footer>
  );
}
