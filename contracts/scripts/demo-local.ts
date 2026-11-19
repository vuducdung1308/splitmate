// Local demo data: the BRD Da Lat example (A pays room 200 for 4, B pays tour 90 for A,B,C).
import { ethers } from "hardhat";
import deployments from "../../web/src/lib/deployments.json";

async function main() {
  const d = (deployments as any)["31337"];
  const [A, B, C, D] = await ethers.getSigners();
  const sm = await ethers.getContractAt("SplitMate", d.splitMate);
  const code = ethers.id("demo-invite");
  const gid = await sm.groupCount();
  const hash = ethers.solidityPackedKeccak256(["uint256", "bytes32"], [gid, code]);
  const now = (await ethers.provider.getBlock("latest"))!.timestamp;
  await (await sm.connect(A).createGroup("Đà Lạt 12/2026", d.usdt, hash, now + 7 * 86400)).wait();
  const names = ["an.ai", "binh.ai", "chi.ai", "dung.ai"];
  for (const [i, s] of [A, B, C, D].entries()) {
    if (i > 0) await (await sm.connect(s).joinGroup(gid, code)).wait();
    await (await sm.connect(s).setDisplayName(names[i])).wait();
  }
  const e = ethers.parseEther;
  await (await sm.connect(A).addExpense(gid, e("200"), [A, B, C, D], [e("50"), e("50"), e("50"), e("50")], ethers.ZeroHash)).wait();
  await (await sm.connect(B).addExpense(gid, e("90"), [A, B, C], [e("30"), e("30"), e("30")], ethers.ZeroHash)).wait();
  const [, bal] = await sm.getBalances(gid);
  console.log("group", gid.toString(), "balances", bal.map((b) => ethers.formatEther(b)));
  console.log("invite link: /join?g=" + gid + "&c=" + code);
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
