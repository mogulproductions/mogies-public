require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();
require("hardhat-deploy");

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  namedAccounts: {
    deployer: {
      dev: 0,
      mainnet: 0,
      rinkeby: 0,
      kovan: 0,
      goerli: 0,
      bsc: 0,
      bscTestnet: 0,
    },
    owner: {
      dev: 0,
      mainnet: 0,
      rinkeby: 0,
      kovan: 0,
      goerli: 0,
      bsc: 0,
      bscTestnet: 0,
    },
  },
  networks: {
    // Uncomment for deployment
    // ropsten: {
    //   url: process.env.ROPSTEN_URL || "",
    //   accounts: [process.env.ROPSTEN_PRIVATE_KEY],
    // },
    // rinkeby: {
    //   url: process.env.RINKEBY_URL || "",
    //   accounts: [process.env.RINKEBY_PRIVATE_KEY],
    // },
    mainnet: {
      url: process.env.MAINNET_URL || "",
      accounts: [process.env.MAINNET_PRIVATE_KEY],
    },
    // bsc: {
    //   url: process.env.BSC_URL || "",
    //   accounts: [process.env.BSC_PRIVATE_KEY],
    // },
    // bscTestnet: {
    //   url: process.env.BSC_TESTNET_URL || "",
    //   accounts: [process.env.BSC_TESTNET_PRIVATE_KEY],
    // },
    goerli: {
      url: process.env.GOERLI_URL || "",
      accounts: [process.env.GOERLI_PRIVATE_KEY],
    },
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_KEY,
  },
  solidity: {
    compilers: [
      {
        version: "0.8.9",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    ],
  },
};
