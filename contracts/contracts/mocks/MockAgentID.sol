// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice TEST ONLY. Stand-in for the non-transferable Agent ID NFT on testnet/local.
contract MockAgentID {
    mapping(address => uint256) public balanceOf;
    string public constant name = "Mock Agent ID";

    function mint(address to) external {
        balanceOf[to] += 1;
    }

    function burn(address from) external {
        balanceOf[from] = 0;
    }
}
