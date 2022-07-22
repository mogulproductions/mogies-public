// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract DummyStars is ERC20("DummyStars", "DMS") {
    constructor(address[] memory holders, uint256[] memory amounts) {
        for (uint256 i = 0; i < holders.length; i++) {
            _mint(holders[i], amounts[i]);
        }
    }
}
