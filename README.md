# SplitMate

Group bill splitting on BNB Chain, with **Agent ID** as member identity, access control
and payment channel. Built for the Agent ID Hackathon (Agent Application Innovation Award).

Friends record shared expenses, choose who actually used each service, see a minimal
settlement plan, and each debtor pays the creditor **directly** in BNB or USDT. An AI
agent reads free-text notes or receipt photos and *proposes* splits; people confirm and
sign everything themselves.

> SplitMate is a ledger for settling debts between friends. It is not a payment service
> for goods or services, and it makes no promise of returns.

## Repository

| Path | What |
|---|---|
| `contracts/` | Solidity contract `SplitMate.sol` (Hardhat, OpenZeppelin), tests, deploy scripts |
| `web/` | Next.js app (wagmi/viem), API routes for metadata, indexer and the AI agent |
| `agent-skill/splitmate/SKILL.md` | Skill for AI agents: read balances, prepare unsigned settlements |

## How Agent ID is used

| Role | Implementation |
|---|---|
| Identity | Members are shown by `.ai` name; the non-transferable Agent ID means one identity per person, which deters throwaway accounts used to dodge debts |
| Access control | `onlyAgentHolder` (`IAgentID.balanceOf(addr) > 0`, or a verified linked Agentic Wallet that holds one) gates `createGroup`, `joinGroup`, `addExpense`, `setDisplayName` |
| Payment | Debts are settled from/to Agent ID addresses; `Settled(groupId, debtor, creditor, amount, paidBy)` is the receipt |
| Agentic Wallet channel | A linked Agentic Wallet pays by a plain BNB **transfer** to the contract (`receive()`), so it works even if the wallet can only "transfer" |
| Agent-to-agent | `/api/agent/balances` and `/api/agent/prepare-settle` let a creditor's or debtor's agent read debts and prepare payment requests for the owner to approve |

Agent ID contract (BSC): `0x60b9262456de011f7d15a54cdd8c48baaa8b022f`.

### Linking an Agentic Wallet (BRD option B)

1. Main wallet calls `declareAgent(agent)`; the agent must hold an Agent ID. The contract
   returns a unique **challenge amount** (1–999,999 gwei).
2. The user adds the SplitMate contract to the Binance App Address Book.
3. The Agentic Wallet sends exactly that amount of BNB to the contract.
4. `receive()` matches `(agent, amount)` to the declaring wallet, records the link and
   refunds the full amount in the same transaction.

The challenge amount prevents someone else from declaring your agent and capturing your
proof transfer.

## Owner powers and red lines (full disclosure)

- **There is no owner.** No admin, pause, freeze, mint, fee, tax, upgrade proxy or
  withdraw function. Constructor arguments (Agent ID address, USDT address) are immutable.
- **Pass-through only.** `settle` forwards BNB to the creditor in the same call;
  `settleToken` moves USDT from debtor to creditor with `transferFrom`; `receive()`
  forwards or refunds everything. The contract ends every transaction with zero balance.
- **No automatic debits.** Nothing can move a user's funds except a transaction that user
  signs. No recurring payments, no fixed-address auto transfers.
- **Exact approvals.** The UI approves exactly the payment amount for USDT.
- **No QR / pairing-code login**, no server-held sessions; the web app connects only via
  the injected Binance Wallet provider.
- **No seed phrase / private key / API secret collection** anywhere, including logs.
- **AI output is advisory.** Recipients always come from contract state; the model sees
  only member labels (m0, m1…) and never returns addresses.
- **No name search.** Members join by invite link only.
- **Privacy.** Only a hash of each expense description goes on-chain; receipt photos are
  processed in memory and discarded.

## Contract summary

| Function | Who | Notes |
|---|---|---|
| `createGroup(name, token, inviteHash, expiry)` | Agent ID holder | token = `0x0` (BNB) or USDT |
| `setInvite`, `closeGroup` | organizer | invite = `keccak256(groupId, code)`, ≤ 30 days |
| `joinGroup(groupId, code)` | Agent ID holder | max 50 members per group, 20 groups per user |
| `addExpense(groupId, amount, participants, shares, metaHash)` | member + Agent ID | shares must sum to amount |
| `disputeExpense` | participant, within 3 days | removes their share until the payer corrects it |
| `cancelExpense` | payer | reverses non-disputed shares |
| `settle` / `settleToken` | debtor | pay any creditor with a positive net balance, never more than owed |
| `markPaidOffChain` | creditor | clears cash / bank payments |
| `declareAgent`, `unlinkAgent`, `receive()` | main wallet / Agentic Wallet | see above |

Balances are stored as **net balance per member per group**, which is what lets the
off-chain debt simplification (≤ n−1 payments) be paid on-chain without pairwise debts.

Gas: `settle()` ≈ 47k. Tests: 30 contract tests incl. the BRD Đà Lạt example, hijack
attempts and randomized property tests; ~98% line coverage.

## Run locally

```bash
# 1. contracts
cd contracts && npm install
npx hardhat test
npx hardhat node                      # terminal A
npm run deploy:local                  # terminal B, writes web/src/lib/deployments.json
npx hardhat run scripts/seed-local.ts --network localhost

# 2. web
cd ../web && npm install
cp .env.example .env.local            # set NEXT_PUBLIC_CHAIN_ID=31337, optional ANTHROPIC_API_KEY
npm run dev
```

## Deploy

```bash
cd contracts
cp .env.example .env                  # DEPLOYER_PRIVATE_KEY (fresh gas-only wallet), ETHERSCAN_API_KEY
npm run deploy:testnet                # deploys mocks + SplitMate on BSC testnet, verifies
npm run deploy:mainnet                # real Agent ID + USDT on BSC, verifies on BscScan
```

Then set `NEXT_PUBLIC_CHAIN_ID=56` for the web app and deploy it (any Node host). For
serverless hosting, replace the file-backed metadata store in `web/src/server/metaStore.ts`
with a KV/database.

KPI: `GET /api/stats` counts unique addresses that interacted with the contract.

## License

MIT
