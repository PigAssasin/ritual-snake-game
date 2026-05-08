const hre = require('hardhat');

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log('Deploying with:', deployer.address);

  const bal = await hre.ethers.provider.getBalance(deployer.address);
  console.log('Balance:', hre.ethers.formatEther(bal), 'RITUAL\n');

  // ── SnakeGame ──
  const SnakeGame = await hre.ethers.getContractFactory('SnakeGame');
  const snakeGame = await SnakeGame.deploy();
  await snakeGame.waitForDeployment();
  const snakeAddr = await snakeGame.getAddress();
  console.log('✓ SnakeGame deployed:     ', snakeAddr);

  // ── ChronicleNFT ──
  const ChronicleNFT = await hre.ethers.getContractFactory('ChronicleNFT');
  const chronicle = await ChronicleNFT.deploy();
  await chronicle.waitForDeployment();
  const chronicleAddr = await chronicle.getAddress();
  console.log('✓ ChronicleNFT deployed:  ', chronicleAddr);

  console.log('\n── Paste into public/index.html ──────────────────────────');
  console.log(`const CONTRACT_ADDRESS      = '${snakeAddr}';`);
  console.log(`const CHRONICLE_NFT_ADDRESS = '${chronicleAddr}';`);

  console.log('\n── Paste into .env ───────────────────────────────────────');
  console.log(`CONTRACT_ADDRESS=${snakeAddr}`);
  console.log(`CHRONICLE_NFT_ADDRESS=${chronicleAddr}`);
}

main().catch(e => { console.error(e); process.exit(1); });
