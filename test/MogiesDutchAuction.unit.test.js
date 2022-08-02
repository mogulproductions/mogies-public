const { expect } = require("chai");
const { ethers } = require("hardhat");
const { parseEther, parseUnits, formatEther } = require("ethers/lib/utils");
const { BigNumber } = require("ethers");
const {
  advanceBlock,
  advanceBlockTo,
  latest,
  latestBlock,
  advanceTime,
  advanceTimeAndBlock,
  duration,
} = require("./utils/time");

const { MerkleTree } = require("merkletreejs");
const keccak256 = require("keccak256");

const {
  OWNABLE_ERROR,
  BEFORE_AUCTION_ERROR,
  AFTER_SALES_ERROR,
} = require("./constants/errors");

describe("Mogies dutch auction unit tests", () => {
  let botContract;
  let stars, dutchAuction;
  let adminAccount, userAccounts, mallery;
  let provider;

  const totalNfts = 1923;
  const auctionNfts = 1585;
  const maxBatchSize = 10;
  const zeroByte32 =
    "0x0000000000000000000000000000000000000000000000000000000000000000";
  const zeroAddress = ethers.constants.AddressZero;
  const acceptableGas = parseEther("0.001");
  // time
  let auctionSaleStartTime,
    whitelistStartTime,
    whitelistEndTime,
    publicSaleStartTime,
    publicSaleEndTime;

  const tier1StarsPrice = parseEther("74862");
  const tier2StarsPrice = parseEther("59889.6");
  const tier3StarsPrice = parseEther("44917.2");
  const tier4StarsPrice = parseEther("29944.8");
  const tier5StarsPrice = parseEther("14972.4");

  beforeEach(async () => {
    provider = ethers.provider;
    signers = await ethers.getSigners();
    adminAccount = signers[0];
    userAccounts = signers.slice(2, 20);
    mallery = signers[1];

    const MogiesDutchAuction = await ethers.getContractFactory(
      "MogiesDutchAuction"
    );
    const Stars = await ethers.getContractFactory("DummyStars");

    const BotContract = await ethers.getContractFactory("BuyBotMock");
    botContract = await BotContract.deploy();
    await botContract.deployed();

    stars = await Stars.deploy(
      [
        adminAccount.address,
        userAccounts[0].address,
        userAccounts[1].address,
        userAccounts[2].address,
        userAccounts[3].address,
        userAccounts[4].address,
        userAccounts[5].address,
        botContract.address,
      ],
      [
        ethers.utils.parseEther("4000010000000"),
        ethers.utils.parseEther("10000000"),
        ethers.utils.parseEther("20000000"),
        ethers.utils.parseEther("30000000"),
        ethers.utils.parseEther("30000000"),
        ethers.utils.parseEther("30000000"),
        ethers.utils.parseEther("30000000"),
        ethers.utils.parseEther("30000000"),
      ]
    );
    await stars.deployed();

    // time
    auctionSaleStartTime = await latest();
    auctionSaleEndTime = duration.days(5).add(auctionSaleStartTime);
    whitelistStartTime = duration.minutes(15).add(auctionSaleEndTime);
    whitelistEndTime = duration.days(4).add(whitelistStartTime);
    publicSaleStartTime = duration.minutes(15).add(whitelistEndTime);
    publicSaleEndTime = duration.days(4).add(publicSaleStartTime);

    dutchAuction = await MogiesDutchAuction.deploy(
      stars.address,
      adminAccount.address,
      maxBatchSize,
      ethers.utils.parseEther("3000"), // 1 eth = 1usd
      ethers.utils.parseEther("0.05"), // stars price,
      auctionSaleStartTime,
      auctionSaleEndTime,
      whitelistStartTime,
      whitelistEndTime,
      publicSaleStartTime,
      publicSaleEndTime
    );
    await dutchAuction.deployed();

    await (
      await stars.approve(
        dutchAuction.address,
        ethers.utils.parseEther("118656270")
      )
    ).wait();
  });

  describe("Init Deploy", async () => {
    // Init
    it("Should initialize properly", async () => {
      expect(await dutchAuction.owner(), "wrong ownner address").to.equal(
        adminAccount.address
      );
      expect(await dutchAuction.ethUSDPrice(), "wrong eth price").to.equal(
        ethers.utils.parseEther("3000")
      );
      expect(await dutchAuction.starsUSDPrice(), "wrong stars price").to.equal(
        ethers.utils.parseEther("0.05")
      );
      const saleC = await dutchAuction.saleConfig();
      expect(
        await saleC.auctionSaleStartTime,
        "wrong auction start time"
      ).to.equal(auctionSaleStartTime);
      expect(
        await saleC.whitelistSaleStartTime,
        "wrong whitelist start time"
      ).to.equal(whitelistStartTime);
      expect(
        await saleC.whitelistSaleEndTime,
        "wrong whitelist end time"
      ).to.equal(whitelistEndTime);
      expect(
        await saleC.publicSaleStartTime,
        "wrong public sale start time"
      ).to.equal(publicSaleStartTime);
      expect(
        await saleC.publicSaleEndTime,
        "wrong public sale end time"
      ).to.equal(publicSaleEndTime);
    });
  });

  describe("Admin Functions (only owner)", async () => {
    describe("Admin Mints", async () => {
      describe("earlyMint", async () => {
        beforeEach(async () => {
          const past = (await latest()).add(10);
          await dutchAuction
            .connect(adminAccount)
            .setAuctionSaleStartTime(past);
        });
        const amountToMint = 10;
        it("should mint", async () => {
          await dutchAuction
            .connect(adminAccount)
            .earlyMint(amountToMint, adminAccount.address);
          expect(await dutchAuction.balanceOf(adminAccount.address)).to.equal(
            amountToMint
          );
        });

        it("should not mint if too late to mint", async () => {
          const past = (await latest()).sub(10);
          await dutchAuction
            .connect(adminAccount)
            .setAuctionSaleStartTime(past);
          expect(
            dutchAuction
              .connect(adminAccount)
              .earlyMint(amountToMint, adminAccount.address)
          ).to.be.revertedWith(BEFORE_AUCTION_ERROR);
        });

        it("should not mint if too many have already been minted", async () => {
          await dutchAuction
            .connect(adminAccount)
            .earlyMint(auctionNfts, adminAccount.address);
          await expect(
            dutchAuction
              .connect(adminAccount)
              .earlyMint(1, adminAccount.address)
          ).to.be.revertedWith("too many already minted before early mint");
        });

        it("should not mint if not the owner", async () => {
          await expect(
            dutchAuction
              .connect(mallery)
              .earlyMint(amountToMint, adminAccount.address)
          ).to.be.revertedWith(OWNABLE_ERROR);
        });
      });

      describe("adminFinalMint", async () => {
        let past;
        beforeEach(async () => {
          past = (await latest()).sub(10);
          auctionPast = past.sub(duration.days(6));
          await dutchAuction.setAuctionSaleStartTime(auctionPast);
          await dutchAuction.setWhitelistSaleEndTime(past);
          await dutchAuction.setPublicSaleEndTime(past);
        });

        it("should mint all remaining mogies", async () => {
          await dutchAuction
            .connect(adminAccount)
            .adminFinalMint(adminAccount.address);
          expect(await dutchAuction.balanceOf(adminAccount.address)).to.equal(
            totalNfts
          );
        });

        it("should not mint if too early to mint", async () => {
          past = (await latest()).add(10);
          await dutchAuction.connect(adminAccount).setPublicSaleEndTime(past);
          await expect(
            dutchAuction.adminFinalMint(adminAccount.address)
          ).to.be.revertedWith(AFTER_SALES_ERROR);
        });

        it("should not mint if too many have already been minted", async () => {
          await dutchAuction.adminFinalMint(adminAccount.address);
          await expect(
            dutchAuction.adminFinalMint(adminAccount.address)
          ).to.be.revertedWith("nothing to mint");
        });

        it("should not mint if not the owner", async () => {
          await expect(
            dutchAuction.connect(mallery).adminFinalMint(adminAccount.address)
          ).to.be.revertedWith(OWNABLE_ERROR);
        });
      });
    });

    // toggle sales/reaveals
    it("Should allow the owner to toggle the reveal", async () => {
      const toggle = true;
      await dutchAuction.connect(adminAccount).setRevealed(toggle);
      expect(await dutchAuction.revealed()).to.equal(toggle);
    });

    it("Should allow the owner to set the public sale to true", async () => {
      await dutchAuction.connect(adminAccount).setPublicSale(true);
      expect((await dutchAuction.saleConfig()).hasPublicSale).to.be.true;
    });

    describe("Setters for auction and sales times", async () => {
      it("Should allow the owner to set auction sale start time", async () => {
        const block = await provider.getBlockNumber();
        const startTime = (await provider.getBlock(block)).timestamp;
        await dutchAuction
          .connect(adminAccount)
          .setAuctionSaleStartTime(startTime);
        expect((await dutchAuction.saleConfig()).auctionSaleStartTime).to.equal(
          startTime
        );
      });
      it("Should allow the owner to set the public sale on", async () => {
        await dutchAuction.connect(adminAccount).setPublicSale(true);
        expect((await dutchAuction.saleConfig()).hasPublicSale).to.be.true;
      });

      it("Should allow the owner to toggle the public sale off", async () => {
        await dutchAuction.connect(adminAccount).setPublicSale(false);
        expect((await dutchAuction.saleConfig()).hasPublicSale).to.be.false;
      });

      // Setting Times
      it("Should allow the owner to set auction sale start time", async () => {
        const block = await provider.getBlockNumber();
        const startTime = (await provider.getBlock(block)).timestamp;
        await dutchAuction
          .connect(adminAccount)
          .setAuctionSaleStartTime(startTime);
        expect((await dutchAuction.saleConfig()).auctionSaleStartTime).to.equal(
          startTime
        );
      });

      it("Should allow the owner to set whitelist sale start time", async () => {
        const block = await provider.getBlockNumber();
        const startTime = (await provider.getBlock(block)).timestamp;
        await dutchAuction
          .connect(adminAccount)
          .setWhitelistSaleStartTime(startTime);
        expect(
          (await dutchAuction.saleConfig()).whitelistSaleStartTime
        ).to.equal(startTime);
      });

      it("Should allow the owner to set public sale start time", async () => {
        const block = await provider.getBlockNumber();
        const startTime = (await provider.getBlock(block)).timestamp;
        await dutchAuction
          .connect(adminAccount)
          .setPublicSaleStartTime(startTime);
        expect((await dutchAuction.saleConfig()).publicSaleStartTime).to.equal(
          startTime
        );
      });

      it("Should allow the owner to set whitelist sale end time", async () => {
        const block = await provider.getBlockNumber();
        const endTime = (await provider.getBlock(block)).timestamp;
        await dutchAuction
          .connect(adminAccount)
          .setWhitelistSaleEndTime(endTime);
        expect((await dutchAuction.saleConfig()).whitelistSaleEndTime).to.equal(
          endTime
        );
      });

      it("Should allow the owner to set public sale end time", async () => {
        const block = await provider.getBlockNumber();
        const endTime = (await provider.getBlock(block)).timestamp;
        await dutchAuction.connect(adminAccount).setPublicSaleEndTime(endTime);
        expect((await dutchAuction.saleConfig()).publicSaleEndTime).to.equal(
          endTime
        );
      });

      it("Should allow the owner to batch set times", async () => {
        const block = await provider.getBlockNumber();
        const endTime = (await provider.getBlock(block)).timestamp;
        await dutchAuction
          .connect(adminAccount)
          .batchSetTimes(
            endTime,
            endTime + 1,
            endTime + 2,
            endTime + 3,
            endTime + 4,
            endTime + 5
          );

        expect((await dutchAuction.saleConfig()).auctionSaleStartTime).to.equal(
          endTime
        );
        expect((await dutchAuction.saleConfig()).auctionSaleEndTime).to.equal(
          endTime + 1
        );
        expect(
          (await dutchAuction.saleConfig()).whitelistSaleStartTime
        ).to.equal(endTime + 2);
        expect((await dutchAuction.saleConfig()).whitelistSaleEndTime).to.equal(
          endTime + 3
        );
        expect((await dutchAuction.saleConfig()).publicSaleStartTime).to.equal(
          endTime + 4
        );
        expect((await dutchAuction.saleConfig()).publicSaleEndTime).to.equal(
          endTime + 5
        );
      });
    });

    describe("URI tests", async () => {
      it("Should allow the owner to set the uri prefix", async () => {
        const uriPrefix = "randomString";
        await dutchAuction.connect(adminAccount).setUriPrefix(uriPrefix);
        expect(await dutchAuction.uriPrefix()).to.equal(uriPrefix);
      });

      it("Should allow the owner to set the uri prefix", async () => {
        const uriSuffix = ".txt";
        await dutchAuction.connect(adminAccount).setUriSuffix(uriSuffix);
        expect(await dutchAuction.uriSuffix()).to.equal(uriSuffix);
      });

      it("Should allow the owner to set the hidden metadata uri", async () => {
        const hiddenMetadataUri = "randomString";
        await dutchAuction
          .connect(adminAccount)
          .setHiddenMetadataUri(hiddenMetadataUri);
        expect(await dutchAuction.hiddenMetadataUri()).to.equal(
          hiddenMetadataUri
        );
      });
    });

    describe("Merkle tree", async () => {
      it("Should allow the owner to set the merkle root", async () => {
        const array = [
          userAccounts[0].address,
          userAccounts[1].address,
          userAccounts[2].address,
        ];
        const leafNodes = array.map((addr) => keccak256(addr));
        const merkleTree = new MerkleTree(leafNodes, keccak256, {
          sortPairs: true,
        });
        const root = merkleTree.getRoot();

        await dutchAuction.connect(adminAccount).setAllowListMerkleRoot(root);

        expect(await dutchAuction.allowListMerkleRoot()).to.equal(
          "0x" + root.toString("hex")
        );
      });
    });

    describe("Auction Prices Setters", async () => {
      describe("Setting ETH USD Price", async () => {
        it("Should allow the owner to change the ETH starting price before auction", async () => {
          await dutchAuction
            .connect(adminAccount)
            .setAuctionSaleStartTime(duration.minutes(15).add(await latest()));
          const newEthPrice = ethers.utils.parseEther("4000");
          await dutchAuction.connect(adminAccount).setEthUsdPrice(newEthPrice);
          expect(await dutchAuction.ethUSDPrice()).to.equal(newEthPrice);
        });
        it("Should throw if trying to change the ETH starting price after auction started", async () => {
          const newEthPrice = ethers.utils.parseEther("4000");
          await expect(
            dutchAuction.connect(adminAccount).setEthUsdPrice(newEthPrice)
          ).to.be.revertedWith("sale has already started");
        });
        it("Should throw if trying to change the ETH starting price if not owner", async () => {
          await dutchAuction
            .connect(adminAccount)
            .setAuctionSaleStartTime(duration.minutes(15).add(await latest()));
          const newEthPrice = ethers.utils.parseEther("4000");
          await expect(
            dutchAuction.connect(userAccounts[0]).setEthUsdPrice(newEthPrice)
          ).to.be.revertedWith(OWNABLE_ERROR);
        });
      });

      describe("Setting STARS USD Price", async () => {
        it("Should allow the owner to change the STARS starting price before auction", async () => {
          await dutchAuction
            .connect(adminAccount)
            .setAuctionSaleStartTime(duration.minutes(15).add(await latest()));
          const newStarsPrice = ethers.utils.parseEther("0.02");
          await dutchAuction
            .connect(adminAccount)
            .setStarsUsdPrice(newStarsPrice);
          expect(await dutchAuction.starsUSDPrice()).to.equal(newStarsPrice);
        });
        it("Should throw if trying to change the STARS starting price after auction started", async () => {
          const newStarsPrice = ethers.utils.parseEther("0.02");
          await expect(
            dutchAuction.connect(adminAccount).setStarsUsdPrice(newStarsPrice)
          ).to.be.revertedWith("sale has already started");
        });
        it("Should throw if trying to change the STARS starting price if not owner", async () => {
          await dutchAuction
            .connect(adminAccount)
            .setAuctionSaleStartTime(duration.minutes(15).add(await latest()));
          const newStarsPrice = ethers.utils.parseEther("0.02");
          await expect(
            dutchAuction
              .connect(userAccounts[0])
              .setStarsUsdPrice(newStarsPrice)
          ).to.be.revertedWith(OWNABLE_ERROR);
        });
      });

      describe("Setting ETH Auction Parameters", async () => {
        it("Should allow the owner to change the ETH start, end, and step price before auction", async () => {
          await dutchAuction
            .connect(adminAccount)
            .setAuctionSaleStartTime(duration.minutes(15).add(await latest()));
          const newEthStartPrice = ethers.utils.parseEther("2");
          const newEthEndPrice = ethers.utils.parseEther("0.5");
          const newEthStepPrice = ethers.utils.parseEther("0.1");
          await dutchAuction
            .connect(adminAccount)
            .setAuctionEthParams(
              newEthStartPrice,
              newEthEndPrice,
              newEthStepPrice
            );
          expect(await dutchAuction.AUCTION_START_ETH_PRICE()).to.equal(
            newEthStartPrice
          );
          expect(await dutchAuction.AUCTION_END_ETH_PRICE()).to.equal(
            newEthEndPrice
          );
          expect(await dutchAuction.AUCTION_DROP_PER_STEP_ETH()).to.equal(
            newEthStepPrice
          );
        });

        it("Should throw if trying to change the ETH start, end, and step price after auction started", async () => {
          const newEthStartPrice = ethers.utils.parseEther("2");
          const newEthEndPrice = ethers.utils.parseEther("0.5");
          const newEthStepPrice = ethers.utils.parseEther("0.1");
          await expect(
            dutchAuction
              .connect(adminAccount)
              .setAuctionEthParams(
                newEthStartPrice,
                newEthEndPrice,
                newEthStepPrice
              )
          ).to.be.revertedWith("sale has already started");
        });

        it("Should throw if not owner and trying to change the ETH start, end, and step price", async () => {
          await dutchAuction
            .connect(adminAccount)
            .setAuctionSaleStartTime(duration.minutes(15).add(await latest()));
          const newEthStartPrice = ethers.utils.parseEther("2");
          const newEthEndPrice = ethers.utils.parseEther("0.5");
          const newEthStepPrice = ethers.utils.parseEther("0.1");
          await expect(
            dutchAuction
              .connect(userAccounts[0])
              .setAuctionEthParams(
                newEthStartPrice,
                newEthEndPrice,
                newEthStepPrice
              )
          ).to.be.revertedWith(OWNABLE_ERROR);
        });
      });

      describe("Setting STARS Auction Parameters", async () => {
        it("Should allow the owner to change the STARS start, end, and step price before auction", async () => {
          await dutchAuction
            .connect(adminAccount)
            .setAuctionSaleStartTime(duration.minutes(15).add(await latest()));
          const newStarsStartPrice = ethers.utils.parseEther("100000");
          const newStarsEndPrice = ethers.utils.parseEther("10");
          const newStarsStepPrice = ethers.utils.parseEther("5050");
          await dutchAuction
            .connect(adminAccount)
            .setAuctionStarsParams(
              newStarsStartPrice,
              newStarsEndPrice,
              newStarsStepPrice
            );
          expect(await dutchAuction.AUCTION_START_STARS_PRICE()).to.equal(
            newStarsStartPrice
          );
          expect(await dutchAuction.AUCTION_END_STARS_PRICE()).to.equal(
            newStarsEndPrice
          );
          expect(await dutchAuction.AUCTION_DROP_PER_STEP_STARS()).to.equal(
            newStarsStepPrice
          );
        });

        it("Should throw if trying to change the ETH start, end, and step price after auction started", async () => {
          const newStarsStartPrice = ethers.utils.parseEther("100000");
          const newStarsEndPrice = ethers.utils.parseEther("10");
          const newStarsStepPrice = ethers.utils.parseEther("5050");
          await expect(
            dutchAuction
              .connect(adminAccount)
              .setAuctionEthParams(
                newStarsStartPrice,
                newStarsEndPrice,
                newStarsStepPrice
              )
          ).to.be.revertedWith("sale has already started");
        });

        it("Should throw if not owner and trying to change the ETH start, end, and step price", async () => {
          await dutchAuction
            .connect(adminAccount)
            .setAuctionSaleStartTime(duration.minutes(15).add(await latest()));
          const newStarsStartPrice = ethers.utils.parseEther("100000");
          const newStarsEndPrice = ethers.utils.parseEther("10");
          const newStarsStepPrice = ethers.utils.parseEther("5050");
          await expect(
            dutchAuction
              .connect(userAccounts[0])
              .setAuctionEthParams(
                newStarsStartPrice,
                newStarsEndPrice,
                newStarsStepPrice
              )
          ).to.be.revertedWith(OWNABLE_ERROR);
        });
      });
    });

    // Dev Mint
    it("Should allow the owner to mint the amount for devs/team", async () => {
      const amountToMint = 10;
      await dutchAuction
        .connect(adminAccount)
        .devMint(amountToMint, adminAccount.address);
      expect(await dutchAuction.balanceOf(adminAccount.address)).to.equal(
        amountToMint
      );
    });

    // withdraw eth from contract
    it("Should allow the owner to withdraw eth from the contract", async () => {
      await dutchAuction
        .connect(adminAccount)
        .setPublicSaleStartTime(await latest());
      await dutchAuction.connect(adminAccount).setPublicSale(true);
      // make a purchase
      await dutchAuction.connect(userAccounts[0]).publicSaleMint(1, false, {
        value: ethers.utils.parseUnits("1", "ether"),
      });

      const beforeAmount = await provider.getBalance(adminAccount.address);
      await dutchAuction.connect(adminAccount).withdrawMoney();
      const afterAmount = await provider.getBalance(adminAccount.address);
      expect(afterAmount.sub(beforeAmount)).to.be.within(
        parseEther("1").sub(acceptableGas),
        parseEther("1")
      );
    });
  });

  describe("View Functions", async () => {
    // public sale
    it("Should return false if the public sale is off", async () => {
      expect(
        await dutchAuction.connect(userAccounts[0]).isPublicSaleOn()
      ).to.equal(false);
    });

    it("Should return true if the public sale is on", async () => {
      const block = await provider.getBlockNumber();
      const startTime = (await provider.getBlock(block)).timestamp;
      await dutchAuction.setPublicSaleStartTime(startTime);
      await dutchAuction.setPublicSale(true);

      expect(
        await dutchAuction.connect(userAccounts[0]).isPublicSaleOn()
      ).to.equal(true);
    });

    // whitelist
    it("Should return true if address in whitelist", async () => {
      const array = [
        userAccounts[0].address,
        userAccounts[1].address,
        userAccounts[2].address,
      ];

      const leafNodes = array.map((addr) => keccak256(addr));
      const merkleTree = new MerkleTree(leafNodes, keccak256, {
        sortPairs: true,
      });
      const root = merkleTree.getRoot();
      const proof = merkleTree.getHexProof(leafNodes[0]);

      await dutchAuction.connect(adminAccount).setAllowListMerkleRoot(root);

      expect(
        await dutchAuction
          .connect(adminAccount)
          .isAllowListed(proof, userAccounts[0].address)
      ).to.equal(true);
    });
    it("Should return false if address not in whitelist", async () => {
      const array = [
        userAccounts[0].address,
        userAccounts[1].address,
        userAccounts[2].address,
      ];

      const leafNodes = array.map((addr) => keccak256(addr));
      const merkleTree = new MerkleTree(leafNodes, keccak256, {
        sortPairs: true,
      });
      const root = merkleTree.getRoot();
      const proof = merkleTree.getHexProof(leafNodes[0]);

      await dutchAuction.connect(adminAccount).setAllowListMerkleRoot(root);

      expect(
        await dutchAuction
          .connect(adminAccount)
          .isAllowListed(proof, userAccounts[3].address)
      ).to.be.false;
    });
  });

  describe("Basic Functions", async () => {
    describe("Views", async () => {
      beforeEach(async () => {
        stars
          .connect(userAccounts[0])
          .approve(dutchAuction.address, parseEther("74862"));
        const hiddenMetadataUri = "hiddenString";
        const uriPrefix = "randomString";
        await dutchAuction
          .connect(adminAccount)
          .setHiddenMetadataUri(hiddenMetadataUri);
        await dutchAuction.connect(adminAccount).setUriPrefix(uriPrefix);
      });

      it("Should allow a user to see minted token uri if not revealed", async () => {
        const hiddenMetadataUri = "hiddenString";
        const startTime = await latest();
        await dutchAuction
          .connect(adminAccount)
          .setAuctionSaleStartTime(startTime);

        await dutchAuction.connect(userAccounts[0]).auctionMint(1, false, {
          value: ethers.utils.parseUnits("1", "ether"),
        });

        const res = await dutchAuction.tokenURI(0);
        expect(res).to.equal(hiddenMetadataUri);
      });
      it("Should allow a user to see minted token uri if revealed", async () => {
        const uriPrefix = "randomString0.json";
        await dutchAuction.connect(adminAccount).setRevealed(true);
        const startTime = await latest();
        await dutchAuction
          .connect(adminAccount)
          .setAuctionSaleStartTime(startTime);

        await dutchAuction.connect(userAccounts[0]).auctionMint(1, false, {
          value: ethers.utils.parseUnits("1", "ether"),
        });

        const res = await dutchAuction.tokenURI(0);
        expect(res).to.equal(uriPrefix);
      });
    });
    describe("Auction mint", async () => {
      beforeEach(() => {
        stars
          .connect(userAccounts[0])
          .approve(dutchAuction.address, parseEther("224586"));
      });

      it("Should allow a user to mint during auction with eth", async () => {
        const startTime = await latest();
        await dutchAuction
          .connect(adminAccount)
          .setAuctionSaleStartTime(startTime);

        const beforeEthBal = await provider.getBalance(userAccounts[0].address);

        await dutchAuction.connect(userAccounts[0]).auctionMint(1, false, {
          value: ethers.utils.parseUnits("1", "ether"),
        });

        const finalEthBal = await provider.getBalance(userAccounts[0].address);

        expect(beforeEthBal.sub(finalEthBal)).to.be.within(
          parseEther("1"),
          parseEther("1").add(acceptableGas)
        );
      });

      it("Should allow a user to mint during auction with stars", async () => {
        const startTime = await latest();
        await dutchAuction
          .connect(adminAccount)
          .setAuctionSaleStartTime(startTime);

        const beforeStarsBal = await stars.balanceOf(userAccounts[0].address);

        await dutchAuction.connect(userAccounts[0]).auctionMint(1, true);

        const finalStarsBal = await stars.balanceOf(userAccounts[0].address);

        // assuming 1 star as price
        expect(beforeStarsBal.sub(finalStarsBal)).to.equal(tier1StarsPrice);
      });

      describe("Auction prices", async () => {
        describe("ETH", async () => {
          it("Should return 1 eth price at first step", async () => {
            const startTime = await latest();
            await dutchAuction
              .connect(adminAccount)
              .setAuctionSaleStartTime(startTime);
            const price = await dutchAuction.getAuctionPrice(startTime, false);
            expect(price).to.equal(parseEther("1"));
          });

          it("Should return 0.8 eth price at second step", async () => {
            const startTime = await latest();
            await dutchAuction
              .connect(adminAccount)
              .setAuctionSaleStartTime(startTime);
            await advanceTimeAndBlock(duration.days(1).toNumber());
            const price = await dutchAuction.getAuctionPrice(startTime, false);
            expect(price).to.equal(parseEther("0.8"));
          });
          it("Should return 0.6 eth price at third step", async () => {
            const startTime = await latest();
            await dutchAuction
              .connect(adminAccount)
              .setAuctionSaleStartTime(startTime);
            await advanceTimeAndBlock(duration.days(2).toNumber());
            const price = await dutchAuction.getAuctionPrice(startTime, false);
            expect(price).to.equal(parseEther("0.6"));
          });
          it("Should return 0.4 eth price at fourth step", async () => {
            const startTime = await latest();
            await dutchAuction
              .connect(adminAccount)
              .setAuctionSaleStartTime(startTime);
            await advanceTimeAndBlock(duration.days(3).toNumber());
            const price = await dutchAuction.getAuctionPrice(startTime, false);
            expect(price).to.equal(parseEther("0.4"));
          });
          it("Should return 0.2 eth price at last step", async () => {
            const startTime = await latest();
            await dutchAuction
              .connect(adminAccount)
              .setAuctionSaleStartTime(startTime);
            await advanceTimeAndBlock(duration.days(4).toNumber());
            const price = await dutchAuction.getAuctionPrice(startTime, false);
            expect(price).to.equal(parseEther("0.2"));
          });
          it("Should return 0.2 eth price past the last step", async () => {
            const startTime = await latest();
            await dutchAuction
              .connect(adminAccount)
              .setAuctionSaleStartTime(startTime);
            await advanceTimeAndBlock(duration.days(10).toNumber());
            const price = await dutchAuction.getAuctionPrice(startTime, false);
            expect(price).to.equal(parseEther("0.2"));
          });
        });

        //TODO: change accordingly once know stars prices
        describe("STARS", async () => {
          it("Should return 74862 stars price at first step", async () => {
            const startTime = await latest();
            await dutchAuction
              .connect(adminAccount)
              .setAuctionSaleStartTime(startTime);
            const price = await dutchAuction.getAuctionPrice(startTime, true);
            expect(price).to.equal(tier1StarsPrice);
          });

          it("Should return 59,889.6 stars price at second step", async () => {
            const startTime = await latest();
            await dutchAuction
              .connect(adminAccount)
              .setAuctionSaleStartTime(startTime);
            await advanceTimeAndBlock(await duration.days(1).toNumber());
            const price = await dutchAuction.getAuctionPrice(startTime, true);
            expect(price).to.equal(tier2StarsPrice);
          });
          it("Should return 44,917.2 stars price at third step", async () => {
            const startTime = await latest();
            await dutchAuction
              .connect(adminAccount)
              .setAuctionSaleStartTime(startTime);
            await advanceTimeAndBlock(await duration.days(2).toNumber());
            const price = await dutchAuction.getAuctionPrice(startTime, true);
            expect(price).to.equal(tier3StarsPrice);
          });
          it("Should return 29,944.8 stars price at fourth step", async () => {
            const startTime = await latest();
            await dutchAuction
              .connect(adminAccount)
              .setAuctionSaleStartTime(startTime);
            await advanceTimeAndBlock(await duration.days(3).toNumber());
            const price = await dutchAuction.getAuctionPrice(startTime, true);
            expect(price).to.equal(tier4StarsPrice);
          });
          it("Should return 14,972.4 stars price at last step", async () => {
            const startTime = await latest();
            await dutchAuction
              .connect(adminAccount)
              .setAuctionSaleStartTime(startTime);
            await advanceTimeAndBlock(await duration.days(4).toNumber());
            const price = await dutchAuction.getAuctionPrice(startTime, true);
            expect(price).to.equal(tier5StarsPrice);
          });
          it("Should return 14,972.4 stars price past the last step", async () => {
            const startTime = await latest();
            await dutchAuction
              .connect(adminAccount)
              .setAuctionSaleStartTime(startTime);
            await advanceTimeAndBlock(await duration.days(10).toNumber());
            const price = await dutchAuction.getAuctionPrice(startTime, true);
            expect(price).to.equal(parseEther("14972.4"));
          });
        });

        it("Should allow a user to mint during all 5 tiers of an auction", async () => {
          // tier 1
          const startTime = await latest();
          await dutchAuction
            .connect(adminAccount)
            .setAuctionSaleStartTime(startTime);
          let beforeStarsBal = await stars.balanceOf(userAccounts[0].address);
          await dutchAuction.connect(userAccounts[0]).auctionMint(1, true);
          let finalStarsBal = await stars.balanceOf(userAccounts[0].address);
          expect(beforeStarsBal.sub(finalStarsBal)).to.equal(
            tier1StarsPrice,
            "tier 1 stars failed - price 1"
          );

          // tier 2
          beforeStarsBal = finalStarsBal;
          await advanceTimeAndBlock(duration.days(1).toNumber());
          await dutchAuction.connect(userAccounts[0]).auctionMint(1, true);
          finalStarsBal = await stars.balanceOf(userAccounts[0].address);
          expect(beforeStarsBal.sub(finalStarsBal)).to.equal(
            tier2StarsPrice,
            "tier 2 stars failed - price 0.8"
          );

          // tier 3
          beforeStarsBal = finalStarsBal;
          await advanceTimeAndBlock(duration.days(1).toNumber());
          await dutchAuction.connect(userAccounts[0]).auctionMint(1, true);
          finalStarsBal = await stars.balanceOf(userAccounts[0].address);
          expect(beforeStarsBal.sub(finalStarsBal)).to.equal(
            tier3StarsPrice,
            "tier 3 stars failed - price 0.6"
          );

          // tier 4
          beforeStarsBal = finalStarsBal;
          await advanceTimeAndBlock(duration.days(1).toNumber());
          await dutchAuction.connect(userAccounts[0]).auctionMint(1, true);
          finalStarsBal = await stars.balanceOf(userAccounts[0].address);
          expect(beforeStarsBal.sub(finalStarsBal)).to.equal(
            tier4StarsPrice,
            "tier 4 stars failed - price 0.4"
          );

          // tier 5
          beforeStarsBal = finalStarsBal;
          await advanceTimeAndBlock(duration.days(1).toNumber());
          await dutchAuction.connect(userAccounts[0]).auctionMint(1, true);
          finalStarsBal = await stars.balanceOf(userAccounts[0].address);
          expect(beforeStarsBal.sub(finalStarsBal)).to.equal(
            tier5StarsPrice,
            "tier 5 stars failed - price 0.2"
          );
        });
      });
    });

    it("Should be able to getBuyerList with multiple users", async () => {
      // tier 1
      const startTime = await latest();
      await dutchAuction
        .connect(adminAccount)
        .setAuctionSaleStartTime(startTime);
      await dutchAuction.connect(userAccounts[0]).auctionMint(1, false, {
        value: ethers.utils.parseUnits("1", "ether"),
      });
      await dutchAuction.connect(userAccounts[1]).auctionMint(1, false, {
        value: ethers.utils.parseUnits("1", "ether"),
      });
      await dutchAuction.connect(userAccounts[2]).auctionMint(1, false, {
        value: ethers.utils.parseUnits("1", "ether"),
      });
      const buyerList = await dutchAuction.getBuyerList(0);
      expect(buyerList[0], "1st buyer wrong").to.equal(
        userAccounts[0].address.toString()
      );
      expect(buyerList[1], "2nd buyer wrong").to.equal(
        userAccounts[1].address.toString()
      );
      expect(buyerList[2], "3rd buyer wrong").to.equal(
        userAccounts[2].address.toString()
      );
    });

    describe("Whitelist mint", async () => {
      beforeEach(async () => {
        stars
          .connect(userAccounts[0])
          .approve(dutchAuction.address, parseEther("74862"));
      });

      it("Should allow a whitelisted user to mint with stars", async () => {
        const array = [
          userAccounts[0].address,
          userAccounts[1].address,
          userAccounts[2].address,
        ];

        const leafNodes = array.map((addr) => keccak256(addr));
        const merkleTree = new MerkleTree(leafNodes, keccak256, {
          sortPairs: true,
        });
        const root = merkleTree.getRoot();
        const proof = merkleTree.getHexProof(leafNodes[0]);

        await dutchAuction.connect(adminAccount).setAllowListMerkleRoot(root);
        const startTime = await latest();
        const endTime = duration.hours(1).add(startTime);

        await dutchAuction
          .connect(adminAccount)
          .setWhitelistSaleStartTime(startTime);
        await dutchAuction
          .connect(adminAccount)
          .setWhitelistSaleEndTime(endTime);

        const beforeStarsBal = await stars.balanceOf(userAccounts[0].address);

        await dutchAuction
          .connect(userAccounts[0])
          .allowlistMint(1, true, proof);

        const finalStarsBal = await stars.balanceOf(userAccounts[0].address);
        expect(beforeStarsBal.sub(finalStarsBal)).to.equal(tier1StarsPrice);
      });

      it("Should allow a whitelisted user to mint with eth", async () => {
        const array = [
          userAccounts[0].address,
          userAccounts[1].address,
          userAccounts[2].address,
        ];

        const leafNodes = array.map((addr) => keccak256(addr));
        const merkleTree = new MerkleTree(leafNodes, keccak256, {
          sortPairs: true,
        });
        const root = merkleTree.getRoot();
        const proof = merkleTree.getHexProof(leafNodes[0]);

        await dutchAuction.connect(adminAccount).setAllowListMerkleRoot(root);
        const startTime = await latest();
        const endTime = duration.hours(1).add(startTime);

        await dutchAuction
          .connect(adminAccount)
          .setWhitelistSaleStartTime(startTime);
        await dutchAuction
          .connect(adminAccount)
          .setWhitelistSaleEndTime(endTime);

        const beforeEthBal = await provider.getBalance(userAccounts[0].address);

        await dutchAuction
          .connect(userAccounts[0])
          .allowlistMint(1, false, proof, {
            value: ethers.utils.parseUnits("1", "ether"),
          });

        const finalEthBal = await provider.getBalance(userAccounts[0].address);

        expect(beforeEthBal.sub(finalEthBal)).to.be.within(
          parseEther("1"),
          parseEther("1").add(acceptableGas)
        );
      });
    });

    describe("Public Mint", async () => {
      it("Should allow anyone to mint with eth during public mint", async () => {
        const startTime = await latest();

        await dutchAuction
          .connect(adminAccount)
          .setPublicSaleStartTime(startTime);
        await dutchAuction.connect(adminAccount).setPublicSale(true);

        const beforeEthBal = await provider.getBalance(userAccounts[0].address);

        await dutchAuction.connect(userAccounts[0]).publicSaleMint(1, false, {
          value: ethers.utils.parseUnits("1", "ether"),
        });

        const finalEthBal = await provider.getBalance(userAccounts[0].address);

        expect(beforeEthBal.sub(finalEthBal)).to.be.within(
          parseEther("1"),
          parseEther("1").add(acceptableGas)
        );
      });
      it("Should allow anyone to mint with stars during public mint", async () => {
        const startTime = await latest();
        stars
          .connect(userAccounts[0])
          .approve(dutchAuction.address, tier1StarsPrice);
        await dutchAuction
          .connect(adminAccount)
          .setPublicSaleStartTime(startTime);
        await dutchAuction.connect(adminAccount).setPublicSale(true);

        const beforeStarsBal = await stars.balanceOf(userAccounts[0].address);

        await dutchAuction.connect(userAccounts[0]).publicSaleMint(1, true);

        const finalStarsBal = await stars.balanceOf(userAccounts[0].address);
        expect(beforeStarsBal.sub(finalStarsBal)).to.equal(tier1StarsPrice);
      });
    });

    describe("Bonus Mints", async () => {
      beforeEach(async () => {
        const auctionStartTime = await latest();
        await dutchAuction
          .connect(adminAccount)
          .setAuctionSaleStartTime(auctionStartTime);
        const whitelistStartTime = duration.days(6).add(auctionStartTime);
        const whitelistEndTime = duration.days(1).add(whitelistStartTime);

        await dutchAuction
          .connect(adminAccount)
          .setWhitelistSaleStartTime(whitelistStartTime);
        await dutchAuction
          .connect(adminAccount)
          .setWhitelistSaleEndTime(whitelistEndTime);

        const publicStartTime = duration.days(1).add(whitelistEndTime);
        const publicEndTime = duration.days(1).add(publicStartTime);

        await dutchAuction
          .connect(adminAccount)
          .setPublicSaleStartTime(publicStartTime);
        await dutchAuction
          .connect(adminAccount)
          .setPublicSaleEndTime(publicEndTime);
      });

      describe("mintRemaining", async () => {
        beforeEach(async () => {
          // dev mint
          const amountToMint = 50;
          await dutchAuction
            .connect(adminAccount)
            .devMint(amountToMint, adminAccount.address);
        });

        it("Should allow users to mint remaining from auction (8 users, 10 remaining)", async () => {
          // 7 users to be tier 1
          // 0 - 6 mint tier 1,
          for (let i = 0; i < 7; i++) {
            await dutchAuction.connect(userAccounts[i]).auctionMint(1, false, {
              value: ethers.utils.parseUnits("1", "ether"),
            });
          }
          // next day
          await advanceTimeAndBlock(await duration.days(1).toNumber());
          await dutchAuction.connect(userAccounts[7]).auctionMint(1573, false, {
            value: ethers.utils.parseUnits("1573", "ether"),
          });

          // advance to day 2
          await advanceTimeAndBlock(await duration.days(7).toNumber());

          await dutchAuction.connect(adminAccount).setPublicSale(true);
          // 7 to mint tier 2,
          await dutchAuction
            .connect(userAccounts[10])
            .publicSaleMint(283, false, {
              value: ethers.utils.parseUnits("283", "ether"),
            });
          // advance time to after public
          await advanceTimeAndBlock(await duration.days(2).toNumber());

          // let users mint
          for (let i = 0; i < 8; i++) {
            await dutchAuction.connect(userAccounts[i]).mintRemaining();
          }
          //user amounts
          // 5 remaining, first 5 should get +1 each, after each minted 1 during tier1
          expect(
            await dutchAuction.balanceOf(userAccounts[0].address),
            "user 1"
          ).to.equal(3);
          expect(
            await dutchAuction.balanceOf(userAccounts[1].address),
            "user 2"
          ).to.equal(3);
          expect(
            await dutchAuction.balanceOf(userAccounts[2].address),
            "user 3"
          ).to.equal(2);
          expect(
            await dutchAuction.balanceOf(userAccounts[3].address),
            "user 4"
          ).to.equal(2);
          expect(
            await dutchAuction.balanceOf(userAccounts[4].address),
            "user 5"
          ).to.equal(2);
          expect(
            await dutchAuction.balanceOf(userAccounts[5].address),
            "user 6"
          ).to.equal(2);
          expect(
            await dutchAuction.balanceOf(userAccounts[6].address),
            "user 7"
          ).to.equal(2);
          // user minted 1573 beforehand + 1 from mintRemaining
          expect(
            await dutchAuction.balanceOf(userAccounts[7].address),
            "user 8"
          ).to.equal(1574);
        });

        it("Should allow users to mint remaining from auction (8 users, 10 remaining), no jumping queue", async () => {
          // 7 users to be tier 1
          // 0 - 6 mint tier 1,
          for (let i = 0; i < 7; i++) {
            await dutchAuction.connect(userAccounts[i]).auctionMint(1, false, {
              value: ethers.utils.parseUnits("1", "ether"),
            });
          }

          // next day
          await advanceTimeAndBlock(await duration.days(1).toNumber());
          await dutchAuction.connect(userAccounts[7]).auctionMint(1573, false, {
            value: ethers.utils.parseUnits("1573", "ether"),
          });

          // advance to day 2
          await advanceTimeAndBlock(await duration.days(7).toNumber());

          await dutchAuction.connect(adminAccount).setPublicSale(true);
          // 7 to mint tier 2,
          await dutchAuction
            .connect(userAccounts[10])
            .publicSaleMint(283, false, {
              value: ethers.utils.parseUnits("283", "ether"),
            });
          // advance time to after public
          await advanceTimeAndBlock(await duration.days(2).toNumber());

          // let users mint
          await dutchAuction.connect(userAccounts[7]).mintRemaining();
          await dutchAuction.connect(userAccounts[3]).mintRemaining();
          await dutchAuction.connect(userAccounts[4]).mintRemaining();
          await dutchAuction.connect(userAccounts[5]).mintRemaining();
          await dutchAuction.connect(userAccounts[6]).mintRemaining();
          await dutchAuction.connect(userAccounts[0]).mintRemaining();
          await dutchAuction.connect(userAccounts[1]).mintRemaining();
          await dutchAuction.connect(userAccounts[2]).mintRemaining();

          //user amounts
          // 5 remaining, first 5 should get +1 each, after each minted 1 during tier1
          expect(
            await dutchAuction.balanceOf(userAccounts[0].address),
            "user 1"
          ).to.equal(3);
          expect(
            await dutchAuction.balanceOf(userAccounts[1].address),
            "user 2"
          ).to.equal(3);
          expect(
            await dutchAuction.balanceOf(userAccounts[2].address),
            "user 3"
          ).to.equal(2);
          expect(
            await dutchAuction.balanceOf(userAccounts[3].address),
            "user 4"
          ).to.equal(2);
          expect(
            await dutchAuction.balanceOf(userAccounts[4].address),
            "user 5"
          ).to.equal(2);
          expect(
            await dutchAuction.balanceOf(userAccounts[5].address),
            "user 6"
          ).to.equal(2);
          expect(
            await dutchAuction.balanceOf(userAccounts[6].address),
            "user 7"
          ).to.equal(2);
          // user minted 1573 beforehand + 1 from mintRemaining
          expect(
            await dutchAuction.balanceOf(userAccounts[7].address),
            "user 8"
          ).to.equal(1574);
        });

        it("Should allow users to mint remaining from auction (5 users, 5 remaining)", async () => {
          // 7 users to be tier 1
          // 0 - 6 mint tier 1,
          for (let i = 0; i < 5; i++) {
            await dutchAuction.connect(userAccounts[i]).auctionMint(1, false, {
              value: ethers.utils.parseUnits("1", "ether"),
            });
          }
          // next day
          await advanceTimeAndBlock(await duration.days(1).toNumber());
          await dutchAuction
            .connect(userAccounts[11])
            .auctionMint(1578, false, {
              value: ethers.utils.parseUnits("1578", "ether"),
            });

          // advance to day 2
          await advanceTimeAndBlock(await duration.days(7).toNumber());

          await dutchAuction.connect(adminAccount).setPublicSale(true);

          // 7 to mint tier 2,
          await dutchAuction
            .connect(userAccounts[10])
            .publicSaleMint(285, false, {
              value: ethers.utils.parseUnits("285", "ether"),
            });
          // advance time to after public
          await advanceTimeAndBlock(await duration.days(2).toNumber());

          // let users mint
          for (let i = 0; i < 5; i++) {
            await dutchAuction.connect(userAccounts[i]).mintRemaining();
          }
          //user amounts
          // 5 remaining, first 5 should get +1 each, after each minted 1 during tier1
          expect(
            await dutchAuction.balanceOf(userAccounts[0].address),
            "user 1"
          ).to.equal(2);
          expect(
            await dutchAuction.balanceOf(userAccounts[1].address),
            "user 2"
          ).to.equal(2);
          expect(
            await dutchAuction.balanceOf(userAccounts[2].address),
            "user 3"
          ).to.equal(2);
          expect(
            await dutchAuction.balanceOf(userAccounts[3].address),
            "user 4"
          ).to.equal(2);
          expect(
            await dutchAuction.balanceOf(userAccounts[4].address),
            "user 5"
          ).to.equal(2);
        });

        it("Should allow users to mint remaining from auction (7 users, 5 remaining)", async () => {
          // 7 users to be tier 1
          // 0 - 6 mint tier 1,
          for (let i = 0; i < 7; i++) {
            await dutchAuction.connect(userAccounts[i]).auctionMint(1, false, {
              value: ethers.utils.parseUnits("1", "ether"),
            });
          }
          // next day
          await advanceTimeAndBlock(await duration.days(1).toNumber());
          await dutchAuction
            .connect(userAccounts[11])
            .auctionMint(1576, false, {
              value: ethers.utils.parseUnits("1576", "ether"),
            });

          // advance to day 2
          await advanceTimeAndBlock(await duration.days(7).toNumber());

          await dutchAuction.connect(adminAccount).setPublicSale(true);

          // 7 to mint tier 2,
          await dutchAuction
            .connect(userAccounts[10])
            .publicSaleMint(285, false, {
              value: ethers.utils.parseUnits("285", "ether"),
            });
          // advance time to after public
          await advanceTimeAndBlock(await duration.days(2).toNumber());

          // let users mint
          for (let i = 0; i < 5; i++) {
            await dutchAuction.connect(userAccounts[i]).mintRemaining();
          }
          //user amounts
          // 5 remaining, first 5 should get +1 each, after each minted 1 during tier1
          expect(
            await dutchAuction.balanceOf(userAccounts[0].address),
            "user 1"
          ).to.equal(2);
          expect(
            await dutchAuction.balanceOf(userAccounts[1].address),
            "user 2"
          ).to.equal(2);
          expect(
            await dutchAuction.balanceOf(userAccounts[2].address),
            "user 3"
          ).to.equal(2);
          expect(
            await dutchAuction.balanceOf(userAccounts[3].address),
            "user 4"
          ).to.equal(2);
          expect(
            await dutchAuction.balanceOf(userAccounts[4].address),
            "user 5"
          ).to.equal(2);
          expect(
            await dutchAuction.balanceOf(userAccounts[5].address),
            "user 6"
          ).to.equal(1);
          expect(
            await dutchAuction.balanceOf(userAccounts[6].address),
            "user 7"
          ).to.equal(1);
        });

        it("Should allow users to mint remaining from auction (2 users, 10 remaining)", async () => {
          // only first user
          await dutchAuction.connect(userAccounts[0]).auctionMint(1, false, {
            value: ethers.utils.parseUnits("1", "ether"),
          });
          // next day
          await advanceTimeAndBlock(await duration.days(1).toNumber());
          await dutchAuction
            .connect(userAccounts[11])
            .auctionMint(1580, false, {
              value: ethers.utils.parseUnits("1580", "ether"),
            });

          // advance
          await advanceTimeAndBlock(await duration.days(7).toNumber());

          await dutchAuction.connect(adminAccount).setPublicSale(true);

          await dutchAuction
            .connect(userAccounts[10])
            .publicSaleMint(282, false, {
              value: ethers.utils.parseUnits("282", "ether"),
            });
          // advance time to after public
          await advanceTimeAndBlock(await duration.days(2).toNumber());

          // let users mint
          await dutchAuction.connect(userAccounts[0]).mintRemaining();
          //user amounts
          // 10 remaining, user 0 gets all 10
          expect(
            await dutchAuction.balanceOf(userAccounts[0].address),
            "user 1"
          ).to.equal(6);
          expect(
            await dutchAuction.balanceOf(userAccounts[1].address),
            "user 2"
          ).to.equal(0);
        });
      });
    });

    describe("Rebates for auction", async () => {
      beforeEach(() => {
        stars
          .connect(adminAccount)
          .approve(dutchAuction.address, parseEther("10000000000"));
        stars
          .connect(adminAccount)
          .transfer(dutchAuction.address, parseEther("10000000000"));
        stars
          .connect(userAccounts[0])
          .approve(dutchAuction.address, parseEther("10000000000"));
        stars
          .connect(userAccounts[1])
          .approve(dutchAuction.address, parseEther("10000000000"));
      });
      describe("Bought in ETH", async () => {
        it("Should rebate 1.5x stars in first tier", async () => {
          const startTime = await latest();
          await dutchAuction
            .connect(adminAccount)
            .setAuctionSaleStartTime(startTime);

          const beforeStarsBal = await stars.balanceOf(userAccounts[0].address);

          await dutchAuction.connect(userAccounts[0]).auctionMint(1, false, {
            value: ethers.utils.parseUnits("1", "ether"),
          });

          // advance time to third day
          await advanceTimeAndBlock(await duration.days(2).toNumber());
          // another person buys
          await dutchAuction.connect(userAccounts[1]).auctionMint(1, false, {
            value: ethers.utils.parseUnits("1", "ether"),
          });

          // check if lowest price is set
          expect((await dutchAuction.saleConfig()).ethPrice).to.equal(
            parseEther("0.6")
          );

          // reset times to earlier to simulate time passed
          const now = await latest();
          await dutchAuction
            .connect(adminAccount)
            .setAuctionSaleStartTime(now - duration.days(5));
          await dutchAuction.connect(adminAccount).setWhitelistSaleEndTime(now);
          await dutchAuction.connect(adminAccount).setPublicSaleEndTime(now);

          // call rebate
          await dutchAuction.connect(userAccounts[0]).rebate();

          const finalStarsBal = await stars.balanceOf(userAccounts[0].address);
          expect(finalStarsBal.sub(beforeStarsBal)).to.equal(
            parseEther("36000")
          );
        });
        it("Should rebate 1.3x stars in second tier", async () => {
          const startTime = await latest();
          await dutchAuction
            .connect(adminAccount)
            .setAuctionSaleStartTime(startTime);

          const beforeStarsBal = await stars.balanceOf(userAccounts[0].address);

          await advanceTimeAndBlock(await duration.days(1).toNumber());
          await dutchAuction.connect(userAccounts[0]).auctionMint(1, false, {
            value: ethers.utils.parseUnits("1", "ether"),
          });

          // advance time to fourth day
          await advanceTimeAndBlock(await duration.days(2).toNumber());
          // another person buys
          await dutchAuction.connect(userAccounts[1]).auctionMint(1, false, {
            value: ethers.utils.parseUnits("1", "ether"),
          });

          // check if lowest price is set
          expect((await dutchAuction.saleConfig()).ethPrice).to.equal(
            parseEther("0.4")
          );

          // reset times to earlier to simulate time passed
          const now = await latest();
          await dutchAuction
            .connect(adminAccount)
            .setAuctionSaleStartTime(now - duration.days(5));
          await dutchAuction.connect(adminAccount).setWhitelistSaleEndTime(now);
          await dutchAuction.connect(adminAccount).setPublicSaleEndTime(now);

          // call rebate
          await dutchAuction.connect(userAccounts[0]).rebate();

          const finalStarsBal = await stars.balanceOf(userAccounts[0].address);
          expect(finalStarsBal.sub(beforeStarsBal)).to.equal(
            parseEther("31200")
          );
        });
        it("Should rebate 1x stars in third tier", async () => {
          const startTime = await latest();
          await dutchAuction
            .connect(adminAccount)
            .setAuctionSaleStartTime(startTime);

          const beforeStarsBal = await stars.balanceOf(userAccounts[0].address);
          await advanceTimeAndBlock(await duration.days(2).toNumber());
          await dutchAuction.connect(userAccounts[0]).auctionMint(1, false, {
            value: ethers.utils.parseUnits("1", "ether"),
          });

          // advance time to last day
          await advanceTimeAndBlock(await duration.days(2).toNumber());
          // another person buys
          await dutchAuction.connect(userAccounts[1]).auctionMint(1, false, {
            value: ethers.utils.parseUnits("1", "ether"),
          });

          // check if lowest price is set
          expect((await dutchAuction.saleConfig()).ethPrice).to.equal(
            parseEther("0.2")
          );

          // reset times to earlier to simulate time passed
          const now = await latest();
          await dutchAuction
            .connect(adminAccount)
            .setAuctionSaleStartTime(now - duration.days(5));
          await dutchAuction.connect(adminAccount).setWhitelistSaleEndTime(now);
          await dutchAuction.connect(adminAccount).setPublicSaleEndTime(now);

          // call rebate
          await dutchAuction.connect(userAccounts[0]).rebate();

          const finalStarsBal = await stars.balanceOf(userAccounts[0].address);
          expect(finalStarsBal.sub(beforeStarsBal)).to.equal(
            parseEther("24000")
          );
        });
      });
      describe("Bought in STARS", async () => {
        it("Should rebate 1x stars in first tier", async () => {
          const startTime = await latest();
          await dutchAuction
            .connect(adminAccount)
            .setAuctionSaleStartTime(startTime);

          const beforeStarsBal = await stars.balanceOf(userAccounts[0].address);

          await dutchAuction.connect(userAccounts[0]).auctionMint(1, true);
          // advance time to third day
          await advanceTimeAndBlock(await duration.days(2).toNumber());
          // another person buys
          await dutchAuction.connect(userAccounts[1]).auctionMint(1, true);

          // check if lowest price is set
          expect((await dutchAuction.saleConfig()).starsPrice).to.equal(
            parseEther("44917.2")
          );

          // reset times to earlier to simulate time passed
          const now = await latest();
          await dutchAuction
            .connect(adminAccount)
            .setAuctionSaleStartTime(now - duration.days(5));
          await dutchAuction.connect(adminAccount).setWhitelistSaleEndTime(now);
          await dutchAuction.connect(adminAccount).setPublicSaleEndTime(now);

          // call rebate
          await dutchAuction.connect(userAccounts[0]).rebate();

          const finalStarsBal = await stars.balanceOf(userAccounts[0].address);
          expect(beforeStarsBal.sub(finalStarsBal)).to.equal(
            parseEther("44917.2")
          );
        });
        it("Should rebate 1x stars in second tier", async () => {
          const startTime = await latest();
          await dutchAuction
            .connect(adminAccount)
            .setAuctionSaleStartTime(startTime);

          const beforeStarsBal = await stars.balanceOf(userAccounts[0].address);
          await advanceTimeAndBlock(await duration.days(1).toNumber());

          await dutchAuction.connect(userAccounts[0]).auctionMint(1, true);
          // advance time to fourth day
          await advanceTimeAndBlock(await duration.days(2).toNumber());
          // another person buys
          await dutchAuction.connect(userAccounts[1]).auctionMint(1, true);

          // check if lowest price is set
          expect((await dutchAuction.saleConfig()).starsPrice).to.equal(
            tier4StarsPrice
          );

          // reset times to earlier to simulate time passed
          const now = await latest();
          await dutchAuction
            .connect(adminAccount)
            .setAuctionSaleStartTime(now - duration.days(5));
          await dutchAuction.connect(adminAccount).setWhitelistSaleEndTime(now);
          await dutchAuction.connect(adminAccount).setPublicSaleEndTime(now);

          // call rebate
          await dutchAuction.connect(userAccounts[0]).rebate();

          const finalStarsBal = await stars.balanceOf(userAccounts[0].address);
          expect(beforeStarsBal.sub(finalStarsBal)).to.equal(tier4StarsPrice);
        });

        it("Should rebate 1x stars in third tier", async () => {
          const startTime = await latest();
          await dutchAuction
            .connect(adminAccount)
            .setAuctionSaleStartTime(startTime);

          const beforeStarsBal = await stars.balanceOf(userAccounts[0].address);
          await advanceTimeAndBlock(await duration.days(2).toNumber());

          await dutchAuction.connect(userAccounts[0]).auctionMint(1, true);
          // advance time to last day
          await advanceTimeAndBlock(await duration.days(2).toNumber());
          // another person buys
          await dutchAuction.connect(userAccounts[1]).auctionMint(1, true);

          // check if lowest price is set
          expect((await dutchAuction.saleConfig()).starsPrice).to.equal(
            tier5StarsPrice
          );

          // reset times to earlier to simulate time passed
          const now = await latest();
          await dutchAuction
            .connect(adminAccount)
            .setAuctionSaleStartTime(now - duration.days(5));
          await dutchAuction.connect(adminAccount).setWhitelistSaleEndTime(now);
          await dutchAuction.connect(adminAccount).setPublicSaleEndTime(now);

          // call rebate
          await dutchAuction.connect(userAccounts[0]).rebate();

          const finalStarsBal = await stars.balanceOf(userAccounts[0].address);
          expect(beforeStarsBal.sub(finalStarsBal)).to.equal(tier5StarsPrice);
        });
      });
    });
  });

  describe("Error Cases", async () => {
    describe("Admin Functions", async () => {
      it("Should throw if not owner toggle reveal", async () => {
        const toggle = true;
        try {
          await dutchAuction.connect(userAccounts[0]).setRevealed(toggle);
          expect(false).to.be.true;
        } catch (e) {
          expect(e.message).to.match(/caller is not the owner/);
        }
      });
      it("Should throw if not owner toggle public sale", async () => {
        await expect(
          dutchAuction.connect(userAccounts[0]).setPublicSale(true)
        ).to.be.revertedWith(OWNABLE_ERROR);
      });
      it("Should throw if not owner calling dev mint", async () => {
        try {
          await dutchAuction
            .connect(userAccounts[0])
            .devMint(1, userAccounts[0].address);
          expect(false).to.be.true;
        } catch (e) {
          expect(e.message).to.match(/caller is not the owner/);
        }
      });
      it("Should throw if not owner calling withdraw", async () => {
        try {
          await dutchAuction.connect(userAccounts[0]).withdrawMoney();
          expect(false).to.be.true;
        } catch (e) {
          expect(e.message).to.match(/caller is not the owner/);
        }
      });
      it("Should throw if not owner calling setAllowListMerkleRoot", async () => {
        const array = [
          userAccounts[0].address,
          userAccounts[1].address,
          userAccounts[2].address,
        ];
        const leafNodes = array.map((addr) => keccak256(addr));
        const merkleTree = new MerkleTree(leafNodes, keccak256, {
          sortPairs: true,
        });
        const root = merkleTree.getRoot();
        await expect(
          dutchAuction.connect(userAccounts[0]).setAllowListMerkleRoot(root)
        ).to.be.revertedWith(OWNABLE_ERROR);
      });

      describe("Setters for auction and sales times", async () => {
        it("Should throw if not owner to toggle the public sale on", async () => {
          try {
            await dutchAuction.connect(userAccounts[0]).setPublicSale(true);
            expect(false).to.be.true;
          } catch (e) {
            expect(e.message).to.match(/caller is not the owner/);
          }
        });

        it("Should throw if not owner to toggle the public sale off", async () => {
          try {
            await dutchAuction.connect(userAccounts[0]).setPublicSale(true);
            await dutchAuction.connect(userAccounts[0]).setPublicSale(true);
            expect(false).to.be.true;
          } catch (e) {
            expect(e.message).to.match(/caller is not the owner/);
          }
        });

        // Setting Times
        it("Should throw if not owner to set auction sale start time", async () => {
          const block = await provider.getBlockNumber();
          const startTime = (await provider.getBlock(block)).timestamp;

          try {
            await dutchAuction
              .connect(userAccounts[0])
              .setAuctionSaleStartTime(startTime);
            expect(false).to.be.true;
          } catch (e) {
            expect(e.message).to.match(/caller is not the owner/);
          }
        });

        it("Should throw if not owner to set whitelist sale start time", async () => {
          const block = await provider.getBlockNumber();
          const startTime = (await provider.getBlock(block)).timestamp;

          try {
            await dutchAuction
              .connect(userAccounts[0])
              .setWhitelistSaleStartTime(startTime);
            expect(false).to.be.true;
          } catch (e) {
            expect(e.message).to.match(/caller is not the owner/);
          }
        });

        it("Should throw if not owner to set public sale start time", async () => {
          const block = await provider.getBlockNumber();
          const startTime = (await provider.getBlock(block)).timestamp;

          try {
            await dutchAuction
              .connect(userAccounts[0])
              .setPublicSaleStartTime(startTime);
            expect(false).to.be.true;
          } catch (e) {
            expect(e.message).to.match(/caller is not the owner/);
          }
        });

        it("Should throw if not owner to set whitelist sale end time", async () => {
          const block = await provider.getBlockNumber();
          const endTime = (await provider.getBlock(block)).timestamp;

          try {
            await dutchAuction
              .connect(userAccounts[0])
              .setWhitelistSaleEndTime(endTime);
            expect(false).to.be.true;
          } catch (e) {
            expect(e.message).to.match(/caller is not the owner/);
          }
        });

        it("Should throw if not owner to set public sale end time", async () => {
          const block = await provider.getBlockNumber();
          const endTime = (await provider.getBlock(block)).timestamp;

          try {
            await dutchAuction
              .connect(userAccounts[0])
              .setPublicSaleEndTime(endTime);
            expect(false).to.be.true;
          } catch (e) {
            expect(e.message).to.match(/caller is not the owner/);
          }
        });
      });

      describe("Setting URIs", async () => {
        it("Should throw if not owner to set the uri prefix", async () => {
          const uriPrefix = "randomString";
          try {
            await dutchAuction.connect(userAccounts[0]).setUriPrefix(uriPrefix);
            expect(false).to.be.true;
          } catch (e) {
            expect(e.message).to.match(/caller is not the owner/);
          }
        });

        it("Should throw if not owner to set the uri suffix", async () => {
          const uriSuffix = ".txt";
          try {
            await dutchAuction.connect(userAccounts[0]).setUriSuffix(uriSuffix);
            expect(false).to.be.true;
          } catch (e) {
            expect(e.message).to.match(/caller is not the owner/);
          }
        });

        it("Should throw if not owner to set the hidden metadata uri", async () => {
          const hiddenMetadataUri = "randomString";
          try {
            await dutchAuction
              .connect(userAccounts[0])
              .setHiddenMetadataUri(hiddenMetadataUri);
            expect(false).to.be.true;
          } catch (e) {
            expect(e.message).to.match(/caller is not the owner/);
          }
        });
      });
    });
    describe("Minting", async () => {
      describe("Dev mints", async () => {
        it("Should throw if trying to dev mint more than the allowed supply", async () => {
          const amountToMint = 50;
          await dutchAuction
            .connect(adminAccount)
            .devMint(amountToMint, adminAccount.address);
          try {
            await dutchAuction
              .connect(adminAccount)
              .devMint(1, adminAccount.address);
            expect(false).to.be.true;
          } catch (e) {
            expect(e.message).to.match(
              /too many already minted before dev mint/
            );
          }
        });
      });
      describe("Auction mints", async () => {
        it("Should throw if trying to mint but auction not started", async () => {
          const startTime = duration.weeks(2).add(await latest());
          await dutchAuction
            .connect(adminAccount)
            .setAuctionSaleStartTime(startTime);

          try {
            await dutchAuction.connect(userAccounts[0]).auctionMint(1, false, {
              value: ethers.utils.parseUnits("1", "ether"),
            });
            expect(false).to.be.true;
          } catch (e) {
            expect(e.message).to.match(/sale has not started yet/);
          }
        });
        it("Should throw if trying to mint but not enough supply left", async () => {
          const startTime = await latest();
          await dutchAuction
            .connect(adminAccount)
            .setAuctionSaleStartTime(startTime);
          const amountToMint = 50;
          await dutchAuction
            .connect(adminAccount)
            .devMint(amountToMint, adminAccount.address);
          await dutchAuction.connect(adminAccount).auctionMint(1585, true);
          // should fail since will be 1 over max supply for auction
          await expect(dutchAuction.auctionMint(1, true)).to.be.revertedWith(
            "Purchase would exceed max supply for Dutch auction mint"
          );
        });
        it("Should throw if not enough eth sent", async () => {
          const amountToMint = 50;
          await dutchAuction
            .connect(adminAccount)
            .devMint(amountToMint, adminAccount.address);
          const startTime = await latest();
          await dutchAuction
            .connect(adminAccount)
            .setAuctionSaleStartTime(startTime);
          try {
            await dutchAuction.connect(adminAccount).auctionMint(2, false, {
              value: ethers.utils.parseUnits("1", "ether"),
            });
          } catch (e) {
            expect(e.message).to.match(/Need to send more ETH./);
          }
        });
        it("Should throw if stars not approved", async () => {
          const amountToMint = 50;
          await dutchAuction
            .connect(adminAccount)
            .devMint(amountToMint, adminAccount.address);
          const startTime = await latest();
          await dutchAuction
            .connect(adminAccount)
            .setAuctionSaleStartTime(startTime);
          await stars
            .connect(adminAccount)
            .approve(dutchAuction.address, parseEther("0"));
          try {
            await dutchAuction.connect(adminAccount).auctionMint(1, true);
          } catch (e) {
            expect(e.message).to.match(/ERC20: insufficient allowance/);
          }
        });
        it("Should not throw if buy with eth and stars not approved", async () => {
          const amountToMint = 50;
          await dutchAuction
            .connect(adminAccount)
            .devMint(amountToMint, adminAccount.address);
          const startTime = await latest();
          await dutchAuction
            .connect(adminAccount)
            .setAuctionSaleStartTime(startTime);
          await stars
            .connect(adminAccount)
            .approve(dutchAuction.address, parseEther("0"));
          try {
            await dutchAuction.connect(adminAccount).auctionMint(1, false, {
              value: ethers.utils.parseUnits("1", "ether"),
            });
          } catch (e) {
            expect(e.message).to.match(/ERC20: insufficient allowance/);
          }
        });
      });

      describe("Whitelist mints", async () => {
        it("Should throw if provided 0 address (isAllowListed)", async () => {
          const array = [
            userAccounts[0].address,
            userAccounts[1].address,
            userAccounts[2].address,
          ];

          const leafNodes = array.map((addr) => keccak256(addr));
          const merkleTree = new MerkleTree(leafNodes, keccak256, {
            sortPairs: true,
          });
          const root = merkleTree.getRoot();
          const proof = merkleTree.getHexProof(leafNodes[0]);

          await dutchAuction.connect(adminAccount).setAllowListMerkleRoot(root);

          await expect(
            dutchAuction.connect(adminAccount).isAllowListed(proof, zeroAddress)
          ).to.be.revertedWith("Zero address not on Allow List");
        });

        it("Should throw if trying to mint but not in whitelist", async () => {
          const array = [userAccounts[1].address, userAccounts[2].address];
          const leafNodes = array.map((addr) => keccak256(addr));
          const merkleTree = new MerkleTree(leafNodes, keccak256, {
            sortPairs: true,
          });
          const root = merkleTree.getRoot();
          const proof = merkleTree.getHexProof(leafNodes[0]);
          await dutchAuction.connect(adminAccount).setAllowListMerkleRoot(root);

          try {
            await dutchAuction
              .connect(userAccounts[0])
              .allowlistMint(1, false, proof, {
                value: ethers.utils.parseUnits("1", "ether"),
              });
            expect(false).to.be.true;
          } catch (e) {
            expect(e.message).to.match(
              /This address is not allow listed for the presale/
            );
          }
        });
        it("Should throw if trying to mint but whitelist not started", async () => {
          const startTime = duration.weeks(2).add(await latest());
          const endTime = duration.weeks(2).add(startTime);
          await dutchAuction
            .connect(adminAccount)
            .setWhitelistSaleStartTime(startTime);
          await dutchAuction
            .connect(adminAccount)
            .setWhitelistSaleEndTime(endTime);
          const array = [
            userAccounts[0].address,
            userAccounts[1].address,
            userAccounts[2].address,
          ];

          const leafNodes = array.map((addr) => keccak256(addr));
          const merkleTree = new MerkleTree(leafNodes, keccak256, {
            sortPairs: true,
          });
          const root = merkleTree.getRoot();
          const proof = merkleTree.getHexProof(leafNodes[0]);

          await dutchAuction.connect(adminAccount).setAllowListMerkleRoot(root);
          try {
            await dutchAuction
              .connect(userAccounts[0])
              .allowlistMint(1, false, proof, {
                value: ethers.utils.parseUnits("1", "ether"),
              });
            expect(false).to.be.true;
          } catch (e) {
            expect(e.message).to.match(/outside of allowlist sale times/);
          }
        });
        it("Should throw if trying to mint but max limit reached", async () => {
          const startTime = await latest();
          const endTime = duration.weeks(2).add(startTime);
          await dutchAuction
            .connect(adminAccount)
            .setWhitelistSaleStartTime(startTime);
          await dutchAuction
            .connect(adminAccount)
            .setWhitelistSaleEndTime(endTime);
          const array = [
            userAccounts[0].address,
            userAccounts[1].address,
            userAccounts[2].address,
          ];

          const leafNodes = array.map((addr) => keccak256(addr));
          const merkleTree = new MerkleTree(leafNodes, keccak256, {
            sortPairs: true,
          });
          const root = merkleTree.getRoot();
          const proof = merkleTree.getHexProof(leafNodes[0]);

          await dutchAuction.connect(adminAccount).setAllowListMerkleRoot(root);
          await dutchAuction
            .connect(userAccounts[0])
            .allowlistMint(288, false, proof, {
              value: ethers.utils.parseUnits("288", "ether"),
            });
          try {
            await dutchAuction
              .connect(userAccounts[0])
              .allowlistMint(1, false, proof, {
                value: ethers.utils.parseUnits("1", "ether"),
              });
            expect(false).to.be.true;
          } catch (e) {
            expect(e.message).to.match(/Purchase would exceed max supply/);
          }
        });
        it("Should throw if not enough eth sent", async () => {
          const startTime = await latest();
          const endTime = duration.weeks(2).add(startTime);
          await dutchAuction
            .connect(adminAccount)
            .setWhitelistSaleStartTime(startTime);
          await dutchAuction
            .connect(adminAccount)
            .setWhitelistSaleEndTime(endTime);
          const array = [
            userAccounts[0].address,
            userAccounts[1].address,
            userAccounts[2].address,
          ];

          const leafNodes = array.map((addr) => keccak256(addr));
          const merkleTree = new MerkleTree(leafNodes, keccak256, {
            sortPairs: true,
          });
          const root = merkleTree.getRoot();
          const proof = merkleTree.getHexProof(leafNodes[0]);

          await dutchAuction.connect(adminAccount).setAllowListMerkleRoot(root);
          try {
            await dutchAuction
              .connect(userAccounts[0])
              .allowlistMint(2, false, proof, {
                value: ethers.utils.parseUnits("1", "ether"),
              });
          } catch (e) {
            expect(e.message).to.match(/Need to send more ETH./);
          }
        });
      });
      describe("Public mints", async () => {
        beforeEach(async () => {
          const startTime = await latest();

          await dutchAuction
            .connect(adminAccount)
            .setPublicSaleStartTime(startTime);
          await dutchAuction.connect(adminAccount).setPublicSale(true);
        });

        it("Should throw if trying to mint but max limit reached", async () => {
          await dutchAuction
            .connect(userAccounts[0])
            .publicSaleMint(288, false, {
              value: ethers.utils.parseUnits("288", "ether"),
            });
          await dutchAuction
            .connect(userAccounts[0])
            .publicSaleMint(1585, false, {
              value: ethers.utils.parseUnits("1585", "ether"),
            });
          try {
            await dutchAuction
              .connect(userAccounts[0])
              .publicSaleMint(1, false, {
                value: ethers.utils.parseUnits("1", "ether"),
              });
            expect(false).to.be.true;
          } catch (e) {
            expect(e.message).to.match(/Purchase would exceed max supply/);
          }
        });
        it("Should not throw if trying to mint but max limit not reached", async () => {
          await dutchAuction.connect(userAccounts[0]).auctionMint(1584, false, {
            value: ethers.utils.parseUnits("1584", "ether"),
          });
          await dutchAuction
            .connect(userAccounts[0])
            .publicSaleMint(289, false, {
              value: ethers.utils.parseUnits("289", "ether"),
            });
        });
        it("Should throw if not enough eth sent", async () => {
          try {
            await dutchAuction
              .connect(userAccounts[0])
              .publicSaleMint(288, false, {
                value: ethers.utils.parseUnits("1", "ether"),
              });
          } catch (e) {
            expect(e.message).to.match(/Need to send more ETH./);
          }
        });

        it("Should throw if stars not approved", async () => {
          stars.connect(userAccounts[0]).approve(dutchAuction.address, 0);
          await expect(
            dutchAuction.connect(userAccounts[0]).publicSaleMint(1, true)
          ).to.be.revertedWith("ERC20: insufficient allowance");
        });
      });
    });
    describe("Views", async () => {
      it("Should throw if token DNE", async () => {
        try {
          await dutchAuction.tokenURI(0);
          expect(false).to.be.true;
        } catch (e) {
          expect(e.message).to.match(
            /ERC721Metadata: URI query for nonexistent token/
          );
        }
      });
    });
    describe("Rebate for auction", async () => {
      beforeEach(() => {
        stars
          .connect(adminAccount)
          .approve(dutchAuction.address, parseEther("10000000000"));
        stars
          .connect(adminAccount)
          .transfer(dutchAuction.address, parseEther("10000000000"));
        stars
          .connect(userAccounts[0])
          .approve(dutchAuction.address, parseEther("10000000000"));
        stars
          .connect(userAccounts[1])
          .approve(dutchAuction.address, parseEther("10000000000"));
      });
      it("Should throw if nothing to rebate", async () => {
        // reset times to earlier to simulate time passed
        const now = await latest();
        await dutchAuction
          .connect(adminAccount)
          .setAuctionSaleStartTime(now - duration.days(5));
        await dutchAuction.connect(adminAccount).setWhitelistSaleEndTime(now);
        await dutchAuction.connect(adminAccount).setPublicSaleEndTime(now);
        try {
          await dutchAuction.connect(userAccounts[0]).rebate();
          expect(false).to.be.true;
        } catch (e) {
          expect(e.message).to.match(/Nothing to rebate./);
        }
      });
      it("Should throw if already claimed rebate", async () => {
        const startTime = await latest();
        await dutchAuction
          .connect(adminAccount)
          .setAuctionSaleStartTime(startTime);

        const beforeStarsBal = await stars.balanceOf(userAccounts[0].address);

        await dutchAuction.connect(userAccounts[0]).auctionMint(1, false, {
          value: ethers.utils.parseUnits("1", "ether"),
        });

        // advance time to third day
        await advanceTimeAndBlock(await duration.days(2).toNumber());
        // another person buys
        await dutchAuction.connect(userAccounts[1]).auctionMint(1, false, {
          value: ethers.utils.parseUnits("1", "ether"),
        });

        // check if lowest price is set
        expect((await dutchAuction.saleConfig()).ethPrice).to.equal(
          parseEther("0.6")
        );
        // reset times to earlier to simulate time passed
        const now = await latest();
        await dutchAuction
          .connect(adminAccount)
          .setAuctionSaleStartTime(now - duration.days(5));
        await dutchAuction.connect(adminAccount).setWhitelistSaleEndTime(now);
        await dutchAuction.connect(adminAccount).setPublicSaleEndTime(now);

        // call rebate
        await dutchAuction.connect(userAccounts[0]).rebate();

        const finalStarsBal = await stars.balanceOf(userAccounts[0].address);
        expect(finalStarsBal.sub(beforeStarsBal)).to.equal(parseEther("36000"));
        try {
          await dutchAuction.connect(userAccounts[0]).rebate();
          expect(false).to.be.true;
        } catch (e) {
          expect(e.message).to.match(/Rebate already claimed/);
        }
      });
      it("Should throw if nothing to rebate (price diff <= 0)", async () => {
        const startTime = await latest();
        await dutchAuction
          .connect(adminAccount)
          .setAuctionSaleStartTime(startTime);

        await dutchAuction.connect(userAccounts[0]).auctionMint(1, false, {
          value: ethers.utils.parseUnits("1", "ether"),
        });

        // advance time
        await advanceTimeAndBlock(await duration.days(7).toNumber());

        // check if lowest price is set
        expect((await dutchAuction.saleConfig()).ethPrice).to.equal(
          parseEther("1")
        );
        // reset times to earlier to simulate time passed
        const now = await latest();
        await dutchAuction
          .connect(adminAccount)
          .setAuctionSaleStartTime(now - duration.days(5));
        await dutchAuction.connect(adminAccount).setWhitelistSaleEndTime(now);
        await dutchAuction.connect(adminAccount).setPublicSaleEndTime(now);
        try {
          await dutchAuction.connect(userAccounts[0]).rebate();
          expect(false).to.be.true;
        } catch (e) {
          expect(e.message).to.match(/Nothing to rebate./);
        }
      });
    });

    describe("Botting Contract Calls", async () => {
      it("Should throw if bot contract calls auctionMint", async () => {
        await expect(
          botContract.buyAuction(dutchAuction.address, 1, false)
        ).to.be.revertedWith("The caller is another contract");
      });

      it("Should throw if bot contract calls whitelistMint", async () => {
        // setup whitelist
        const array = [
          userAccounts[0].address,
          userAccounts[1].address,
          userAccounts[2].address,
        ];

        const leafNodes = array.map((addr) => keccak256(addr));
        const merkleTree = new MerkleTree(leafNodes, keccak256, {
          sortPairs: true,
        });
        const root = merkleTree.getRoot();
        const proof = merkleTree.getHexProof(leafNodes[0]);
        await dutchAuction.connect(adminAccount).setAllowListMerkleRoot(root);
        await expect(
          botContract.buyFromWhiteList(dutchAuction.address, 1, false, proof)
        ).to.be.revertedWith("The caller is another contract");
      });

      it("Should throw if bot contract calls publicSaleMint", async () => {
        await expect(
          botContract.buyFromPublicSale(dutchAuction.address, 1, false)
        ).to.be.revertedWith("The caller is another contract");
      });

      it("Should throw if bot contract calls mintRemaining", async () => {
        await expect(
          botContract.mintRemaining(dutchAuction.address)
        ).to.be.revertedWith("The caller is another contract");
      });
    });

    describe("Bonus Mints - mintRemaining errors", async () => {
      it("Should fail if too early to mint", async () => {
        await expect(
          dutchAuction.connect(userAccounts[0]).mintRemaining()
        ).to.be.revertedWith("too early");
      });

      it("Should fail if nothing to mint", async () => {
        await dutchAuction.devMint(50, userAccounts[0].address);
        const currentTime = await latest();
        // setup times
        await dutchAuction.setAuctionSaleStartTime(currentTime);
        await dutchAuction.setWhitelistSaleStartTime(
          currentTime.add(duration.hours(1))
        );
        await dutchAuction.setPublicSaleStartTime(
          currentTime.add(duration.days(1))
        );
        await dutchAuction.setWhitelistSaleEndTime(
          currentTime.add(duration.hours(3))
        );
        await dutchAuction.setPublicSaleEndTime(
          currentTime.add(duration.days(2))
        );
        // 7 users in tier 1 dutch auction
        await dutchAuction
          .connect(userAccounts[0])
          .auctionMint(1585, false, { value: parseEther("1585") });

        // setup whitelist
        const array = [
          userAccounts[0].address,
          userAccounts[1].address,
          userAccounts[2].address,
        ];

        const leafNodes = array.map((addr) => keccak256(addr));
        const merkleTree = new MerkleTree(leafNodes, keccak256, {
          sortPairs: true,
        });
        const root = merkleTree.getRoot();
        const proof = merkleTree.getHexProof(leafNodes[0]);
        await dutchAuction.connect(adminAccount).setAllowListMerkleRoot(root);

        await advanceTimeAndBlock(duration.hours(2).toNumber());

        // mint all avaiable sale mints
        await dutchAuction
          .connect(userAccounts[0])
          .allowlistMint(288, false, proof, { value: parseEther("288") });

        await advanceTimeAndBlock(
          currentTime.add(duration.days(10)).toNumber()
        );

        await expect(
          dutchAuction.connect(userAccounts[0]).mintRemaining()
        ).to.be.revertedWith("nothing to mint");
      });

      it("Should fail if user cannot mint more", async () => {
        // setup times
        const currentTime = await latest();
        await dutchAuction.setAuctionSaleStartTime(currentTime);
        await dutchAuction.setWhitelistSaleStartTime(
          currentTime.add(duration.hours(1))
        );
        await dutchAuction.setPublicSaleStartTime(
          currentTime.add(duration.days(1))
        );
        await dutchAuction.setWhitelistSaleEndTime(
          currentTime.add(duration.hours(2))
        );
        await dutchAuction.setPublicSaleEndTime(
          currentTime.add(duration.days(2))
        );
        // setup users in tier 1 dutch auction
        await dutchAuction
          .connect(userAccounts[0])
          .auctionMint(1, false, { value: parseEther("1") });
        await dutchAuction
          .connect(userAccounts[1])
          .auctionMint(1, false, { value: parseEther("1") });

        await advanceTimeAndBlock(
          currentTime.add(duration.days(10)).toNumber()
        );

        // mint remaining twice for fail result
        await dutchAuction.connect(userAccounts[0]).mintRemaining();
        await expect(
          dutchAuction.connect(userAccounts[0]).mintRemaining()
        ).to.be.revertedWith("cannot mint more");
      });
    });
  });
});
