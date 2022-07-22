// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import {IMogiesDutchAuction} from "../IMogiesDutchAuction.sol";

contract BuyBotMock {
    function buyAuction(
        address auctionAddress,
        uint32 amount,
        bool isStars
    ) external {
        IMogiesDutchAuction(auctionAddress).auctionMint(amount, isStars);
    }

    function buyFromWhiteList(
        address auctionAddress,
        uint32 amount,
        bool isStars,
        bytes32[] memory proof
    ) external {
        IMogiesDutchAuction(auctionAddress).allowlistMint(
            amount,
            isStars,
            proof
        );
    }

    function buyFromPublicSale(
        address auctionAddress,
        uint32 amount,
        bool isStars
    ) external {
        IMogiesDutchAuction(auctionAddress).publicSaleMint(amount, isStars);
    }

    function mintRemaining(address auctionAddress) external {
        IMogiesDutchAuction(auctionAddress).mintRemaining();
    }
}
