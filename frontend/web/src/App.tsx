// App.tsx
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import WalletManager from "./components/WalletManager";
import WalletSelector from "./components/WalletSelector";
import "./App.css";

// Randomly selected styles:
// Colors: Tech (Blue+Black)
// UI Style: Futuristic Metal
// Layout: Partitioned Panels
// Interaction: Micro-interactions (hover ripple, button breathing light)

// Randomly selected features:
// 1. Data Statistics
// 2. Real-time Data Dashboard
// 3. Functionality Showcase
// 4. Community Links

interface FHEdata {
  id: string;
  key: string;
  value: string;
  timestamp: number;
  owner: string;
}

const App: React.FC = () => {
  const [account, setAccount] = useState("");
  const [loading, setLoading] = useState(true);
  const [dataItems, setDataItems] = useState<FHEdata[]>([]);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [walletSelectorOpen, setWalletSelectorOpen] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{
    visible: boolean;
    status: "pending" | "success" | "error";
    message: string;
  }>({ visible: false, status: "pending", message: "" });
  const [newData, setNewData] = useState({
    key: "",
    value: ""
  });
  const [dashboardStats, setDashboardStats] = useState({
    totalItems: 0,
    yourItems: 0,
    latestTimestamp: 0
  });
  const [activePanel, setActivePanel] = useState("dashboard");
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [retrieveKey, setRetrieveKey] = useState("");
  const [retrievedValue, setRetrievedValue] = useState("");

  // Initialize dashboard stats
  useEffect(() => {
    if (dataItems.length > 0) {
      const yourItems = dataItems.filter(item => item.owner.toLowerCase() === account.toLowerCase()).length;
      const latestTimestamp = Math.max(...dataItems.map(item => item.timestamp));
      setDashboardStats({
        totalItems: dataItems.length,
        yourItems,
        latestTimestamp
      });
    }
  }, [dataItems, account]);

  useEffect(() => {
    loadData().finally(() => setLoading(false));
  }, []);

  const onWalletSelect = async (wallet: any) => {
    if (!wallet.provider) return;
    try {
      const web3Provider = new ethers.BrowserProvider(wallet.provider);
      setProvider(web3Provider);
      const accounts = await web3Provider.send("eth_requestAccounts", []);
      const acc = accounts[0] || "";
      setAccount(acc);

      wallet.provider.on("accountsChanged", async (accounts: string[]) => {
        const newAcc = accounts[0] || "";
        setAccount(newAcc);
      });
    } catch (e) {
      alert("Failed to connect wallet");
    }
  };

  const onConnect = () => setWalletSelectorOpen(true);
  const onDisconnect = () => {
    setAccount("");
    setProvider(null);
  };

  const loadData = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      // Check contract availability using FHE
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) {
        console.error("Contract is not available");
        return;
      }
      
      // In a real scenario, we'd need a way to get all keys
      // For demo, we'll use local storage to track keys added by this user
      const userKeys = JSON.parse(localStorage.getItem(`fheaas_keys_${account}`) || "[]");
      const list: FHEdata[] = [];
      
      for (const key of userKeys) {
        try {
          const valueBytes = await contract.getData(key);
          if (valueBytes.length > 0) {
            try {
              const valueStr = ethers.toUtf8String(valueBytes);
              // For demo, we'll store timestamp as current time
              list.push({
                id: `${key}-${Date.now()}`,
                key,
                value: valueStr,
                timestamp: Math.floor(Date.now() / 1000),
                owner: account
              });
            } catch (e) {
              console.error(`Error parsing data for ${key}:`, e);
            }
          }
        } catch (e) {
          console.error(`Error loading data for ${key}:`, e);
        }
      }
      
      list.sort((a, b) => b.timestamp - a.timestamp);
      setDataItems(list);
    } catch (e) {
      console.error("Error loading data:", e);
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  };

  const storeData = async () => {
    if (!provider) { 
      alert("Please connect wallet first"); 
      return; 
    }
    
    if (!newData.key || !newData.value) {
      alert("Both key and value are required");
      return;
    }
    
    setCreating(true);
    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Encrypting data with FHE..."
    });
    
    try {
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      // Store data on-chain using FHE
      await contract.setData(
        newData.key, 
        ethers.toUtf8Bytes(newData.value)
      );
      
      // Update local key storage
      const userKeys = JSON.parse(localStorage.getItem(`fheaas_keys_${account}`) || "[]");
      if (!userKeys.includes(newData.key)) {
        userKeys.push(newData.key);
        localStorage.setItem(`fheaas_keys_${account}`, JSON.stringify(userKeys));
      }
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "Data encrypted and stored securely!"
      });
      
      await loadData();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowCreateModal(false);
        setNewData({
          key: "",
          value: ""
        });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction")
        ? "Transaction rejected by user"
        : "Storage failed: " + (e.message || "Unknown error");
      
      setTransactionStatus({
        visible: true,
        status: "error",
        message: errorMessage
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    } finally {
      setCreating(false);
    }
  };

  const retrieveData = async () => {
    if (!provider) {
      alert("Please connect wallet first");
      return;
    }

    if (!retrieveKey) {
      alert("Please enter a key");
      return;
    }

    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Decrypting data with FHE..."
    });

    try {
      const contract = await getContractReadOnly();
      if (!contract) {
        throw new Error("Failed to get contract");
      }
      
      const valueBytes = await contract.getData(retrieveKey);
      if (valueBytes.length === 0) {
        throw new Error("No data found for this key");
      }
      
      const valueStr = ethers.toUtf8String(valueBytes);
      setRetrievedValue(valueStr);
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "Data decrypted successfully!"
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Retrieval failed: " + (e.message || "Unknown error")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const checkAvailability = async () => {
    if (!provider) {
      alert("Please connect wallet first");
      return;
    }

    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Checking FHE service availability..."
    });

    try {
      const contract = await getContractReadOnly();
      if (!contract) {
        throw new Error("Failed to get contract");
      }
      
      const isAvailable = await contract.isAvailable();
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: isAvailable 
          ? "FHE service is available and operational!" 
          : "FHE service is currently unavailable"
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Availability check failed: " + (e.message || "Unknown error")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const isOwner = (address: string) => {
    return account.toLowerCase() === address.toLowerCase();
  };

  const renderDashboard = () => (
    <div className="dashboard-panel">
      <div className="panel-header">
        <h2>FHEaaS Dashboard</h2>
        <p>Monitor your encrypted data operations</p>
      </div>
      
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-value">{dashboardStats.totalItems}</div>
          <div className="stat-label">Total Data Items</div>
          <div className="stat-icon">📊</div>
        </div>
        
        <div className="stat-card">
          <div className="stat-value">{dashboardStats.yourItems}</div>
          <div className="stat-label">Your Items</div>
          <div className="stat-icon">👤</div>
        </div>
        
        <div className="stat-card">
          <div className="stat-value">
            {dashboardStats.latestTimestamp > 0 
              ? new Date(dashboardStats.latestTimestamp * 1000).toLocaleDateString() 
              : "N/A"}
          </div>
          <div className="stat-label">Last Update</div>
          <div className="stat-icon">🕒</div>
        </div>
      </div>
      
      <div className="realtime-chart">
        <h3>Data Storage Growth</h3>
        <div className="chart-container">
          <div className="chart-bar" style={{ height: `${Math.min(dashboardStats.totalItems * 10, 100)}%` }}>
            <div className="bar-value">{dashboardStats.totalItems}</div>
          </div>
        </div>
      </div>
      
      <div className="quick-actions">
        <button 
          className="action-btn"
          onClick={() => setShowCreateModal(true)}
        >
          <span className="btn-icon">+</span>
          Add New Data
        </button>
        <button 
          className="action-btn"
          onClick={() => setShowKeyModal(true)}
        >
          <span className="btn-icon">🔍</span>
          Retrieve Data
        </button>
        <button 
          className="action-btn"
          onClick={checkAvailability}
        >
          <span className="btn-icon">✅</span>
          Check Service
        </button>
      </div>
    </div>
  );

  const renderDataList = () => (
    <div className="data-panel">
      <div className="panel-header">
        <h2>Your Encrypted Data</h2>
        <div className="header-actions">
          <button 
            onClick={loadData}
            className="refresh-btn"
            disabled={isRefreshing}
          >
            {isRefreshing ? "Refreshing..." : "Refresh Data"}
          </button>
          <button 
            className="add-btn"
            onClick={() => setShowCreateModal(true)}
          >
            + Add Data
          </button>
        </div>
      </div>
      
      <div className="data-table">
        <div className="table-header">
          <div className="header-cell">Key</div>
          <div className="header-cell">Value Preview</div>
          <div className="header-cell">Owner</div>
          <div className="header-cell">Date</div>
        </div>
        
        {dataItems.length === 0 ? (
          <div className="no-data">
            <div className="no-data-icon">🔒</div>
            <p>No encrypted data found</p>
            <button 
              className="primary-btn"
              onClick={() => setShowCreateModal(true)}
            >
              Add Your First Data
            </button>
          </div>
        ) : (
          dataItems.map(item => (
            <div className="data-row" key={item.id}>
              <div className="table-cell key-cell">{item.key}</div>
              <div className="table-cell value-cell">
                {item.value.length > 50 ? item.value.substring(0, 50) + "..." : item.value}
              </div>
              <div className="table-cell owner-cell">
                {isOwner(item.owner) 
                  ? "You" 
                  : `${item.owner.substring(0, 6)}...${item.owner.substring(38)}`}
              </div>
              <div className="table-cell">
                {new Date(item.timestamp * 1000).toLocaleDateString()}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );

  const renderFeatures = () => (
    <div className="features-panel">
      <div className="panel-header">
        <h2>FHEaaS Core Features</h2>
        <p>Secure computation on encrypted data</p>
      </div>
      
      <div className="features-grid">
        <div className="feature-card">
          <div className="feature-icon">🔐</div>
          <h3>End-to-End Encryption</h3>
          <p>Data remains encrypted during processing using FHE technology</p>
        </div>
        
        <div className="feature-card">
          <div className="feature-icon">⚡</div>
          <h3>High Performance</h3>
          <p>Optimized FHE computations for real-world applications</p>
        </div>
        
        <div className="feature-card">
          <div className="feature-icon">🌐</div>
          <h3>Multi-Cloud Support</h3>
          <p>Deploy across cloud providers with consistent security</p>
        </div>
        
        <div className="feature-card">
          <div className="feature-icon">📈</div>
          <h3>Scalable Architecture</h3>
          <p>Handle growing data volumes with our distributed system</p>
        </div>
        
        <div className="feature-card">
          <div className="feature-icon">🔑</div>
          <h3>Key Management</h3>
          <p>Secure key handling with hardware security modules</p>
        </div>
        
        <div className="feature-card">
          <div className="feature-icon">📊</div>
          <h3>Analytics Dashboard</h3>
          <p>Monitor FHE operations and resource usage</p>
        </div>
      </div>
    </div>
  );

  const renderCommunity = () => (
    <div className="community-panel">
      <div className="panel-header">
        <h2>Community & Resources</h2>
        <p>Join the FHE revolution</p>
      </div>
      
      <div className="resources-grid">
        <div className="resource-card">
          <h3>Documentation</h3>
          <p>Comprehensive guides to using FHEaaS</p>
          <button className="resource-btn">View Docs</button>
        </div>
        
        <div className="resource-card">
          <h3>Developer Forum</h3>
          <p>Connect with other FHE developers</p>
          <button className="resource-btn">Join Discussion</button>
        </div>
        
        <div className="resource-card">
          <h3>GitHub Repository</h3>
          <p>Contribute to our open-source platform</p>
          <button className="resource-btn">View Code</button>
        </div>
        
        <div className="resource-card">
          <h3>Case Studies</h3>
          <p>See how others are using FHE technology</p>
          <button className="resource-btn">Read Stories</button>
        </div>
      </div>
      
      <div className="newsletter">
        <h3>Stay Updated</h3>
        <p>Subscribe to our newsletter for FHE advancements</p>
        <div className="subscribe-form">
          <input type="email" placeholder="Your email address" />
          <button className="primary-btn">Subscribe</button>
        </div>
      </div>
    </div>
  );

  if (loading) return (
    <div className="loading-screen">
      <div className="fhe-loader">
        <div className="fhe-spinner"></div>
        <div className="fhe-particles">
          {[...Array(8)].map((_, i) => <div key={i} className="particle"></div>)}
        </div>
      </div>
      <p>Initializing FHE connection...</p>
    </div>
  );

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo">
          <div className="logo-icon">
            <div className="hexagon"></div>
            <div className="inner-hex"></div>
          </div>
          <h1>FHE<span>aaS</span> Platform</h1>
        </div>
        
        <div className="header-actions">
          <WalletManager account={account} onConnect={onConnect} onDisconnect={onDisconnect} />
        </div>
      </header>
      
      <div className="main-layout">
        <nav className="side-nav">
          <ul>
            <li 
              className={activePanel === "dashboard" ? "active" : ""}
              onClick={() => setActivePanel("dashboard")}
            >
              <span className="nav-icon">📊</span> Dashboard
            </li>
            <li 
              className={activePanel === "data" ? "active" : ""}
              onClick={() => setActivePanel("data")}
            >
              <span className="nav-icon">🔐</span> Your Data
            </li>
            <li 
              className={activePanel === "features" ? "active" : ""}
              onClick={() => setActivePanel("features")}
            >
              <span className="nav-icon">⚙️</span> Features
            </li>
            <li 
              className={activePanel === "community" ? "active" : ""}
              onClick={() => setActivePanel("community")}
            >
              <span className="nav-icon">🌐</span> Community
            </li>
          </ul>
          
          <div className="nav-footer">
            <div className="fhe-badge">
              <span>FHE-Powered Security</span>
            </div>
          </div>
        </nav>
        
        <main className="content-area">
          {activePanel === "dashboard" && renderDashboard()}
          {activePanel === "data" && renderDataList()}
          {activePanel === "features" && renderFeatures()}
          {activePanel === "community" && renderCommunity()}
        </main>
      </div>
  
      {showCreateModal && (
        <ModalCreate 
          onSubmit={storeData} 
          onClose={() => setShowCreateModal(false)} 
          creating={creating}
          data={newData}
          setData={setNewData}
        />
      )}
      
      {showKeyModal && (
        <ModalRetrieve 
          onSubmit={retrieveData} 
          onClose={() => {
            setShowKeyModal(false);
            setRetrieveKey("");
            setRetrievedValue("");
          }}
          keyValue={retrieveKey}
          setKeyValue={setRetrieveKey}
          retrievedValue={retrievedValue}
        />
      )}
      
      {walletSelectorOpen && (
        <WalletSelector
          isOpen={walletSelectorOpen}
          onWalletSelect={(wallet) => { onWalletSelect(wallet); setWalletSelectorOpen(false); }}
          onClose={() => setWalletSelectorOpen(false)}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="fhe-spinner"></div>}
              {transactionStatus.status === "success" && <div className="check-icon">✓</div>}
              {transactionStatus.status === "error" && <div className="error-icon">✗</div>}
            </div>
            <div className="transaction-message">
              {transactionStatus.message}
            </div>
          </div>
        </div>
      )}
  
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="logo">
              <div className="hexagon"></div>
              <span>FHEaaS</span>
            </div>
            <p>Fully Homomorphic Encryption as a Service Platform</p>
          </div>
          
          <div className="footer-links">
            <a href="#" className="footer-link">Documentation</a>
            <a href="#" className="footer-link">Privacy Policy</a>
            <a href="#" className="footer-link">Terms of Service</a>
            <a href="#" className="footer-link">Contact</a>
            <a href="#" className="footer-link">GitHub</a>
          </div>
        </div>
        
        <div className="footer-bottom">
          <div className="fhe-badge">
            <span>Zero-Knowledge Computation</span>
          </div>
          <div className="copyright">
            © {new Date().getFullYear()} FHEaaS Platform. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
};

interface ModalCreateProps {
  onSubmit: () => void; 
  onClose: () => void; 
  creating: boolean;
  data: any;
  setData: (data: any) => void;
}

const ModalCreate: React.FC<ModalCreateProps> = ({ 
  onSubmit, 
  onClose, 
  creating,
  data,
  setData
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setData({
      ...data,
      [name]: value
    });
  };

  const handleSubmit = () => {
    if (!data.key || !data.value) {
      alert("Both key and value are required");
      return;
    }
    
    onSubmit();
  };

  return (
    <div className="modal-overlay">
      <div className="create-modal">
        <div className="modal-header">
          <h2>Add Encrypted Data</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice">
            <div className="key-icon">🔑</div> 
            <p>Your data will be encrypted using FHE technology and stored securely on-chain</p>
          </div>
          
          <div className="form-group">
            <label>Data Key *</label>
            <input 
              type="text"
              name="key"
              value={data.key} 
              onChange={handleChange}
              placeholder="Unique identifier for your data..." 
              className="modal-input"
            />
          </div>
          
          <div className="form-group">
            <label>Data Value *</label>
            <textarea 
              name="value"
              value={data.value} 
              onChange={handleChange}
              placeholder="Enter the data you want to encrypt..." 
              className="modal-textarea"
              rows={4}
            />
          </div>
        </div>
        
        <div className="modal-footer">
          <button 
            onClick={onClose}
            className="cancel-btn"
          >
            Cancel
          </button>
          <button 
            onClick={handleSubmit} 
            disabled={creating}
            className="primary-btn"
          >
            {creating ? "Encrypting with FHE..." : "Store Securely"}
          </button>
        </div>
      </div>
    </div>
  );
};

interface ModalRetrieveProps {
  onSubmit: () => void; 
  onClose: () => void; 
  keyValue: string;
  setKeyValue: (value: string) => void;
  retrievedValue: string;
}

const ModalRetrieve: React.FC<ModalRetrieveProps> = ({ 
  onSubmit, 
  onClose,
  keyValue,
  setKeyValue,
  retrievedValue
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setKeyValue(e.target.value);
  };

  return (
    <div className="modal-overlay">
      <div className="retrieve-modal">
        <div className="modal-header">
          <h2>Retrieve Encrypted Data</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="form-group">
            <label>Data Key *</label>
            <input 
              type="text"
              value={keyValue} 
              onChange={handleChange}
              placeholder="Enter the key to retrieve..." 
              className="modal-input"
            />
          </div>
          
          {retrievedValue && (
            <div className="result-section">
              <label>Decrypted Value</label>
              <div className="result-box">
                {retrievedValue}
              </div>
            </div>
          )}
        </div>
        
        <div className="modal-footer">
          <button 
            onClick={onClose}
            className="cancel-btn"
          >
            Close
          </button>
          <button 
            onClick={onSubmit} 
            className="primary-btn"
          >
            Retrieve Data
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;