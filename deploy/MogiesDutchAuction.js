GOERLI_ARGS = [
  "0xd48AcC28607eC1f9e3083E336D3a805AB5B545fc",
  "0x1F7283bEDAB59e843bA6671A95417244b532C3e6",
  10,
  ethers.utils.parseEther("1600"),
  ethers.utils.parseEther("0.015"),
  1704067200,
  1704067200,
  1704067200,
  1704067200,
  1704067200,
  1704067200,
];

MAINNET_ARGS = [
  "0xc55c2175E90A46602fD42e931f62B3Acc1A013Ca",
  "0x33B2488E94b076156fdFB38c8A5c837FE6937b8f", // GET OWNER
  10,
  ethers.utils.parseEther("1682.58"),
  ethers.utils.parseEther("0.01520595"),
  1704067200,
  1704067200,
  1704067200,
  1704067200,
  1704067200,
  1704067200,
];

module.exports = async ({ getNamedAccounts, deployments }) => {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  await deploy("MogiesDutchAuction", {
    from: deployer,
    args: MAINNET_ARGS,
    log: true,
  });
};
module.exports.tags = ["MogiesDutchAuction"];
