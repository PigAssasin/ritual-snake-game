require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const pk = process.env.PRIVATE_KEY
  ? [`0x${process.env.PRIVATE_KEY.replace(/^0x/, "")}`]
  : [];

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.20",
    settings: { optimizer: { enabled: true, runs: 200 }, viaIR: true },
  },
  networks: {
    ritual: {
      url: "https://rpc.ritualfoundation.org",
      chainId: 1979,
      accounts: pk,
    },
  },
};
