// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

interface ISplitMate {
    function joinGroup(uint256 groupId, bytes32 inviteCode) external;
    function addExpense(uint256, uint256, address[] calldata, uint256[] calldata, bytes32) external returns (uint256);
}

/// @notice TEST ONLY. A creditor contract that refuses BNB.
contract RevertingReceiver {
    function join(ISplitMate s, uint256 g, bytes32 code) external {
        s.joinGroup(g, code);
    }

    function add(ISplitMate s, uint256 g, uint256 amt, address[] calldata p, uint256[] calldata sh) external {
        s.addExpense(g, amt, p, sh, bytes32(0));
    }

    receive() external payable {
        revert("no");
    }
}
