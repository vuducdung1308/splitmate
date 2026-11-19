import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import type { SplitMate, MockAgentID, MockUSDT } from "../typechain-types";

const BNB = ethers.ZeroAddress;
const CODE = ethers.id("invite-secret");
const e = (n: number | string) => ethers.parseEther(String(n));

async function inviteHash(groupId: bigint | number, code = CODE) {
  return ethers.solidityPackedKeccak256(["uint256", "bytes32"], [groupId, code]);
}

async function expiry(days = 7) {
  return BigInt((await time.latest()) + days * 86400);
}

describe("SplitMate", () => {
  let sm: SplitMate, aid: MockAgentID, usdt: MockUSDT;
  let A: HardhatEthersSigner, B: HardhatEthersSigner, C: HardhatEthersSigner, D: HardhatEthersSigner;
  let X: HardhatEthersSigner, agent: HardhatEthersSigner, mallory: HardhatEthersSigner;

  beforeEach(async () => {
    [A, B, C, D, X, agent, mallory] = await ethers.getSigners();
    aid = await (await ethers.getContractFactory("MockAgentID")).deploy();
    usdt = await (await ethers.getContractFactory("MockUSDT")).deploy();
    sm = await (await ethers.getContractFactory("SplitMate")).deploy(aid, usdt);
    for (const s of [A, B, C, D, agent]) await aid.mint(s);
  });

  async function makeGroup(token = BNB, members = [B, C, D]) {
    await sm.connect(A).createGroup("Da Lat", token, await inviteHash(0), await expiry());
    for (const m of members) await sm.connect(m).joinGroup(0, CODE);
    return 0n;
  }

  describe("deployment", () => {
    it("rejects zero addresses", async () => {
      const F = await ethers.getContractFactory("SplitMate");
      await expect(F.deploy(BNB, usdt)).to.be.revertedWithCustomError(sm, "InvalidToken");
    });
    it("exposes no owner/admin functions", async () => {
      const names = sm.interface.fragments.filter((f) => f.type === "function").map((f: any) => f.name);
      for (const bad of ["owner", "withdraw", "pause", "mint", "upgradeTo", "transferOwnership", "setFee"]) {
        expect(names).to.not.include(bad);
      }
    });
  });

  describe("access control (Agent ID)", () => {
    it("only Agent ID holders can create groups", async () => {
      await expect(sm.connect(X).createGroup("x", BNB, ethers.ZeroHash, 0)).to.be.revertedWithCustomError(
        sm,
        "NotAgentHolder",
      );
    });
    it("only Agent ID holders can join", async () => {
      await makeGroup(BNB, []);
      await expect(sm.connect(X).joinGroup(0, CODE)).to.be.revertedWithCustomError(sm, "NotAgentHolder");
    });
    it("validates group inputs", async () => {
      await expect(sm.connect(A).createGroup("", BNB, ethers.ZeroHash, 0)).to.be.revertedWithCustomError(
        sm,
        "InvalidName",
      );
      await expect(sm.connect(A).createGroup("x", X.address, ethers.ZeroHash, 0)).to.be.revertedWithCustomError(
        sm,
        "InvalidToken",
      );
      await expect(
        sm.connect(A).createGroup("x", BNB, ethers.ZeroHash, (await expiry(0)) - 10n),
      ).to.be.revertedWithCustomError(sm, "InvalidInvite");
      await expect(sm.connect(A).createGroup("x", BNB, ethers.ZeroHash, await expiry(31))).to.be.revertedWithCustomError(
        sm,
        "InvalidInvite",
      );
      await expect(sm.getGroup(5)).to.be.revertedWithCustomError(sm, "GroupNotFound");
    });
    it("rejects wrong / expired / revoked invite codes and duplicate joins", async () => {
      await makeGroup(BNB, [B]);
      await expect(sm.connect(C).joinGroup(0, ethers.id("wrong"))).to.be.revertedWithCustomError(sm, "InvalidInvite");
      await expect(sm.connect(B).joinGroup(0, CODE)).to.be.revertedWithCustomError(sm, "AlreadyMember");
      await time.increase(8 * 86400);
      await expect(sm.connect(C).joinGroup(0, CODE)).to.be.revertedWithCustomError(sm, "InvalidInvite");
      await sm.connect(A).setInvite(0, await inviteHash(0, ethers.id("new")), await expiry());
      await sm.connect(C).joinGroup(0, ethers.id("new"));
      await sm.connect(A).setInvite(0, ethers.ZeroHash, 0);
      await expect(sm.connect(D).joinGroup(0, ethers.id("new"))).to.be.revertedWithCustomError(sm, "InvalidInvite");
      await expect(sm.connect(B).setInvite(0, ethers.ZeroHash, 0)).to.be.revertedWithCustomError(sm, "NotOrganizer");
    });
    it("invite hash is bound to the group id", async () => {
      await sm.connect(A).createGroup("g0", BNB, await inviteHash(0), await expiry());
      await sm.connect(A).createGroup("g1", BNB, await inviteHash(0), await expiry()); // hash for group 0 reused
      await expect(sm.connect(B).joinGroup(1, CODE)).to.be.revertedWithCustomError(sm, "InvalidInvite");
    });
    it("losing the Agent ID blocks new expenses but never blocks paying debts", async () => {
      await makeGroup();
      await sm.connect(A).addExpense(0, e(4), [A, B, C, D], [e(1), e(1), e(1), e(1)], ethers.ZeroHash);
      await aid.burn(B);
      await expect(sm.connect(B).addExpense(0, e(1), [A], [e(1)], ethers.ZeroHash)).to.be.revertedWithCustomError(
        sm,
        "NotAgentHolder",
      );
      await expect(sm.connect(B).settle(0, A, { value: e(1) })).to.emit(sm, "Settled");
    });
    it("caps members per group and groups per user", async () => {
      const wallets = Array.from({ length: 50 }, () => ethers.Wallet.createRandom().connect(ethers.provider));
      await sm.connect(A).createGroup("big", BNB, await inviteHash(0), await expiry());
      for (const w of wallets) {
        await A.sendTransaction({ to: w.address, value: e(1) });
        await aid.mint(w.address);
      }
      for (const w of wallets.slice(0, 49)) await sm.connect(w).joinGroup(0, CODE);
      await expect(sm.connect(wallets[49]).joinGroup(0, CODE)).to.be.revertedWithCustomError(sm, "GroupFull");
      for (let i = 1; i < 20; i++) await sm.connect(A).createGroup("g" + i, BNB, ethers.ZeroHash, 0);
      await expect(sm.connect(A).createGroup("g20", BNB, ethers.ZeroHash, 0)).to.be.revertedWithCustomError(
        sm,
        "TooManyGroups",
      );
    });
  });

  describe("BRD example: Da Lat trip", () => {
    it("computes net balances A+120 B+10 C-80 D-50 and settles via simplified plan", async () => {
      await makeGroup(usdt.target as string);
      // A pays room 200 for A,B,C,D ; B pays tour 90 for A,B,C
      await sm.connect(A).addExpense(0, e(200), [A, B, C, D], [e(50), e(50), e(50), e(50)], ethers.id("room"));
      await sm.connect(B).addExpense(0, e(90), [A, B, C], [e(30), e(30), e(30)], ethers.id("tour"));
      const [, bal] = await sm.getBalances(0);
      expect(bal).to.deep.equal([e(120), e(10), -e(80), -e(50)]);

      // Simplified plan from the BRD: C->A 70, C->B 10, D->A 50 (needs no pairwise debt)
      for (const s of [C, D]) await usdt.mint(s, e(1000));
      const pay = async (from: HardhatEthersSigner, to: HardhatEthersSigner, amt: bigint) => {
        await usdt.connect(from).approve(sm, amt); // exact approval only
        await expect(sm.connect(from).settleToken(0, to, amt))
          .to.emit(sm, "Settled")
          .withArgs(0, from.address, to.address, amt, from.address);
      };
      await pay(C, A, e(70));
      await pay(C, B, e(10));
      await pay(D, A, e(50));

      const [, after] = await sm.getBalances(0);
      expect(after).to.deep.equal([0n, 0n, 0n, 0n]);
      expect(await usdt.balanceOf(A)).to.equal(e(120));
      expect(await usdt.balanceOf(B)).to.equal(e(10));
      expect(await usdt.balanceOf(sm)).to.equal(0n);
      expect(await usdt.allowance(C, sm)).to.equal(0n);
    });
  });

  describe("expenses", () => {
    beforeEach(async () => {
      await makeGroup();
    });
    it("validates shares", async () => {
      await expect(sm.connect(A).addExpense(0, e(3), [A, B], [e(1), e(1)], ethers.ZeroHash)).to.be.revertedWithCustomError(
        sm,
        "InvalidShares",
      );
      await expect(sm.connect(A).addExpense(0, 0, [A], [0], ethers.ZeroHash)).to.be.revertedWithCustomError(
        sm,
        "InvalidShares",
      );
      await expect(sm.connect(A).addExpense(0, e(2), [B, B], [e(1), e(1)], ethers.ZeroHash)).to.be.revertedWithCustomError(
        sm,
        "InvalidShares",
      );
      await expect(sm.connect(A).addExpense(0, e(1), [A, B], [e(1)], ethers.ZeroHash)).to.be.revertedWithCustomError(
        sm,
        "InvalidShares",
      );
      await expect(sm.connect(A).addExpense(0, e(1), [X], [e(1)], ethers.ZeroHash)).to.be.revertedWithCustomError(
        sm,
        "NotMember",
      );
      await aid.mint(X);
      await expect(sm.connect(X).addExpense(0, e(1), [A], [e(1)], ethers.ZeroHash)).to.be.revertedWithCustomError(
        sm,
        "NotMember",
      );
    });
    it("stores expenses with metaHash only", async () => {
      await sm.connect(A).addExpense(0, e(2), [B, C], [e(1), e(1)], ethers.id("meta"));
      const ex = await sm.getExpense(0, 0);
      expect(ex.payer).to.equal(A.address);
      expect(ex.metaHash).to.equal(ethers.id("meta"));
      expect(ex.participants).to.deep.equal([B.address, C.address]);
      expect(await sm.expenseCount(0)).to.equal(1n);
      const g = await sm.getGroup(0);
      expect(g.numMembers).to.equal(4n);
      expect(g.numExpenses).to.equal(1n);
    });
    it("dispute removes only the disputer's share, within the window", async () => {
      await sm.connect(A).addExpense(0, e(3), [A, B, C], [e(1), e(1), e(1)], ethers.ZeroHash);
      await expect(sm.connect(B).disputeExpense(0, 0)).to.emit(sm, "ExpenseDisputed").withArgs(0, 0, B.address, e(1));
      expect(await sm.netBalance(0, B)).to.equal(0n);
      expect(await sm.netBalance(0, A)).to.equal(e(1));
      await expect(sm.connect(B).disputeExpense(0, 0)).to.be.revertedWithCustomError(sm, "AlreadyDisputed");
      await expect(sm.connect(A).disputeExpense(0, 0)).to.be.revertedWithCustomError(sm, "NotParticipant");
      await expect(sm.connect(D).disputeExpense(0, 0)).to.be.revertedWithCustomError(sm, "NotParticipant");
      await time.increase(3 * 86400 + 1);
      await expect(sm.connect(C).disputeExpense(0, 0)).to.be.revertedWithCustomError(sm, "DisputeWindowOver");
    });
    it("cancel reverses non-disputed shares", async () => {
      await sm.connect(A).addExpense(0, e(3), [A, B, C], [e(1), e(1), e(1)], ethers.ZeroHash);
      await sm.connect(B).disputeExpense(0, 0);
      await expect(sm.connect(B).cancelExpense(0, 0)).to.be.revertedWithCustomError(sm, "NotPayer");
      await sm.connect(A).cancelExpense(0, 0);
      for (const s of [A, B, C]) expect(await sm.netBalance(0, s)).to.equal(0n);
      await expect(sm.connect(A).cancelExpense(0, 0)).to.be.revertedWithCustomError(sm, "AlreadyCancelled");
      await expect(sm.connect(C).disputeExpense(0, 0)).to.be.revertedWithCustomError(sm, "AlreadyCancelled");
    });
    it("closed group blocks new expenses and joins but allows settlement", async () => {
      await sm.connect(A).addExpense(0, e(2), [B, C], [e(1), e(1)], ethers.ZeroHash);
      await expect(sm.connect(B).closeGroup(0)).to.be.revertedWithCustomError(sm, "NotOrganizer");
      await sm.connect(A).closeGroup(0);
      await expect(sm.connect(A).closeGroup(0)).to.be.revertedWithCustomError(sm, "GroupIsClosed");
      await expect(sm.connect(A).addExpense(0, e(1), [B], [e(1)], ethers.ZeroHash)).to.be.revertedWithCustomError(
        sm,
        "GroupIsClosed",
      );
      await expect(sm.connect(D).joinGroup(0, CODE)).to.be.revertedWithCustomError(sm, "GroupIsClosed");
      await expect(sm.connect(A).setInvite(0, ethers.ZeroHash, 0)).to.be.revertedWithCustomError(sm, "GroupIsClosed");
      await sm.connect(B).settle(0, A, { value: e(1) });
    });
  });

  describe("settlement", () => {
    beforeEach(async () => {
      await makeGroup();
      await sm.connect(A).addExpense(0, e(3), [A, B, C], [e(1), e(1), e(1)], ethers.ZeroHash);
    });
    it("settle forwards BNB directly to creditor and keeps nothing", async () => {
      await expect(sm.connect(B).settle(0, A, { value: e(1) })).to.changeEtherBalances(
        [B, A, sm],
        [-e(1), e(1), 0],
      );
      expect(await sm.netBalance(0, B)).to.equal(0n);
    });
    it("cannot overpay, pay a non-creditor, pay yourself or pay zero", async () => {
      await expect(sm.connect(B).settle(0, A, { value: e(2) })).to.be.revertedWithCustomError(sm, "ExceedsDebt");
      await expect(sm.connect(B).settle(0, C, { value: e(1) })).to.be.revertedWithCustomError(sm, "ExceedsDebt");
      await expect(sm.connect(D).settle(0, A, { value: e(1) })).to.be.revertedWithCustomError(sm, "ExceedsDebt");
      await expect(sm.connect(B).settle(0, B, { value: e(1) })).to.be.revertedWithCustomError(sm, "InvalidAmount");
      await expect(sm.connect(B).settle(0, A, { value: 0 })).to.be.revertedWithCustomError(sm, "InvalidAmount");
    });
    it("rejects wrong payment method", async () => {
      await expect(sm.connect(B).settleToken(0, A, e(1))).to.be.revertedWithCustomError(sm, "WrongPaymentMethod");
    });
    it("creditor can mark paid off-chain", async () => {
      await expect(sm.connect(A).markPaidOffChain(0, B, e(1)))
        .to.emit(sm, "PaidOffChain")
        .withArgs(0, B.address, A.address, e(1));
      expect(await sm.netBalance(0, B)).to.equal(0n);
      await expect(sm.connect(C).markPaidOffChain(0, B, e(1))).to.be.revertedWithCustomError(sm, "ExceedsDebt");
    });
    it("reverts if creditor refuses BNB (no funds stuck)", async () => {
      const R = await (await ethers.getContractFactory("RevertingReceiver")).deploy();
      await aid.mint(R);
      await R.join(sm, 0, CODE);
      await R.add(sm, 0, e(1), [D.address], [e(1)]);
      await expect(sm.connect(D).settle(0, R, { value: e(1) })).to.be.revertedWithCustomError(sm, "TransferFailed");
    });
  });

  describe("Agentic Wallet link + receive() channel", () => {
    async function link(owner = X) {
      await expect(sm.connect(owner).declareAgent(agent)).to.emit(sm, "AgentDeclared");
      const challenge = await sm.pendingChallenge(owner);
      expect(challenge).to.be.greaterThan(0n);
      expect(await sm.pendingLink(agent, challenge)).to.equal(owner.address);
      return challenge;
    }

    it("declare requires the agent to hold Agent ID", async () => {
      await expect(sm.connect(X).declareAgent(mallory)).to.be.revertedWithCustomError(sm, "NotAgentHolder");
      await expect(sm.connect(X).declareAgent(BNB)).to.be.revertedWithCustomError(sm, "InvalidAgent");
      await expect(sm.connect(agent).declareAgent(agent)).to.be.revertedWithCustomError(sm, "InvalidAgent");
    });

    it("agent verifies with exact challenge amount, gets a full refund; main wallet gains access", async () => {
      expect(await sm.isAgentHolder(X)).to.equal(false);
      const challenge = await link();
      expect(await sm.isAgentHolder(X)).to.equal(false); // not yet verified
      await expect(agent.sendTransaction({ to: sm, value: challenge }))
        .to.emit(sm, "AgentLinked")
        .withArgs(X.address, agent.address);
      expect(await ethers.provider.getBalance(sm)).to.equal(0n);
      expect(await sm.agentOwner(agent)).to.equal(X.address);
      expect(await sm.isAgentHolder(X)).to.equal(true);
      await sm.connect(X).createGroup("via agent", BNB, ethers.ZeroHash, 0);
      await sm.connect(X).setDisplayName("dung.ai");
      expect(await sm.displayName(X)).to.equal("dung.ai");
    });

    it("hijack attempt: another wallet declaring the same agent cannot steal the victim's proof", async () => {
      const victimChallenge = await link(X);
      await sm.connect(mallory).declareAgent(agent);
      const malloryChallenge = await sm.pendingChallenge(mallory);
      expect(malloryChallenge).to.not.equal(victimChallenge);
      await agent.sendTransaction({ to: sm, value: victimChallenge });
      expect(await sm.agentOwner(agent)).to.equal(X.address);
      expect(await sm.isAgentHolder(mallory)).to.equal(false);
      // once linked, nobody else can declare it
      await expect(sm.connect(mallory).declareAgent(agent)).to.be.revertedWithCustomError(sm, "InvalidAgent");
    });

    it("wrong amount from an unlinked address with no debts is rejected (nothing kept)", async () => {
      await link();
      await expect(agent.sendTransaction({ to: sm, value: 12345n })).to.be.revertedWithCustomError(
        sm,
        "NothingToSettle",
      );
    });

    it("linked agent pays owner's debts across creditors and gets the remainder back", async () => {
      const challenge = await link();
      await agent.sendTransaction({ to: sm, value: challenge });
      // group 0: A organizer, X joins, A and B each paid for X
      await sm.connect(A).createGroup("trip", BNB, await inviteHash(0), await expiry());
      await sm.connect(B).joinGroup(0, CODE);
      await sm.connect(X).joinGroup(0, CODE);
      await sm.connect(A).addExpense(0, e(2), [X], [e(2)], ethers.ZeroHash);
      await sm.connect(B).addExpense(0, e(1), [X], [e(1)], ethers.ZeroHash);

      await expect(agent.sendTransaction({ to: sm, value: e(5) })).to.changeEtherBalances(
        [agent, A, B, sm],
        [-e(3), e(2), e(1), 0],
      );
      expect(await sm.netBalance(0, X)).to.equal(0n);
      // nothing left to pay -> plain transfers bounce
      await expect(agent.sendTransaction({ to: sm, value: e(1) })).to.be.revertedWithCustomError(
        sm,
        "NothingToSettle",
      );
    });

    it("partial payment and USDT groups are skipped by receive()", async () => {
      await sm.connect(A).createGroup("usdt", usdt, await inviteHash(0), await expiry());
      await sm.connect(B).joinGroup(0, CODE);
      await sm.connect(A).addExpense(0, e(1), [B], [e(1)], ethers.ZeroHash);
      await sm.connect(A).createGroup("bnb", BNB, await inviteHash(1), await expiry());
      await sm.connect(B).joinGroup(1, CODE);
      await sm.connect(A).addExpense(1, e(2), [B], [e(2)], ethers.ZeroHash);
      // B pays directly from main wallet by plain transfer (no link needed)
      await expect(B.sendTransaction({ to: sm, value: e(0.5) }))
        .to.emit(sm, "Settled")
        .withArgs(1, B.address, A.address, e(0.5), B.address);
      expect(await sm.netBalance(1, B)).to.equal(-e(1.5));
      expect(await sm.netBalance(0, B)).to.equal(-e(1));
    });

    it("re-declare / unlink clears old link", async () => {
      const challenge = await link();
      await agent.sendTransaction({ to: sm, value: challenge });
      // re-declaring the same verified agent stays linked without a new challenge
      expect(await sm.connect(X).declareAgent.staticCall(agent)).to.equal(0n);
      await sm.connect(X).declareAgent(agent);
      expect(await sm.agentOwner(agent)).to.equal(X.address);
      await sm.connect(X).unlinkAgent();
      expect(await sm.agentOwner(agent)).to.equal(BNB);
      expect(await sm.isAgentHolder(X)).to.equal(false);
      await expect(sm.connect(X).unlinkAgent()).to.be.revertedWithCustomError(sm, "InvalidAgent");
      // pending challenge cleared on unlink
      const c2 = await link();
      await sm.connect(X).unlinkAgent();
      expect(await sm.pendingLink(agent, c2)).to.equal(BNB);
    });

    it("display name requires Agent ID and length limit", async () => {
      await expect(sm.connect(X).setDisplayName("x.ai")).to.be.revertedWithCustomError(sm, "NotAgentHolder");
      await expect(sm.connect(A).setDisplayName("a".repeat(65))).to.be.revertedWithCustomError(sm, "InvalidName");
    });
  });

  describe("randomized property tests (fuzz)", () => {
    it("balances always sum to zero and full settlement empties every balance", async function () {
      this.timeout(120_000);
      const signers = [A, B, C, D];
      await makeGroup();
      let seed = 42;
      const rnd = (n: number) => {
        seed = (seed * 1103515245 + 12345) % 2 ** 31;
        return seed % n;
      };
      for (let round = 0; round < 40; round++) {
        const payer = signers[rnd(4)];
        const parts = signers.filter(() => rnd(2) === 1);
        if (parts.length === 0) parts.push(signers[rnd(4)]);
        const amount = BigInt(1 + rnd(1_000_000)) * 10n ** BigInt(rnd(13));
        // uneven split with remainder dust to first participant
        const base = amount / BigInt(parts.length);
        const shares = parts.map(() => base);
        shares[0] += amount - base * BigInt(parts.length);
        await sm.connect(payer).addExpense(0, amount, parts, shares, ethers.ZeroHash);
        const [, bal] = await sm.getBalances(0);
        expect(bal.reduce((x, y) => x + y, 0n)).to.equal(0n);
      }
      // greedy settlement
      for (let i = 0; i < 10; i++) {
        const [mem, bal] = await sm.getBalances(0);
        const d = bal.findIndex((b) => b < 0n);
        if (d < 0) break;
        const c = bal.findIndex((b) => b > 0n);
        const amt = -bal[d] < bal[c] ? -bal[d] : bal[c];
        await sm.connect(signers[d]).settle(0, mem[c], { value: amt });
      }
      const [, fin] = await sm.getBalances(0);
      expect(fin.every((b) => b === 0n)).to.equal(true);
      expect(await ethers.provider.getBalance(sm)).to.equal(0n);
    });
  });

  describe("gas (NFR-14)", () => {
    it("settle() stays under 100k gas", async () => {
      await makeGroup();
      await sm.connect(A).addExpense(0, e(2), [B, C], [e(1), e(1)], ethers.ZeroHash);
      const tx = await sm.connect(B).settle(0, A, { value: e(1) });
      const r = await tx.wait();
      console.log("      settle gas:", r!.gasUsed.toString());
      expect(r!.gasUsed).to.be.lessThan(100_000n);
    });
  });
});
