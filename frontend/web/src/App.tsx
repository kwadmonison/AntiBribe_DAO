import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useEffect, useState } from "react";
import { getContractReadOnly, getContractWithSigner } from "./components/useContract";
import "./App.css";
import { useAccount } from 'wagmi';
import { useFhevm, useEncrypt, useDecrypt } from '../fhevm-sdk/src';
import { ethers } from 'ethers';

interface ProposalData {
  id: string;
  name: string;
  description: string;
  timestamp: number;
  creator: string;
  publicValue1: number;
  publicValue2: number;
  isVerified?: boolean;
  decryptedValue?: number;
}

interface VoteRecord {
  id: string;
  proposalId: string;
  timestamp: number;
  voter: string;
  action: string;
}

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const [loading, setLoading] = useState(true);
  const [proposals, setProposals] = useState<ProposalData[]>([]);
  const [voteHistory, setVoteHistory] = useState<VoteRecord[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creatingProposal, setCreatingProposal] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({ 
    visible: false, 
    status: "pending" as const, 
    message: "" 
  });
  const [newProposalData, setNewProposalData] = useState({ name: "", description: "", voteValue: "" });
  const [selectedProposal, setSelectedProposal] = useState<ProposalData | null>(null);
  const [decryptedVote, setDecryptedVote] = useState<number | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [contractAddress, setContractAddress] = useState("");
  const [fhevmInitializing, setFhevmInitializing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");

  const { status, initialize, isInitialized } = useFhevm();
  const { encrypt, isEncrypting} = useEncrypt();
  const { verifyDecryption, isDecrypting: fheIsDecrypting } = useDecrypt();

  useEffect(() => {
    const initFhevmAfterConnection = async () => {
      if (!isConnected) return;
      if (isInitialized) return;
      if (fhevmInitializing) return;
      
      try {
        setFhevmInitializing(true);
        console.log('Initializing FHEVM after wallet connection...');
        await initialize();
        console.log('FHEVM initialized successfully');
      } catch (error) {
        console.error('Failed to initialize FHEVM:', error);
        setTransactionStatus({ 
          visible: true, 
          status: "error", 
          message: "FHEVM initialization failed. Please check your wallet connection." 
        });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      } finally {
        setFhevmInitializing(false);
      }
    };

    initFhevmAfterConnection();
  }, [isConnected, isInitialized, initialize, fhevmInitializing]);

  useEffect(() => {
    const loadDataAndContract = async () => {
      if (!isConnected) {
        setLoading(false);
        return;
      }
      
      try {
        await loadData();
        const contract = await getContractReadOnly();
        if (contract) setContractAddress(await contract.getAddress());
      } catch (error) {
        console.error('Failed to load data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadDataAndContract();
  }, [isConnected]);

  const loadData = async () => {
    if (!isConnected) return;
    
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const businessIds = await contract.getAllBusinessIds();
      const proposalsList: ProposalData[] = [];
      
      for (const businessId of businessIds) {
        try {
          const businessData = await contract.getBusinessData(businessId);
          proposalsList.push({
            id: businessId,
            name: businessData.name,
            description: businessData.description,
            timestamp: Number(businessData.timestamp),
            creator: businessData.creator,
            publicValue1: Number(businessData.publicValue1) || 0,
            publicValue2: Number(businessData.publicValue2) || 0,
            isVerified: businessData.isVerified,
            decryptedValue: Number(businessData.decryptedValue) || 0
          });
        } catch (e) {
          console.error('Error loading business data:', e);
        }
      }
      
      setProposals(proposalsList);
      
      const mockHistory: VoteRecord[] = [
        { id: "1", proposalId: "prop-1", timestamp: Date.now()/1000 - 3600, voter: address!, action: "Created Proposal" },
        { id: "2", proposalId: "prop-2", timestamp: Date.now()/1000 - 7200, voter: address!, action: "Voted Yes" },
        { id: "3", proposalId: "prop-3", timestamp: Date.now()/1000 - 10800, voter: address!, action: "Verified Vote" }
      ];
      setVoteHistory(mockHistory);
    } catch (e) {
      setTransactionStatus({ visible: true, status: "error", message: "Failed to load data" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setIsRefreshing(false); 
    }
  };

  const createProposal = async () => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return; 
    }
    
    setCreatingProposal(true);
    setTransactionStatus({ visible: true, status: "pending", message: "Creating proposal with Zama FHE..." });
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      
      const voteValue = parseInt(newProposalData.voteValue) || 1;
      const businessId = `proposal-${Date.now()}`;
      
      const encryptedResult = await encrypt(contractAddress, address, voteValue);
      
      const tx = await contract.createBusinessData(
        businessId,
        newProposalData.name,
        encryptedResult.encryptedData,
        encryptedResult.proof,
        0,
        0,
        newProposalData.description
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "Waiting for transaction confirmation..." });
      await tx.wait();
      
      setTransactionStatus({ visible: true, status: "success", message: "Proposal created successfully!" });
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
      
      await loadData();
      setShowCreateModal(false);
      setNewProposalData({ name: "", description: "", voteValue: "" });
    } catch (e: any) {
      const errorMessage = e.message?.includes("user rejected transaction") 
        ? "Transaction rejected by user" 
        : "Submission failed: " + (e.message || "Unknown error");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { 
      setCreatingProposal(false); 
    }
  };

  const decryptVote = async (proposalId: string): Promise<number | null> => {
    if (!isConnected || !address) { 
      setTransactionStatus({ visible: true, status: "error", message: "Please connect wallet first" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null; 
    }
    
    setIsDecrypting(true);
    try {
      const contractRead = await getContractReadOnly();
      if (!contractRead) return null;
      
      const businessData = await contractRead.getBusinessData(proposalId);
      if (businessData.isVerified) {
        const storedValue = Number(businessData.decryptedValue) || 0;
        
        setTransactionStatus({ 
          visible: true, 
          status: "success", 
          message: "Vote already verified on-chain" 
        });
        setTimeout(() => {
          setTransactionStatus({ visible: false, status: "pending", message: "" });
        }, 2000);
        
        return storedValue;
      }
      
      const contractWrite = await getContractWithSigner();
      if (!contractWrite) return null;
      
      const encryptedValueHandle = await contractRead.getEncryptedValue(proposalId);
      
      const result = await verifyDecryption(
        [encryptedValueHandle],
        contractAddress,
        (abiEncodedClearValues: string, decryptionProof: string) => 
          contractWrite.verifyDecryption(proposalId, abiEncodedClearValues, decryptionProof)
      );
      
      setTransactionStatus({ visible: true, status: "pending", message: "Verifying vote on-chain..." });
      
      const clearValue = result.decryptionResult.clearValues[encryptedValueHandle];
      
      await loadData();
      
      setTransactionStatus({ visible: true, status: "success", message: "Vote decrypted and verified successfully!" });
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
      
      return Number(clearValue);
      
    } catch (e: any) { 
      if (e.message?.includes("Data already verified")) {
        setTransactionStatus({ 
          visible: true, 
          status: "success", 
          message: "Vote is already verified on-chain" 
        });
        setTimeout(() => {
          setTransactionStatus({ visible: false, status: "pending", message: "" });
        }, 2000);
        
        await loadData();
        return null;
      }
      
      setTransactionStatus({ 
        visible: true, 
        status: "error", 
        message: "Decryption failed: " + (e.message || "Unknown error") 
      });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
      return null; 
    } finally { 
      setIsDecrypting(false); 
    }
  };

  const testAvailability = async () => {
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const isAvailable = await contract.isAvailable();
      if (isAvailable) {
        setTransactionStatus({ visible: true, status: "success", message: "Contract is available and working!" });
        setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
      }
    } catch (e) {
      setTransactionStatus({ visible: true, status: "error", message: "Availability check failed" });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const filteredProposals = proposals.filter(proposal => {
    const matchesSearch = proposal.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         proposal.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = activeFilter === "all" || 
                         (activeFilter === "verified" && proposal.isVerified) ||
                         (activeFilter === "pending" && !proposal.isVerified);
    return matchesSearch && matchesFilter;
  });

  const stats = {
    total: proposals.length,
    verified: proposals.filter(p => p.isVerified).length,
    pending: proposals.filter(p => !p.isVerified).length,
    today: proposals.filter(p => Date.now()/1000 - p.timestamp < 86400).length
  };

  if (!isConnected) {
    return (
      <div className="app-container">
        <header className="app-header">
          <div className="logo">
            <h1>抗賄選治理系統</h1>
            <span className="tagline">FHE Protected Voting</span>
          </div>
          <div className="header-actions">
            <div className="wallet-connect-wrapper">
              <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
            </div>
          </div>
        </header>
        
        <div className="connection-prompt">
          <div className="connection-content">
            <div className="connection-icon">🔐</div>
            <h2>Connect Your Wallet to Continue</h2>
            <p>Please connect your wallet to initialize the encrypted voting system and access governance proposals.</p>
            <div className="connection-steps">
              <div className="step">
                <span>1</span>
                <p>Connect your wallet using the button above</p>
              </div>
              <div className="step">
                <span>2</span>
                <p>FHE system will automatically initialize</p>
              </div>
              <div className="step">
                <span>3</span>
                <p>Start creating and verifying encrypted votes</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!isInitialized || fhevmInitializing) {
    return (
      <div className="loading-screen">
        <div className="fhe-spinner"></div>
        <p>Initializing FHE Encryption System...</p>
        <p>Status: {fhevmInitializing ? "Initializing FHEVM" : status}</p>
        <p className="loading-note">This may take a few moments</p>
      </div>
    );
  }

  if (loading) return (
    <div className="loading-screen">
      <div className="fhe-spinner"></div>
      <p>Loading encrypted governance system...</p>
    </div>
  );

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo">
          <h1>抗賄選治理系統</h1>
          <span className="tagline">FHE Protected Voting</span>
        </div>
        
        <div className="header-actions">
          <button 
            onClick={() => setShowCreateModal(true)} 
            className="create-btn metal-btn"
          >
            + New Proposal
          </button>
          <button onClick={testAvailability} className="test-btn metal-btn">
            Test Contract
          </button>
          <div className="wallet-connect-wrapper">
            <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
          </div>
        </div>
      </header>
      
      <div className="main-content-container">
        <div className="stats-panels">
          <div className="stat-panel metal-panel">
            <div className="stat-icon">📊</div>
            <div className="stat-content">
              <div className="stat-value">{stats.total}</div>
              <div className="stat-label">Total Proposals</div>
            </div>
          </div>
          
          <div className="stat-panel metal-panel">
            <div className="stat-icon">✅</div>
            <div className="stat-content">
              <div className="stat-value">{stats.verified}</div>
              <div className="stat-label">Verified Votes</div>
            </div>
          </div>
          
          <div className="stat-panel metal-panel">
            <div className="stat-icon">⏳</div>
            <div className="stat-content">
              <div className="stat-value">{stats.pending}</div>
              <div className="stat-label">Pending Verification</div>
            </div>
          </div>
          
          <div className="stat-panel metal-panel">
            <div className="stat-icon">🆕</div>
            <div className="stat-content">
              <div className="stat-value">{stats.today}</div>
              <div className="stat-label">Today's Proposals</div>
            </div>
          </div>
        </div>

        <div className="search-filters">
          <div className="search-box">
            <input 
              type="text" 
              placeholder="Search proposals..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input metal-input"
            />
          </div>
          
          <div className="filter-buttons">
            <button 
              className={`filter-btn ${activeFilter === "all" ? "active" : ""} metal-btn`}
              onClick={() => setActiveFilter("all")}
            >
              All
            </button>
            <button 
              className={`filter-btn ${activeFilter === "verified" ? "active" : ""} metal-btn`}
              onClick={() => setActiveFilter("verified")}
            >
              Verified
            </button>
            <button 
              className={`filter-btn ${activeFilter === "pending" ? "active" : ""} metal-btn`}
              onClick={() => setActiveFilter("pending")}
            >
              Pending
            </button>
          </div>
        </div>

        <div className="content-split">
          <div className="proposals-section">
            <div className="section-header">
              <h2>Governance Proposals</h2>
              <button 
                onClick={loadData} 
                className="refresh-btn metal-btn" 
                disabled={isRefreshing}
              >
                {isRefreshing ? "Refreshing..." : "Refresh"}
              </button>
            </div>
            
            <div className="proposals-list">
              {filteredProposals.length === 0 ? (
                <div className="no-proposals metal-panel">
                  <p>No proposals found</p>
                  <button 
                    className="create-btn metal-btn" 
                    onClick={() => setShowCreateModal(true)}
                  >
                    Create First Proposal
                  </button>
                </div>
              ) : filteredProposals.map((proposal, index) => (
                <div 
                  className={`proposal-item metal-panel ${selectedProposal?.id === proposal.id ? "selected" : ""} ${proposal.isVerified ? "verified" : ""}`} 
                  key={index}
                  onClick={() => setSelectedProposal(proposal)}
                >
                  <div className="proposal-header">
                    <div className="proposal-title">{proposal.name}</div>
                    <div className={`proposal-status ${proposal.isVerified ? "verified" : "pending"}`}>
                      {proposal.isVerified ? "✅ Verified" : "🔓 Pending"}
                    </div>
                  </div>
                  <div className="proposal-description">{proposal.description}</div>
                  <div className="proposal-meta">
                    <span>Created: {new Date(proposal.timestamp * 1000).toLocaleDateString()}</span>
                    <span>By: {proposal.creator.substring(0, 6)}...{proposal.creator.substring(38)}</span>
                  </div>
                  {proposal.isVerified && proposal.decryptedValue && (
                    <div className="proposal-vote">
                      Final Vote: {proposal.decryptedValue}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="history-section">
            <div className="section-header">
              <h2>Vote History</h2>
            </div>
            <div className="history-list">
              {voteHistory.map((record, index) => (
                <div className="history-item metal-panel" key={index}>
                  <div className="history-action">{record.action}</div>
                  <div className="history-details">
                    <span>Proposal: {record.proposalId}</span>
                    <span>{new Date(record.timestamp * 1000).toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      
      {showCreateModal && (
        <ModalCreateProposal 
          onSubmit={createProposal} 
          onClose={() => setShowCreateModal(false)} 
          creating={creatingProposal} 
          proposalData={newProposalData} 
          setProposalData={setNewProposalData}
          isEncrypting={isEncrypting}
        />
      )}
      
      {selectedProposal && (
        <ProposalDetailModal 
          proposal={selectedProposal} 
          onClose={() => { 
            setSelectedProposal(null); 
            setDecryptedVote(null); 
          }} 
          decryptedVote={decryptedVote} 
          setDecryptedVote={setDecryptedVote} 
          isDecrypting={isDecrypting || fheIsDecrypting} 
          decryptVote={() => decryptVote(selectedProposal.id)}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content metal-panel">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="fhe-spinner"></div>}
              {transactionStatus.status === "success" && <div className="success-icon">✓</div>}
              {transactionStatus.status === "error" && <div className="error-icon">✗</div>}
            </div>
            <div className="transaction-message">{transactionStatus.message}</div>
          </div>
        </div>
      )}
    </div>
  );
};

const ModalCreateProposal: React.FC<{
  onSubmit: () => void; 
  onClose: () => void; 
  creating: boolean;
  proposalData: any;
  setProposalData: (data: any) => void;
  isEncrypting: boolean;
}> = ({ onSubmit, onClose, creating, proposalData, setProposalData, isEncrypting }) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    if (name === 'voteValue') {
      const intValue = value.replace(/[^\d]/g, '');
      setProposalData({ ...proposalData, [name]: intValue });
    } else {
      setProposalData({ ...proposalData, [name]: value });
    }
  };

  return (
    <div className="modal-overlay">
      <div className="create-proposal-modal metal-panel">
        <div className="modal-header">
          <h2>New Governance Proposal</h2>
          <button onClick={onClose} className="close-modal metal-btn">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice metal-panel">
            <strong>FHE 🔐 Vote Encryption</strong>
            <p>Your vote will be encrypted with Zama FHE to prevent bribery</p>
          </div>
          
          <div className="form-group">
            <label>Proposal Title *</label>
            <input 
              type="text" 
              name="name" 
              value={proposalData.name} 
              onChange={handleChange} 
              placeholder="Enter proposal title..." 
              className="metal-input"
            />
          </div>
          
          <div className="form-group">
            <label>Proposal Description *</label>
            <textarea 
              name="description" 
              value={proposalData.description} 
              onChange={handleChange} 
              placeholder="Describe your proposal..." 
              className="metal-input"
              rows={3}
            />
          </div>
          
          <div className="form-group">
            <label>Your Vote (Integer 1-10) *</label>
            <input 
              type="number" 
              name="voteValue" 
              min="1" 
              max="10" 
              value={proposalData.voteValue} 
              onChange={handleChange} 
              placeholder="Enter your vote (1-10)..." 
              className="metal-input"
            />
            <div className="data-type-label">FHE Encrypted Integer</div>
          </div>
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="cancel-btn metal-btn">Cancel</button>
          <button 
            onClick={onSubmit} 
            disabled={creating || isEncrypting || !proposalData.name || !proposalData.description || !proposalData.voteValue} 
            className="submit-btn metal-btn"
          >
            {creating || isEncrypting ? "Encrypting and Creating..." : "Create Proposal"}
          </button>
        </div>
      </div>
    </div>
  );
};

const ProposalDetailModal: React.FC<{
  proposal: ProposalData;
  onClose: () => void;
  decryptedVote: number | null;
  setDecryptedVote: (value: number | null) => void;
  isDecrypting: boolean;
  decryptVote: () => Promise<number | null>;
}> = ({ proposal, onClose, decryptedVote, setDecryptedVote, isDecrypting, decryptVote }) => {
  const handleDecrypt = async () => {
    if (decryptedVote !== null) { 
      setDecryptedVote(null); 
      return; 
    }
    
    const decrypted = await decryptVote();
    if (decrypted !== null) {
      setDecryptedVote(decrypted);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="proposal-detail-modal metal-panel">
        <div className="modal-header">
          <h2>Proposal Details</h2>
          <button onClick={onClose} className="close-modal metal-btn">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="proposal-info">
            <div className="info-item">
              <span>Title:</span>
              <strong>{proposal.name}</strong>
            </div>
            <div className="info-item">
              <span>Description:</span>
              <strong>{proposal.description}</strong>
            </div>
            <div className="info-item">
              <span>Creator:</span>
              <strong>{proposal.creator.substring(0, 6)}...{proposal.creator.substring(38)}</strong>
            </div>
            <div className="info-item">
              <span>Date Created:</span>
              <strong>{new Date(proposal.timestamp * 1000).toLocaleDateString()}</strong>
            </div>
          </div>
          
          <div className="vote-section">
            <h3>Encrypted Vote Data</h3>
            
            <div className="vote-display">
              <div className="vote-value">
                {proposal.isVerified && proposal.decryptedValue ? 
                  `${proposal.decryptedValue} (On-chain Verified)` : 
                  decryptedVote !== null ? 
                  `${decryptedVote} (Locally Decrypted)` : 
                  "🔒 FHE Encrypted Vote"
                }
              </div>
              <button 
                className={`decrypt-btn metal-btn ${(proposal.isVerified || decryptedVote !== null) ? 'decrypted' : ''}`}
                onClick={handleDecrypt} 
                disabled={isDecrypting}
              >
                {isDecrypting ? (
                  "🔓 Verifying..."
                ) : proposal.isVerified ? (
                  "✅ Verified"
                ) : decryptedVote !== null ? (
                  "🔄 Re-verify"
                ) : (
                  "🔓 Verify Vote"
                )}
              </button>
            </div>
            
            <div className="fhe-explanation metal-panel">
              <div className="fhe-icon">🔐</div>
              <div>
                <strong>FHE Protected Voting</strong>
                <p>Your vote is encrypted to prevent vote buying. Only you can decrypt and verify it on-chain.</p>
              </div>
            </div>
          </div>
        </div>
        
        <div className="modal-footer">
          <button onClick={onClose} className="close-btn metal-btn">Close</button>
          {!proposal.isVerified && (
            <button 
              onClick={handleDecrypt} 
              disabled={isDecrypting}
              className="verify-btn metal-btn"
            >
              {isDecrypting ? "Verifying on-chain..." : "Verify on-chain"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default App;


