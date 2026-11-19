"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import { useState, type ReactNode } from "react";
import { wagmiConfig } from "@/lib/wagmi";
import { I18nProvider } from "@/lib/i18n";
import { ConfirmProvider } from "@/components/Confirm";

export function Providers({ children }: { children: ReactNode }) {
  const [qc] = useState(() => new QueryClient());
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={qc}>
        <I18nProvider>
          <ConfirmProvider>{children}</ConfirmProvider>
        </I18nProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
