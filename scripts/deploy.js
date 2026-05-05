const hre = require("hardhat");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying with:", deployer.address);

  const bal = await hre.ethers.provider.getBalance(deployer.address);
  console.log("Balance:", hre.ethers.formatEther(bal), "RITUAL\n");

  const SnakeGame = await hre.ethers.getContractFactory("SnakeGame");
  const contract = await SnakeGame.deploy();
  await contract.waitForDeployment();

  const addr = await contract.getAddress();
  console.log("✓ SnakeGame deployed:", addr);
  console.log("\nPaste this into public/index.html:");
  console.log(`  const CONTRACT_ADDRESS = '${addr}';`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
