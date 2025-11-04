pragma solidity ^0.8.24;

import { FHE, euint32, externalEuint32 } from "@fhevm/solidity/lib/FHE.sol";
import { ZamaEthereumConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract AntiBribeDAO is ZamaEthereumConfig {
    struct Proposal {
        string title;
        euint32 encryptedVoteCount;
        uint256 publicThreshold;
        string description;
        address creator;
        uint256 timestamp;
        uint32 decryptedVoteCount;
        bool isVerified;
    }

    struct Vote {
        string proposalId;
        euint32 encryptedVote;
        address voter;
        uint256 timestamp;
        bool isVerified;
    }

    mapping(string => Proposal) public proposals;
    mapping(string => Vote) public votes;
    string[] public proposalIds;
    string[] public voteIds;

    event ProposalCreated(string indexed proposalId, address indexed creator);
    event VoteCast(string indexed voteId, address indexed voter);
    event DecryptionVerified(string indexed id, uint32 decryptedValue);

    constructor() ZamaEthereumConfig() {}

    function createProposal(
        string calldata proposalId,
        string calldata title,
        externalEuint32 encryptedVoteCount,
        bytes calldata inputProof,
        uint256 publicThreshold,
        string calldata description
    ) external {
        require(bytes(proposals[proposalId].title).length == 0, "Proposal already exists");
        require(FHE.isInitialized(FHE.fromExternal(encryptedVoteCount, inputProof)), "Invalid encrypted input");

        proposals[proposalId] = Proposal({
            title: title,
            encryptedVoteCount: FHE.fromExternal(encryptedVoteCount, inputProof),
            publicThreshold: publicThreshold,
            description: description,
            creator: msg.sender,
            timestamp: block.timestamp,
            decryptedVoteCount: 0,
            isVerified: false
        });

        FHE.allowThis(proposals[proposalId].encryptedVoteCount);
        FHE.makePubliclyDecryptable(proposals[proposalId].encryptedVoteCount);
        proposalIds.push(proposalId);

        emit ProposalCreated(proposalId, msg.sender);
    }

    function castVote(
        string calldata voteId,
        string calldata proposalId,
        externalEuint32 encryptedVote,
        bytes calldata inputProof
    ) external {
        require(bytes(votes[voteId].proposalId).length == 0, "Vote already exists");
        require(FHE.isInitialized(FHE.fromExternal(encryptedVote, inputProof)), "Invalid encrypted input");

        votes[voteId] = Vote({
            proposalId: proposalId,
            encryptedVote: FHE.fromExternal(encryptedVote, inputProof),
            voter: msg.sender,
            timestamp: block.timestamp,
            isVerified: false
        });

        FHE.allowThis(votes[voteId].encryptedVote);
        FHE.makePubliclyDecryptable(votes[voteId].encryptedVote);
        voteIds.push(voteId);

        emit VoteCast(voteId, msg.sender);
    }

    function verifyDecryption(
        string calldata id,
        bytes memory abiEncodedClearValue,
        bytes memory decryptionProof
    ) external {
        require(bytes(proposals[id].title).length > 0 || bytes(votes[id].proposalId).length > 0, "Data does not exist");
        require(!proposals[id].isVerified && !votes[id].isVerified, "Data already verified");

        bytes32[] memory cts = new bytes32[](1);
        if (bytes(proposals[id].title).length > 0) {
            cts[0] = FHE.toBytes32(proposals[id].encryptedVoteCount);
        } else {
            cts[0] = FHE.toBytes32(votes[id].encryptedVote);
        }

        FHE.checkSignatures(cts, abiEncodedClearValue, decryptionProof);
        uint32 decodedValue = abi.decode(abiEncodedClearValue, (uint32));

        if (bytes(proposals[id].title).length > 0) {
            proposals[id].decryptedVoteCount = decodedValue;
            proposals[id].isVerified = true;
        } else {
            votes[id].isVerified = true;
        }

        emit DecryptionVerified(id, decodedValue);
    }

    function getEncryptedVoteCount(string calldata proposalId) external view returns (euint32) {
        require(bytes(proposals[proposalId].title).length > 0, "Proposal does not exist");
        return proposals[proposalId].encryptedVoteCount;
    }

    function getEncryptedVote(string calldata voteId) external view returns (euint32) {
        require(bytes(votes[voteId].proposalId).length > 0, "Vote does not exist");
        return votes[voteId].encryptedVote;
    }

    function getProposal(string calldata proposalId) external view returns (
        string memory title,
        uint256 publicThreshold,
        string memory description,
        address creator,
        uint256 timestamp,
        bool isVerified,
        uint32 decryptedVoteCount
    ) {
        require(bytes(proposals[proposalId].title).length > 0, "Proposal does not exist");
        Proposal storage p = proposals[proposalId];
        return (p.title, p.publicThreshold, p.description, p.creator, p.timestamp, p.isVerified, p.decryptedVoteCount);
    }

    function getVote(string calldata voteId) external view returns (
        string memory proposalId,
        address voter,
        uint256 timestamp,
        bool isVerified
    ) {
        require(bytes(votes[voteId].proposalId).length > 0, "Vote does not exist");
        Vote storage v = votes[voteId];
        return (v.proposalId, v.voter, v.timestamp, v.isVerified);
    }

    function getAllProposalIds() external view returns (string[] memory) {
        return proposalIds;
    }

    function getAllVoteIds() external view returns (string[] memory) {
        return voteIds;
    }

    function isAvailable() public pure returns (bool) {
        return true;
    }
}


