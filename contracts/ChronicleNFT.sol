// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/utils/Base64.sol";

/**
 * ChronicleNFT — ERC-721 minted on player elimination in public rooms.
 * Metadata is stored fully onchain: epitaph (text) + portrait (base64 image).
 * Minting is restricted to the owner (server wallet).
 */
contract ChronicleNFT is ERC721, Ownable {
    using Strings for uint256;

    struct Chronicle {
        string  playerName;
        uint256 score;
        uint256 kills;
        uint256 length;
        string  killedBy;
        string  epitaph;     // LLM-generated epitaph (Ritual 0x0802)
        string  portraitUri; // data:image/... base64 (Ritual 0x0818)
        uint256 timestamp;
    }

    uint256 private _nextTokenId;
    mapping(uint256 => Chronicle) private _chronicles;
    mapping(address => uint256[]) private _playerTokens;

    event ChroniclesMinted(uint256 indexed tokenId, address indexed player, string playerName);

    constructor() ERC721("Snake Death Chronicle", "SNKC") Ownable(msg.sender) {}

    /**
     * Mint a Death Chronicle NFT.
     * Called by server (owner) after LLM + Image generation completes.
     *
     * @param to          Player wallet address
     * @param playerName  In-game name
     * @param score       Food eaten
     * @param kills       Kills this session
     * @param length      Snake length at death
     * @param killedBy    Name of killer or "wall"
     * @param epitaph     2-sentence epitaph from Ritual LLM
     * @param portraitUri data:image/png;base64,... from Ritual Image precompile
     */
    function mint(
        address         to,
        string calldata playerName,
        uint256         score,
        uint256         kills,
        uint256         length,
        string calldata killedBy,
        string calldata epitaph,
        string calldata portraitUri
    ) external onlyOwner returns (uint256) {
        uint256 tokenId = _nextTokenId++;
        _safeMint(to, tokenId);
        _chronicles[tokenId] = Chronicle({
            playerName:  playerName,
            score:       score,
            kills:       kills,
            length:      length,
            killedBy:    killedBy,
            epitaph:     epitaph,
            portraitUri: portraitUri,
            timestamp:   block.timestamp
        });
        _playerTokens[to].push(tokenId);
        emit ChroniclesMinted(tokenId, to, playerName);
        return tokenId;
    }

    // ── Metadata (fully onchain) ──

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        Chronicle memory c = _chronicles[tokenId];

        string memory json = string(abi.encodePacked(
            '{"name":"Chronicle #', tokenId.toString(), ' — ', c.playerName, '",',
            '"description":"', _escape(c.epitaph), '",',
            '"image":"', c.portraitUri, '",',
            '"attributes":[',
              '{"trait_type":"Score","value":', c.score.toString(), '},',
              '{"trait_type":"Kills","value":', c.kills.toString(), '},',
              '{"trait_type":"Length","value":', c.length.toString(), '},',
              '{"trait_type":"Killed By","value":"', _escape(c.killedBy), '"}',
            ']}'
        ));

        return string(abi.encodePacked(
            'data:application/json;base64,',
            Base64.encode(bytes(json))
        ));
    }

    function getChronicle(uint256 tokenId) external view returns (Chronicle memory) {
        _requireOwned(tokenId);
        return _chronicles[tokenId];
    }

    function tokensOf(address player) external view returns (uint256[] memory) {
        return _playerTokens[player];
    }

    function totalSupply() external view returns (uint256) {
        return _nextTokenId;
    }

    // Escape double quotes in strings for JSON
    function _escape(string memory s) internal pure returns (string memory) {
        bytes memory b = bytes(s);
        uint256 extras = 0;
        for (uint256 i = 0; i < b.length; i++) {
            if (b[i] == '"' || b[i] == '\\') extras++;
        }
        if (extras == 0) return s;
        bytes memory out = new bytes(b.length + extras);
        uint256 j = 0;
        for (uint256 i = 0; i < b.length; i++) {
            if (b[i] == '"' || b[i] == '\\') { out[j++] = '\\'; }
            out[j++] = b[i];
        }
        return string(out);
    }
}
