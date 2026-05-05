require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const pk = process.env.PRIVATE_KEY
  ? [`0x${process.env.PRIVATE_KEY.replace(/^0x/, "")}`]
  : [];

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: "0.8.20",
  networks: {
    ritual: {
      url: "https://rpc.ritualfoundation.org",
      chainId: 1979,
      accounts: pk,
    },
  },
};
