// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract SnakeGame {
    struct ScoreEntry {
        address player;
        string  name;
        uint256 score;
        uint256 length;
        uint256 kills;
        uint256 timestamp;
    }

    struct SessionResult {
        uint256 sessionId;
        string  roomId;
        string  winnerName;
        address winnerAddr;
        uint256 winnerScore;
        uint256 timestamp;
        string  chronicle;
    }

    ScoreEntry[]    private _scores;
    SessionResult[] private _sessions;
    uint256 public  sessionCount;

    mapping(address => uint256) public bestScore;

    event ScoreSubmitted(address indexed player, string name, uint256 score, uint256 sessionId);
    event SessionRecorded(uint256 indexed sessionId, string roomId, string winnerName);
    event ChronicleSet(uint256 indexed sessionId, string chronicle);

    // Called by player after death or session end
    function submitScore(
        string calldata name,
        uint256 score,
        uint256 length,
        uint256 kills
    ) external {
        _scores.push(ScoreEntry({
            player:    msg.sender,
            name:      name,
            score:     score,
            length:    length,
            kills:     kills,
            timestamp: block.timestamp
        }));
        if (score > bestScore[msg.sender]) bestScore[msg.sender] = score;
        emit ScoreSubmitted(msg.sender, name, score, sessionCount);
    }

    // Called by server after private room session ends
    function recordSession(
        string calldata roomId,
        string calldata winnerName,
        address         winnerAddr,
        uint256         winnerScore
    ) external {
        sessionCount++;
        _sessions.push(SessionResult({
            sessionId:   sessionCount,
            roomId:      roomId,
            winnerName:  winnerName,
            winnerAddr:  winnerAddr,
            winnerScore: winnerScore,
            timestamp:   block.timestamp,
            chronicle:   ''
        }));
        emit SessionRecorded(sessionCount, roomId, winnerName);
    }

    // Called after Ritual Agent generates the tournament narrative
    function setChronicle(uint256 sessionId, string calldata chronicle) external {
        require(sessionId > 0 && sessionId <= sessionCount, 'Invalid session');
        _sessions[sessionId - 1].chronicle = chronicle;
        emit ChronicleSet(sessionId, chronicle);
    }

    // ── Views ──

    // Returns last 100 score entries (frontend sorts by score)
    function getLeaderboard() external view returns (ScoreEntry[] memory) {
        uint256 n = _scores.length > 100 ? 100 : _scores.length;
        ScoreEntry[] memory top = new ScoreEntry[](n);
        uint256 start = _scores.length > 100 ? _scores.length - 100 : 0;
        for (uint256 i = 0; i < n; i++) top[i] = _scores[start + i];
        return top;
    }

    function getSession(uint256 sessionId) external view returns (SessionResult memory) {
        require(sessionId > 0 && sessionId <= sessionCount, 'Invalid session');
        return _sessions[sessionId - 1];
    }

    function playerCount() external view returns (uint256) {
        return _scores.length;
    }
}
