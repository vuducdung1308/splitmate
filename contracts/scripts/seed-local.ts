// Local demo only: give the first 4 Hardhat accounts a mock Agent ID and mock USDT.
import { ethers } from "hardhat";
import deployments from "../../web/src/lib/deployments.json";

async function main() {
  const d = (deployments as any)["31337"];
  const signers = await ethers.getSigners();
  const aid = await ethers.getContractAt("MockAgentID", d.agentId);
  const usdt = await ethers.getContractAt("MockUSDT", d.usdt);
  for (const s of signers.slice(0, 4)) {
    await (await aid.mint(s.address)).wait();
    await (await usdt.mint(s.address, ethers.parseEther("1000"))).wait();
    console.log("seeded", s.address);
  }
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
