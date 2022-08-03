const { ethers } = require("hardhat");
const fs = require("fs");

MOGIES_DUTCH_AUCTION = "0x251Ef619Bf16767A90cF63c286D17f741a28c2b8";

// [LOW, HIGH)
TOKEN_ID_LOW = 0;
TOKEN_ID_HIGH = 50;

ETH_PRICE = ethers.utils.parseEther("0.5");

const range = function* (start, stop, inclusive = false) {
  let dx = Math.sign(stop - start);
  if (inclusive) stop += dx;
  for (let x = start; x !== stop; x += dx) yield x;
};
const tokenAddresses = [];
const tokenIds = [];
const starsPrices = [];
const ethPrices = [];
const areStarsListings = [];
const areEthListings = [];

for (let i of range(TOKEN_ID_LOW, TOKEN_ID_HIGH)) {
  tokenAddresses.push(MOGIES_DUTCH_AUCTION);
  tokenIds.push(i);
  starsPrices.push(0);
  ethPrices.push(ETH_PRICE.toString());
  areStarsListings.push(0);
  areEthListings.push(1);
}

const output = {
  tokenAddresses: `[${tokenAddresses.join()}]`,
  tokenIds: `[${tokenIds.join()}]`,
  starsPrices: `[${starsPrices.join()}]`,
  ethPrices: `[${ethPrices.join()}]`,
  areStarsListings: `[${areStarsListings.join()}]`,
  areEthListings: `[${areEthListings.join()}]`,
};
fs.writeFileSync("etherscan_input.json", JSON.stringify(output), "utf8");
