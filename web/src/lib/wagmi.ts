import { createConfig, http } from "wagmi";
import { injected } from "@wagmi/core";
import { CHAINS, DEFAULT_CHAIN_ID, RPC_URLS } from "./config";

// FR-01 / R6: injected provider only (Binance Wallet in-app browser or extension,
// discovered via EIP-6963). No QR / pairing-code login, no WalletConnect relay,
// no server-side session.
const chain = CHAINS[DEFAULT_CHAIN_ID];

export const wagmiConfig = createConfig({
  chains: [chain],
  connectors: [injected()],
  multiInjectedProviderDiscovery: true,
  transports: { [chain.id]: http(RPC_URLS[chain.id]) },
  ssr: true,
});
