import { ethers, network, run } from "hardhat";
import fs from "fs";
import path from "path";

// BSC mainnet addresses from the campaign / BscScan
const MAINNET = {
  agentId: "0x60b9262456de011f7d15a54cdd8c48baaa8b022f",
  usdt: "0x55d398326f99059fF775485246999027B3197955",
};

async function main() {
  const [deployer] = await ethers.getSigners();
  const chainId = Number((await ethers.provider.getNetwork()).chainId);
  console.log(`Deploying on ${network.name} (${chainId}) from ${deployer.address}`);

  let agentId: string, usdt: string;
  let mocks = false;
  if (chainId === 56) {
    agentId = MAINNET.agentId;
    usdt = MAINNET.usdt;
  } else {
    // Testnet / local: deploy test-only mocks (open mint) so the flow can be exercised.
    mocks = true;
    const aid = await (await ethers.getContractFactory("MockAgentID")).deploy();
    await aid.waitForDeployment();
    const t = await (await ethers.getContractFactory("MockUSDT")).deploy();
    await t.waitForDeployment();
    agentId = await aid.getAddress();
    usdt = await t.getAddress();
    console.log("MockAgentID:", agentId, "\nMockUSDT:", usdt);
  }

  const sm = await (await ethers.getContractFactory("SplitMate")).deploy(agentId, usdt);
  const receipt = await (await sm.deploymentTransaction())!.wait();
  const address = await sm.getAddress();
  console.log("SplitMate:", address, "block", receipt!.blockNumber);

  const out = path.join(__dirname, "../../web/src/lib/deployments.json");
  const all = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, "utf8")) : {};
  all[chainId] = { splitMate: address, agentId, usdt, mocks, deployBlock: receipt!.blockNumber };
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(all, null, 2) + "\n");
  console.log("Wrote", out);

  if (chainId === 56 || chainId === 97) {
    console.log("Waiting before verification...");
    await new Promise((r) => setTimeout(r, 20_000));
    await run("verify:verify", { address, constructorArguments: [agentId, usdt] }).catch((e) =>
      console.warn("Verify failed (retry with `npx hardhat verify`):", e.message),
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
