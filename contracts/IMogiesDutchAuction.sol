// SPDX-License-Identifier: MIT
// OpenZeppelin Contracts v4.4.1 (token/ERC721/IERC721Receiver.sol)

pragma solidity ^0.8.0;

interface IMogiesDutchAuction {
    function auctionMint(uint32 quantity, bool isUsingStars) external payable;

    function allowlistMint(
        uint32 quantity,
        bool isUsingStars,
        bytes32[] memory _proof
    ) external payable;

    function publicSaleMint(uint32 quantity, bool isUsingStars)
        external
        payable;

    function mintRemaining() external;
}
