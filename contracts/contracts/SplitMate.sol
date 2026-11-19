// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @notice Minimal view of the (non-transferable, ERC-721) Agent ID contract.
interface IAgentID {
    function balanceOf(address owner) external view returns (uint256);
}

/// @title SplitMate - group bill splitting ledger gated by Agent ID
/// @notice Records shared expenses per group as net balances and lets debtors pay
///         creditors directly. Funds are pass-through only: the contract never keeps
///         a balance after a transaction finishes.
/// @dev There is NO owner, NO admin, NO pause, NO upgrade, NO fee and NO withdraw
///      function. Nobody but the paying user can move funds, and only in the call
///      they sign themselves.
contract SplitMate is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ------------------------------------------------------------------ constants
    uint256 public constant MAX_MEMBERS = 50;
    uint256 public constant MAX_GROUPS_PER_USER = 20;
    uint256 public constant DISPUTE_WINDOW = 3 days;
    uint256 public constant MAX_INVITE_TTL = 30 days;
    uint256 public constant MAX_NAME_LENGTH = 64;
    uint256 public constant CHALLENGE_UNIT = 1 gwei;

    /// @notice Agent ID contract (0x60b9...022f on BSC mainnet).
    IAgentID public immutable agentId;
    /// @notice The only ERC-20 allowed as a group payment token (USDT on BSC).
    address public immutable stableToken;

    // ------------------------------------------------------------------ types
    struct Group {
        string name;
        address token; // address(0) = native BNB, otherwise `stableToken`
        address organizer;
        bool closed;
        bytes32 inviteHash; // keccak256(abi.encodePacked(groupId, inviteCode))
        uint64 inviteExpiry;
        uint64 createdAt;
    }

    struct Expense {
        address payer;
        uint256 amount;
        bytes32 metaHash; // hash of the off-chain description (privacy: NFR-11)
        uint64 createdAt;
        bool cancelled;
        address[] participants;
        uint256[] shares;
    }

    // ------------------------------------------------------------------ storage
    uint256 public groupCount;
    mapping(uint256 => Group) internal _groups;
    mapping(uint256 => address[]) internal _members;
    mapping(uint256 => mapping(address => bool)) public isMember;
    /// @notice Net balance of a member in a group (positive = is owed, negative = owes).
    mapping(uint256 => mapping(address => int256)) public netBalance;
    /// @notice Optional .ai label a member chose to show (self-declared, display only).
    mapping(address => string) public displayName;
    mapping(address => uint256[]) internal _userGroups;

    mapping(uint256 => Expense[]) internal _expenses;
    /// @dev groupId => expenseId => participant => disputed
    mapping(uint256 => mapping(uint256 => mapping(address => bool))) public disputed;

    /// @notice Agentic Wallet address declared by a main wallet (pending until verified).
    mapping(address => address) public declaredAgent;
    /// @notice Verified link: Agentic Wallet => main wallet.
    mapping(address => address) public agentOwner;
    /// @notice agent => challenge amount => main wallet waiting for verification.
    mapping(address => mapping(uint256 => address)) public pendingLink;
    /// @notice main wallet => its open challenge amount (0 if none).
    mapping(address => uint256) public pendingChallenge;

    // ------------------------------------------------------------------ events
    event GroupCreated(uint256 indexed groupId, address indexed organizer, string name, address token);
    event InviteUpdated(uint256 indexed groupId, uint64 expiry);
    event MemberJoined(uint256 indexed groupId, address indexed member);
    event DisplayNameSet(address indexed account, string name);
    event AgentDeclared(address indexed owner, address indexed agent, uint256 challenge);
    event AgentLinked(address indexed owner, address indexed agent);
    event AgentUnlinked(address indexed owner, address indexed agent);
    event ExpenseAdded(
        uint256 indexed groupId, uint256 indexed expenseId, address indexed payer, uint256 amount, bytes32 metaHash
    );
    event ExpenseDisputed(uint256 indexed groupId, uint256 indexed expenseId, address indexed participant, uint256 share);
    event ExpenseCancelled(uint256 indexed groupId, uint256 indexed expenseId);
    event Settled(
        uint256 indexed groupId, address indexed debtor, address indexed creditor, uint256 amount, address paidBy
    );
    event PaidOffChain(uint256 indexed groupId, address indexed debtor, address indexed creditor, uint256 amount);
    event GroupClosed(uint256 indexed groupId);

    // ------------------------------------------------------------------ errors
    error NotAgentHolder();
    error NotMember();
    error NotOrganizer();
    error GroupIsClosed();
    error GroupNotFound();
    error InvalidToken();
    error InvalidName();
    error InvalidInvite();
    error AlreadyMember();
    error GroupFull();
    error TooManyGroups();
    error InvalidShares();
    error InvalidAmount();
    error WrongPaymentMethod();
    error ExceedsDebt();
    error NotParticipant();
    error AlreadyDisputed();
    error DisputeWindowOver();
    error NotPayer();
    error AlreadyCancelled();
    error InvalidAgent();
    error NothingToSettle();
    error TransferFailed();

    constructor(address agentId_, address stableToken_) {
        if (agentId_ == address(0) || stableToken_ == address(0)) revert InvalidToken();
        agentId = IAgentID(agentId_);
        stableToken = stableToken_;
    }

    // ------------------------------------------------------------------ identity
    /// @notice True if `account` holds an Agent ID itself, or has a verified
    ///         Agentic Wallet that holds one.
    function isAgentHolder(address account) public view returns (bool) {
        if (agentId.balanceOf(account) > 0) return true;
        address agent = declaredAgent[account];
        return agent != address(0) && agentOwner[agent] == account && agentId.balanceOf(agent) > 0;
    }

    modifier onlyAgentHolder() {
        if (!isAgentHolder(msg.sender)) revert NotAgentHolder();
        _;
    }

    modifier groupExists(uint256 groupId) {
        if (groupId >= groupCount) revert GroupNotFound();
        _;
    }

    modifier onlyMember(uint256 groupId) {
        if (!isMember[groupId][msg.sender]) revert NotMember();
        _;
    }

    /// @notice Main wallet declares its Agentic Wallet and receives a unique
    ///         challenge amount (in wei). The agent proves control by sending exactly
    ///         that amount of BNB to this contract; it is refunded in full.
    function declareAgent(address agent) external returns (uint256 challenge) {
        if (agent == address(0) || agent == msg.sender) revert InvalidAgent();
        if (agentId.balanceOf(agent) == 0) revert NotAgentHolder();
        address owner = agentOwner[agent];
        if (owner != address(0) && owner != msg.sender) revert InvalidAgent();

        _clearAgent(msg.sender);
        declaredAgent[msg.sender] = agent;
        if (owner == msg.sender) {
            agentOwner[agent] = msg.sender;
            emit AgentLinked(msg.sender, agent);
            return 0;
        }
        challenge = (uint256(keccak256(abi.encode(msg.sender, agent, block.prevrandao, block.number))) % 999_999 + 1)
            * CHALLENGE_UNIT;
        if (pendingLink[agent][challenge] != address(0)) revert InvalidAgent();
        pendingLink[agent][challenge] = msg.sender;
        pendingChallenge[msg.sender] = challenge;
        emit AgentDeclared(msg.sender, agent, challenge);
    }

    /// @notice Remove the link (or pending link) to the current Agentic Wallet.
    function unlinkAgent() external {
        if (declaredAgent[msg.sender] == address(0)) revert InvalidAgent();
        _clearAgent(msg.sender);
    }

    function _clearAgent(address owner) internal {
        address agent = declaredAgent[owner];
        if (agent == address(0)) return;
        uint256 c = pendingChallenge[owner];
        if (c != 0) {
            delete pendingLink[agent][c];
            delete pendingChallenge[owner];
        }
        if (agentOwner[agent] == owner) delete agentOwner[agent];
        delete declaredAgent[owner];
        emit AgentUnlinked(owner, agent);
    }

    /// @notice Optional .ai label shown instead of 0x... (display only).
    function setDisplayName(string calldata name) external onlyAgentHolder {
        if (bytes(name).length > MAX_NAME_LENGTH) revert InvalidName();
        displayName[msg.sender] = name;
        emit DisplayNameSet(msg.sender, name);
    }

    // ------------------------------------------------------------------ groups
    function createGroup(string calldata name, address token, bytes32 inviteHash, uint64 inviteExpiry)
        external
        onlyAgentHolder
        returns (uint256 groupId)
    {
        if (bytes(name).length == 0 || bytes(name).length > MAX_NAME_LENGTH) revert InvalidName();
        if (token != address(0) && token != stableToken) revert InvalidToken();
        _checkExpiry(inviteExpiry);

        groupId = groupCount++;
        Group storage g = _groups[groupId];
        g.name = name;
        g.token = token;
        g.organizer = msg.sender;
        g.inviteHash = inviteHash;
        g.inviteExpiry = inviteExpiry;
        g.createdAt = uint64(block.timestamp);

        emit GroupCreated(groupId, msg.sender, name, token);
        emit InviteUpdated(groupId, inviteExpiry);
        _addMember(groupId, msg.sender);
    }

    /// @notice Organizer rotates (or revokes with hash 0) the invite code.
    function setInvite(uint256 groupId, bytes32 inviteHash, uint64 inviteExpiry) external groupExists(groupId) {
        Group storage g = _groups[groupId];
        if (g.organizer != msg.sender) revert NotOrganizer();
        if (g.closed) revert GroupIsClosed();
        _checkExpiry(inviteExpiry);
        g.inviteHash = inviteHash;
        g.inviteExpiry = inviteExpiry;
        emit InviteUpdated(groupId, inviteExpiry);
    }

    /// @notice Join with the invite code from the invite link. Requires an Agent ID.
    function joinGroup(uint256 groupId, bytes32 inviteCode) external groupExists(groupId) onlyAgentHolder {
        Group storage g = _groups[groupId];
        if (g.closed) revert GroupIsClosed();
        if (
            g.inviteHash == bytes32(0) || block.timestamp > g.inviteExpiry
                || keccak256(abi.encodePacked(groupId, inviteCode)) != g.inviteHash
        ) revert InvalidInvite();
        if (isMember[groupId][msg.sender]) revert AlreadyMember();
        _addMember(groupId, msg.sender);
    }

    function closeGroup(uint256 groupId) external groupExists(groupId) {
        Group storage g = _groups[groupId];
        if (g.organizer != msg.sender) revert NotOrganizer();
        if (g.closed) revert GroupIsClosed();
        g.closed = true;
        g.inviteHash = bytes32(0);
        emit GroupClosed(groupId);
    }

    // ------------------------------------------------------------------ expenses
    /// @notice Record an expense paid by msg.sender. `shares[i]` is what
    ///         `participants[i]` consumed; shares must sum exactly to `amount`.
    function addExpense(
        uint256 groupId,
        uint256 amount,
        address[] calldata participants,
        uint256[] calldata shares,
        bytes32 metaHash
    ) external groupExists(groupId) onlyMember(groupId) onlyAgentHolder returns (uint256 expenseId) {
        if (_groups[groupId].closed) revert GroupIsClosed();
        uint256 n = participants.length;
        if (amount == 0 || n == 0 || n != shares.length || n > MAX_MEMBERS) revert InvalidShares();

        uint256 total;
        for (uint256 i; i < n; ++i) {
            address p = participants[i];
            if (!isMember[groupId][p]) revert NotMember();
            for (uint256 j; j < i; ++j) {
                if (participants[j] == p) revert InvalidShares();
            }
            total += shares[i];
        }
        if (total != amount) revert InvalidShares();

        for (uint256 i; i < n; ++i) {
            _move(groupId, participants[i], msg.sender, shares[i]);
        }

        expenseId = _expenses[groupId].length;
        Expense storage e = _expenses[groupId].push();
        e.payer = msg.sender;
        e.amount = amount;
        e.metaHash = metaHash;
        e.createdAt = uint64(block.timestamp);
        e.participants = participants;
        e.shares = shares;
        emit ExpenseAdded(groupId, expenseId, msg.sender, amount, metaHash);
    }

    /// @notice A participant disputes their share within DISPUTE_WINDOW; the share
    ///         is removed from balances until the payer records a corrected expense.
    function disputeExpense(uint256 groupId, uint256 expenseId) external groupExists(groupId) {
        Expense storage e = _expenses[groupId][expenseId];
        if (e.cancelled) revert AlreadyCancelled();
        if (block.timestamp > e.createdAt + DISPUTE_WINDOW) revert DisputeWindowOver();
        if (msg.sender == e.payer) revert NotParticipant();
        if (disputed[groupId][expenseId][msg.sender]) revert AlreadyDisputed();
        uint256 share = _shareOf(e, msg.sender);
        if (share == 0) revert NotParticipant();

        disputed[groupId][expenseId][msg.sender] = true;
        _move(groupId, e.payer, msg.sender, share);
        emit ExpenseDisputed(groupId, expenseId, msg.sender, share);
    }

    /// @notice Payer cancels an expense; all non-disputed shares are reversed.
    function cancelExpense(uint256 groupId, uint256 expenseId) external groupExists(groupId) {
        Expense storage e = _expenses[groupId][expenseId];
        if (e.payer != msg.sender) revert NotPayer();
        if (e.cancelled) revert AlreadyCancelled();
        e.cancelled = true;
        uint256 n = e.participants.length;
        for (uint256 i; i < n; ++i) {
            address p = e.participants[i];
            if (!disputed[groupId][expenseId][p]) _move(groupId, msg.sender, p, e.shares[i]);
        }
        emit ExpenseCancelled(groupId, expenseId);
    }

    // ------------------------------------------------------------------ settlement
    /// @notice Pay a creditor in BNB. Funds go straight to the creditor.
    function settle(uint256 groupId, address creditor) external payable groupExists(groupId) nonReentrant {
        if (_groups[groupId].token != address(0)) revert WrongPaymentMethod();
        _reduce(groupId, msg.sender, creditor, msg.value);
        emit Settled(groupId, msg.sender, creditor, msg.value, msg.sender);
        _sendNative(creditor, msg.value);
    }

    /// @notice Pay a creditor in USDT. Requires an exact `approve(amount)` first;
    ///         tokens move debtor -> creditor directly, never through this contract.
    function settleToken(uint256 groupId, address creditor, uint256 amount)
        external
        groupExists(groupId)
        nonReentrant
    {
        address token = _groups[groupId].token;
        if (token == address(0)) revert WrongPaymentMethod();
        _reduce(groupId, msg.sender, creditor, amount);
        emit Settled(groupId, msg.sender, creditor, amount, msg.sender);
        IERC20(token).safeTransferFrom(msg.sender, creditor, amount);
    }

    /// @notice Creditor confirms they were paid outside the chain (cash / bank).
    function markPaidOffChain(uint256 groupId, address debtor, uint256 amount) external groupExists(groupId) {
        _reduce(groupId, debtor, msg.sender, amount);
        emit PaidOffChain(groupId, debtor, msg.sender, amount);
    }

    /// @notice Plain BNB transfer channel for Agentic Wallets (which may only be able
    ///         to "transfer"):
    ///         1. If the sender is a declared-but-unverified agent, the link is
    ///            verified and the full amount is refunded.
    ///         2. Otherwise the sender (or its linked main wallet) pays down its
    ///            oldest BNB debts, group by group; any remainder is refunded.
    receive() external payable nonReentrant {
        address sender = msg.sender;
        address owner = agentOwner[sender];

        if (owner == address(0)) {
            // Link proof: the declared agent sends its exact challenge amount.
            address pendingOwner = pendingLink[sender][msg.value];
            if (pendingOwner != address(0) && declaredAgent[pendingOwner] == sender) {
                delete pendingLink[sender][msg.value];
                delete pendingChallenge[pendingOwner];
                agentOwner[sender] = pendingOwner;
                emit AgentLinked(pendingOwner, sender);
                _sendNative(sender, msg.value);
                return;
            }
            owner = sender; // a main wallet paying directly
        }

        uint256 remaining = msg.value;
        uint256[] storage groups = _userGroups[owner];
        for (uint256 gi; gi < groups.length && remaining > 0; ++gi) {
            uint256 groupId = groups[gi];
            if (_groups[groupId].token != address(0)) continue;
            int256 bal = netBalance[groupId][owner];
            if (bal >= 0) continue;
            address[] storage mem = _members[groupId];
            for (uint256 mi; mi < mem.length && remaining > 0 && bal < 0; ++mi) {
                address creditor = mem[mi];
                int256 cBal = netBalance[groupId][creditor];
                if (cBal <= 0) continue;
                uint256 pay = _min(_min(remaining, uint256(-bal)), uint256(cBal));
                _reduce(groupId, owner, creditor, pay);
                emit Settled(groupId, owner, creditor, pay, sender);
                remaining -= pay;
                bal += int256(pay);
                _sendNative(creditor, pay);
            }
        }
        if (remaining == msg.value) revert NothingToSettle();
        if (remaining > 0) _sendNative(sender, remaining);
    }

    // ------------------------------------------------------------------ views
    function getGroup(uint256 groupId)
        external
        view
        groupExists(groupId)
        returns (
            string memory name,
            address token,
            address organizer,
            bool closed,
            uint64 inviteExpiry,
            uint64 createdAt,
            uint256 numMembers,
            uint256 numExpenses
        )
    {
        Group storage g = _groups[groupId];
        return (
            g.name,
            g.token,
            g.organizer,
            g.closed,
            g.inviteExpiry,
            g.createdAt,
            _members[groupId].length,
            _expenses[groupId].length
        );
    }

    function getMembers(uint256 groupId) external view returns (address[] memory) {
        return _members[groupId];
    }

    function getBalances(uint256 groupId) external view returns (address[] memory members, int256[] memory balances) {
        members = _members[groupId];
        balances = new int256[](members.length);
        for (uint256 i; i < members.length; ++i) {
            balances[i] = netBalance[groupId][members[i]];
        }
    }

    function getUserGroups(address user) external view returns (uint256[] memory) {
        return _userGroups[user];
    }

    function getExpense(uint256 groupId, uint256 expenseId)
        external
        view
        returns (
            address payer,
            uint256 amount,
            bytes32 metaHash,
            uint64 createdAt,
            bool cancelled,
            address[] memory participants,
            uint256[] memory shares
        )
    {
        Expense storage e = _expenses[groupId][expenseId];
        return (e.payer, e.amount, e.metaHash, e.createdAt, e.cancelled, e.participants, e.shares);
    }

    function expenseCount(uint256 groupId) external view returns (uint256) {
        return _expenses[groupId].length;
    }

    // ------------------------------------------------------------------ internal
    function _addMember(uint256 groupId, address member) internal {
        if (_members[groupId].length >= MAX_MEMBERS) revert GroupFull();
        if (_userGroups[member].length >= MAX_GROUPS_PER_USER) revert TooManyGroups();
        isMember[groupId][member] = true;
        _members[groupId].push(member);
        _userGroups[member].push(groupId);
        emit MemberJoined(groupId, member);
    }

    /// @dev `from` now owes `to` `amount` more (from's balance down, to's up).
    function _move(uint256 groupId, address from, address to, uint256 amount) internal {
        if (from == to || amount == 0) return;
        int256 a = _toInt(amount);
        netBalance[groupId][from] -= a;
        netBalance[groupId][to] += a;
    }

    /// @dev Debtor pays creditor: both balances move toward zero, never past it.
    function _reduce(uint256 groupId, address debtor, address creditor, uint256 amount) internal {
        if (amount == 0 || debtor == creditor) revert InvalidAmount();
        int256 a = _toInt(amount);
        int256 d = netBalance[groupId][debtor];
        int256 c = netBalance[groupId][creditor];
        if (d > -a || c < a) revert ExceedsDebt();
        netBalance[groupId][debtor] = d + a;
        netBalance[groupId][creditor] = c - a;
    }

    function _shareOf(Expense storage e, address who) internal view returns (uint256) {
        uint256 n = e.participants.length;
        for (uint256 i; i < n; ++i) {
            if (e.participants[i] == who) return e.shares[i];
        }
        return 0;
    }

    function _sendNative(address to, uint256 amount) internal {
        if (amount == 0) return;
        (bool ok,) = to.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }

    function _checkExpiry(uint64 expiry) internal view {
        if (expiry != 0 && (expiry < block.timestamp || expiry > block.timestamp + MAX_INVITE_TTL)) {
            revert InvalidInvite();
        }
    }

    function _toInt(uint256 x) internal pure returns (int256) {
        if (x > uint256(type(int256).max)) revert InvalidAmount();
        return int256(x);
    }

    function _min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }
}
