GOERLI_ARGS = [
  "0xd48AcC28607eC1f9e3083E336D3a805AB5B545fc",
  "0x1F7283bEDAB59e843bA6671A95417244b532C3e6",
  10,
  1000,
  1,
  73414050,
  73414050,
  73414050,
  73414050,
  73414050,
  73414050,
];

module.exports = async ({ getNamedAccounts, deployments }) => {
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();
  await deploy("MogiesDutchAuction", {
    from: deployer,
    args: GOERLI_ARGS,
    log: true,
  });
};
module.exports.tags = ["MogiesDutchAuction"];
