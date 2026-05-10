// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts/utils/Base64.sol";

contract ChronicleNFT is ERC721, Ownable {
    using Strings for uint256;

    struct Chronicle {
        string  playerName;
        uint256 score;
        uint256 kills;
        uint256 length;
        string  killedBy;
        string  epitaph;
        string  portraitUri;
        uint256 timestamp;
    }

    uint256 private _nextTokenId;
    mapping(uint256 => Chronicle) private _chronicles;
    mapping(address => uint256[]) private _playerTokens;

    event ChroniclesMinted(uint256 indexed tokenId, address indexed player, string playerName);

    // OZ v4: Ownable() takes no args
    constructor() ERC721("Snake Death Chronicle", "SNKC") Ownable() {}

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

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        require(_exists(tokenId), "ERC721: invalid token ID");
        Chronicle memory c = _chronicles[tokenId];

        string memory json = string(abi.encodePacked(
            '{"name":"Chronicle #', tokenId.toString(), ' - ', c.playerName, '",',
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
        require(_exists(tokenId), "ERC721: invalid token ID");
        return _chronicles[tokenId];
    }

    function tokensOf(address player) external view returns (uint256[] memory) {
        return _playerTokens[player];
    }

    function totalSupply() external view returns (uint256) {
        return _nextTokenId;
    }

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
