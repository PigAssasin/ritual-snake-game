// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract SnakeGame {
    struct ScoreEntry {
        address player;
        string  name;
        uint256 score;     // food eaten
        uint256 length;    // snake length at death
        uint256 kills;     // kills this session
        uint256 timestamp;
    }

    mapping(address => ScoreEntry) public bestScore;
    address[] private _players;
    mapping(address => bool) private _registered;

    event ScoreSubmitted(
        address indexed player,
        string  name,
        uint256 score,
        uint256 length,
        uint256 kills,
        uint256 timestamp
    );

    function submitScore(
        string  calldata name,
        uint256 score,
        uint256 length,
        uint256 kills
    ) external {
        if (!_registered[msg.sender]) {
            _registered[msg.sender] = true;
            _players.push(msg.sender);
        }
        // Always emit (records every death for future NFT chronicle)
        emit ScoreSubmitted(msg.sender, name, score, length, kills, block.timestamp);

        // Only update stored best if this run beats it
        if (score > bestScore[msg.sender].score) {
            bestScore[msg.sender] = ScoreEntry({
                player:    msg.sender,
                name:      name,
                score:     score,
                length:    length,
                kills:     kills,
                timestamp: block.timestamp
            });
        }
    }

    // Returns top-20 by best score (view — no gas cost for reads)
    function getLeaderboard() external view returns (ScoreEntry[] memory top) {
        uint256 n = _players.length;
        ScoreEntry[] memory all = new ScoreEntry[](n);
        for (uint256 i = 0; i < n; i++) {
            all[i] = bestScore[_players[i]];
        }

        // Insertion sort descending — O(n²) fine for ≤ few thousand entries
        for (uint256 i = 1; i < n; i++) {
            ScoreEntry memory key = all[i];
            uint256 j = i;
            while (j > 0 && all[j - 1].score < key.score) {
                all[j] = all[j - 1];
                j--;
            }
            all[j] = key;
        }

        uint256 cap = n < 20 ? n : 20;
        top = new ScoreEntry[](cap);
        for (uint256 i = 0; i < cap; i++) {
            top[i] = all[i];
        }
    }

    function playerCount() external view returns (uint256) {
        return _players.length;
    }
}
