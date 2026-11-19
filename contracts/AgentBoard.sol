// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";

/// @title AgentBoard — a daily check-in board only Agent ID holders can use.
/// @notice Agent ID is the SPACE ID ERC-721 on BNB Chain
/// (mainnet 0x60b9262456de011f7d15a54cdd8c48baaa8b022f, non-transferable).
/// A caller holds an Agent ID iff balanceOf(caller) > 0 on that contract.
/// Agent ID is used here for access control AND identity: only Agent ID holders
/// can check in, and each check-in is tied to the holder's address.
/// @dev OWNER POWERS: the ONLY owner power is pause() / unpause() — an emergency
/// stop of check-ins. There is no mint, no withdraw, no fee setter, no upgrade,
/// and no other admin function. The contract holds no funds and moves no assets;
/// its only external call is the Agent ID balanceOf read.
interface IAgentIdRegistry {
    function balanceOf(address owner) external view returns (uint256);
}

contract AgentBoard is Ownable, Pausable {
    /// @notice The Agent ID registry (SPACE ID ERC-721). Set once in the constructor.
    IAgentIdRegistry public immutable agentIdRegistry;

    /// @notice Maximum check-in message size in bytes.
    uint256 public constant MAX_MESSAGE_BYTES = 280;
    /// @notice Seconds in a UTC day; a "day" is block.timestamp / 86400.
    uint256 public constant SECONDS_PER_DAY = 86400;

    struct CheckIn {
        string message;
        uint256 timestamp;
    }

    // agent => UTC day => check-in
    mapping(address => mapping(uint256 => CheckIn)) private _checkIns;
    // agent => last UTC day checked in (0 = never)
    mapping(address => uint256) private _lastCheckInDay;
    // agent => streak as of the last check-in (consecutive UTC days)
    mapping(address => uint256) private _streak;
    // agent => lifetime check-in count
    mapping(address => uint256) private _totalCheckIns;
    // agent => has ever checked in
    mapping(address => bool) private _hasEverCheckedIn;

    uint256 private _totalCheckInsGlobal;
    uint256 private _totalAgents;

    /// @notice Emitted on every successful check-in.
    event CheckedIn(address indexed agent, uint256 indexed day, uint256 streak, string message);

    error NotAgentIdHolder();
    error AlreadyCheckedInToday();
    error MessageTooLong();

    /// @param agentIdRegistry_ The Agent ID registry address
    /// (mainnet 0x60b9262456de011f7d15a54cdd8c48baaa8b022f; a mock on testnet).
    /// @param owner_ The contract owner (only power is pause/unpause).
    /// Passed explicitly so the contract can be deployed through a factory
    /// (e.g. the deterministic CREATE2 deployment proxy) without the
    /// factory becoming the owner.
    constructor(address agentIdRegistry_, address owner_) Ownable(owner_) {
        agentIdRegistry = IAgentIdRegistry(agentIdRegistry_);
    }

    /// @notice Check in for today (one per UTC day per address).
    /// @dev Reverts unless the caller holds an Agent ID, unless the caller
    /// already checked in today, or unless the message exceeds 280 bytes.
    /// A consecutive-day check-in increments the streak; a gap resets it to 1.
    function checkIn(string calldata message) external whenNotPaused {
        if (agentIdRegistry.balanceOf(msg.sender) == 0) revert NotAgentIdHolder();
        if (bytes(message).length > MAX_MESSAGE_BYTES) revert MessageTooLong();

        uint256 day = block.timestamp / SECONDS_PER_DAY;
        if (_lastCheckInDay[msg.sender] == day) revert AlreadyCheckedInToday();

        // Streak: consecutive UTC days; a gap resets it to 1.
        uint256 lastDay = _lastCheckInDay[msg.sender];
        uint256 newStreak = (lastDay != 0 && day == lastDay + 1) ? _streak[msg.sender] + 1 : 1;

        _checkIns[msg.sender][day] = CheckIn({message: message, timestamp: block.timestamp});
        _lastCheckInDay[msg.sender] = day;
        _streak[msg.sender] = newStreak;
        _totalCheckIns[msg.sender] += 1;
        _totalCheckInsGlobal += 1;
        if (!_hasEverCheckedIn[msg.sender]) {
            _hasEverCheckedIn[msg.sender] = true;
            _totalAgents += 1;
        }

        emit CheckedIn(msg.sender, day, newStreak, message);
    }

    /// @notice The agent's current streak. 0 if the agent never checked in or
    /// if the last check-in was more than one UTC day ago (streak broken).
    function streakOf(address agent) external view returns (uint256) {
        uint256 lastDay = _lastCheckInDay[agent];
        if (lastDay == 0) return 0;
        uint256 today = block.timestamp / SECONDS_PER_DAY;
        if (today - lastDay > 1) return 0; // streak broken by a gap
        return _streak[agent];
    }

    /// @notice Lifetime check-in count for an agent.
    function totalCheckIns(address agent) external view returns (uint256) {
        return _totalCheckIns[agent];
    }

    /// @notice Last UTC day the agent checked in (0 = never).
    function lastCheckInDay(address agent) external view returns (uint256) {
        return _lastCheckInDay[agent];
    }

    /// @notice Whether the agent already checked in today (current UTC day).
    function hasCheckedInToday(address agent) external view returns (bool) {
        return _lastCheckInDay[agent] == block.timestamp / SECONDS_PER_DAY;
    }

    /// @notice A past check-in: its message and timestamp. Empty / 0 if none.
    function checkInOf(address agent, uint256 day)
        external
        view
        returns (string memory message, uint256 timestamp)
    {
        CheckIn storage c = _checkIns[agent][day];
        return (c.message, c.timestamp);
    }

    /// @notice Total check-ins across all agents.
    function totalCheckInsGlobal() external view returns (uint256) {
        return _totalCheckInsGlobal;
    }

    /// @notice Number of distinct addresses that ever checked in.
    function totalAgents() external view returns (uint256) {
        return _totalAgents;
    }

    /// @notice Emergency stop of check-ins. Owner only. See the contract notice.
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Resume check-ins after a pause. Owner only.
    function unpause() external onlyOwner {
        _unpause();
    }
}
