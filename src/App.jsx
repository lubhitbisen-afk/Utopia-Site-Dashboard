import React, { useState, useEffect, useCallback } from 'react';
import { syncAllSheets, writeRow, getStoredSettings, getLocalCache } from './utils/sheets';
import Schedule from './components/Schedule';
import Issues from './components/Issues';
import DPR from './components/DPR';
import Insights from './components/Insights';
import Settings from './components/Settings';
import DailyReportModal from './components/DailyReportModal';
import { Calendar, AlertCircle, ShieldAlert, BarChart2, ClipboardList, Settings as SettingsIcon, RefreshCw, AlertTriangle, Moon, Sun, Layers, Printer } from 'lucide-react';


export default function App() {
  const [activeTab, setActiveTab] = useState("schedule");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [lastSynced, setLastSynced] = useState("");
  const [syncError, setSyncError] = useState(null);
  const [settings, setSettings] = useState(getStoredSettings());
  const [showReportModal, setShowReportModal] = useState(false);

  // Main Data States
  const [scheduleData, setScheduleData] = useState([]);
  const [qualityData, setQualityData] = useState([]);
  const [safetyData, setSafetyData] = useState([]);
  const [operationalData, setOperationalData] = useState([]);
  const [dprData, setDprData] = useState([]);

  // Fetch all sheets from API/Script/Mock
  const performSync = useCallback(async (isInitial = false) => {
    if (isInitial) setLoading(true);
    else setSyncing(true);
    
    setSyncError(null);
    try {
      const result = await syncAllSheets();
      
      setScheduleData(result.data.Schedule || []);
      setQualityData(result.data.Quality || result.data.QualityIssues || result.data["Quality Issues"] || []);
      setSafetyData(result.data.Safety || result.data.SafetyIssues || result.data["Safety Issues"] || []);
      setOperationalData(result.data.Operational || result.data.OperationalInefficiencies || result.data["Operational Inefficiencies"] || []);
      setDprData(result.data.DPR || []);
      
      setLastSynced(result.timestamp);
    } catch (err) {
      console.error("Sync routine failure:", err);
      setSyncError(err.message);
      
      // Load from local storage cache if available
      const cache = getLocalCache();
      if (cache.data) {
        setScheduleData(cache.data.Schedule || []);
        setQualityData(cache.data.Quality || cache.data["Quality Issues"] || []);
        setSafetyData(cache.data.Safety || cache.data["Safety Issues"] || []);
        setOperationalData(cache.data.Operational || cache.data["Operational Inefficiencies"] || []);
        setDprData(cache.data.DPR || []);
        if (cache.timestamp) {
          setLastSynced(cache.timestamp + " (Loaded from offline cache)");
        }
      }
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  }, []);

  // Sync on startup and when settings update
  useEffect(() => {
    performSync(true);
  }, [settings.mode, settings.scriptUrl, settings.apiKey, settings.sheetId, performSync]);

  // Sync theme on load
  useEffect(() => {
    document.body.classList.toggle('light-mode', settings.theme === 'light');
  }, [settings.theme]);

  // Add Row Handler
  const handleAddRow = async (tabName, rowData) => {
    setSyncing(true);
    setSyncError(null);
    try {
      const result = await writeRow(tabName, rowData, "insert");
      // Update UI with returned data
      updateLocalStates(tabName, result.data);
      setLastSynced(new Date().toLocaleString());
    } catch (err) {
      setSyncError(err.message);
      // Re-fetch to realign state
      performSync();
    } finally {
      setSyncing(false);
    }
  };

  // Update Row Handler
  const handleUpdateRow = async (tabName, rowData, rowIndex, _id) => {
    setSyncing(true);
    setSyncError(null);
    try {
      const result = await writeRow(tabName, rowData, "update", rowIndex);
      updateLocalStates(tabName, result.data);
      setLastSynced(new Date().toLocaleString());
    } catch (err) {
      setSyncError(err.message);
      performSync();
    } finally {
      setSyncing(false);
    }
  };

  // Delete Row Handler
  const handleDeleteRow = async (tabName, rowIndex, _id) => {
    setSyncing(true);
    setSyncError(null);
    try {
      const result = await writeRow(tabName, null, "delete", rowIndex);
      updateLocalStates(tabName, result.data);
      setLastSynced(new Date().toLocaleString());
    } catch (err) {
      setSyncError(err.message);
      performSync();
    } finally {
      setSyncing(false);
    }
  };

  // Bulk Resolve Handler
  const handleBulkResolve = async (tabName, updates) => {
    setSyncing(true);
    setSyncError(null);
    
    try {
      let finalData = null;
      // Perform sequential updates to prevent cell concurrency overlap issues in Google Sheets
      for (const update of updates) {
        const res = await writeRow(tabName, update.data, "update", update.rowIndex);
        finalData = res.data;
      }
      if (finalData) {
        updateLocalStates(tabName, finalData);
      }
      setLastSynced(new Date().toLocaleString());
    } catch (err) {
      setSyncError(err.message);
      performSync();
    } finally {
      setSyncing(false);
    }
  };

  // Local state update helper
  const updateLocalStates = (tabName, fullDataset) => {
    setScheduleData(fullDataset.Schedule || []);
    setQualityData(fullDataset.Quality || fullDataset["Quality Issues"] || []);
    setSafetyData(fullDataset.Safety || fullDataset["Safety Issues"] || []);
    setOperationalData(fullDataset.Operational || fullDataset["Operational Inefficiencies"] || []);
    setDprData(fullDataset.DPR || []);
  };

  const handleSettingsSaved = (newSettings) => {
    setSettings(newSettings);
  };

  // Toggle theme utility
  const toggleTheme = () => {
    const nextTheme = settings.theme === 'dark' ? 'light' : 'dark';
    const updatedSettings = { ...settings, theme: nextTheme };
    setSettings(updatedSettings);
    localStorage.setItem("site_dashboard_settings", JSON.stringify(updatedSettings));
  };

  // Render proper tab content
  const renderTabContent = () => {
    switch (activeTab) {
      case "schedule":
        return (
          <Schedule
            data={scheduleData}
            onAdd={handleAddRow}
            onUpdate={handleUpdateRow}
            onDelete={handleDeleteRow}
          />
        );
      case "quality":
        return (
          <Issues
            type="Quality"
            data={qualityData}
            onAdd={handleAddRow}
            onUpdate={handleUpdateRow}
            onDelete={handleDeleteRow}
            onBulkResolve={handleBulkResolve}
          />
        );
      case "safety":
        return (
          <Issues
            type="Safety"
            data={safetyData}
            onAdd={handleAddRow}
            onUpdate={handleUpdateRow}
            onDelete={handleDeleteRow}
            onBulkResolve={handleBulkResolve}
          />
        );
      case "operational":
        return (
          <Issues
            type="Operational"
            data={operationalData}
            onAdd={handleAddRow}
            onUpdate={handleUpdateRow}
            onDelete={handleDeleteRow}
            onBulkResolve={handleBulkResolve}
          />
        );
      case "dpr":
        return (
          <DPR
            data={dprData}
            onAdd={handleAddRow}
            onUpdate={handleUpdateRow}
            onDelete={handleDeleteRow}
          />
        );
      case "insights":
        return (
          <Insights
            scheduleData={scheduleData}
            qualityData={qualityData}
            safetyData={safetyData}
            operationalData={operationalData}
            dprData={dprData}
          />
        );
      case "settings":
        return (
          <Settings
            onSettingsSaved={handleSettingsSaved}
          />
        );
      default:
        return <div>Tab not found</div>;
    }
  };

  if (loading) {
    return (
      <div className="loading-splash">
        <div className="loader-spinner"></div>
        <h2 style={{ fontFamily: 'var(--font-heading)', color: 'var(--text-primary)' }}>
          Site Dashboard Syncing
        </h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
          Configuring sheet columns and loading cache...
        </p>
      </div>
    );
  }

  return (
    <div className="app-wrapper">
      {/* Navigation Header */}
      <header className="navbar">
        <div className="nav-brand">
          <img 
            src={settings.theme === 'light' ? "/logo.png" : "/Logo with Tagline White.png"} 
            alt="Raghav Utopia Logo" 
            style={{ height: '104px', borderRadius: '4px', objectFit: 'contain' }} 
            onError={(e) => { e.currentTarget.style.display = 'none'; }} 
          />
          <div className="nav-title">
            <h1>RAGHAV UTOPIA</h1>
            <p>Project Management & Daily Site Reporting</p>
          </div>
        </div>

        <div className="nav-controls">
          <div className="sync-status">
            <div className={`sync-dot ${syncing ? 'syncing' : syncError ? 'offline' : ''}`} />
            <span>
              {syncing ? 'Syncing...' : syncError ? 'Offline Sync Alert' : 'Synced'}
            </span>
          </div>

          <button onClick={() => performSync(false)} className="btn btn-secondary btn-icon-only" title="Force Refresh Data">
            <RefreshCw size={16} className={syncing ? 'animate-spin' : ''} />
          </button>

          <button onClick={toggleTheme} className="btn btn-secondary btn-icon-only" title="Toggle Theme">
            {settings.theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </button>

          <button 
            onClick={() => setShowReportModal(true)} 
            className="btn btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            title="Generate Daily Site Report"
          >
            <Printer size={16} /> Daily Report
          </button>

          <button 
            onClick={() => setActiveTab("settings")} 
            className={`btn ${activeTab === 'settings' ? 'btn-primary' : 'btn-secondary'} btn-icon-only`}
            title="Open Configurations"
          >
            <SettingsIcon size={16} />
          </button>
        </div>
      </header>

      {/* Tabs list bar */}
      <nav className="tabs-container">
        <button onClick={() => setActiveTab("schedule")} className={`tab-btn ${activeTab === 'schedule' ? 'active' : ''}`}>
          <Calendar size={16} /> Schedule & Gantt
        </button>
        <button onClick={() => setActiveTab("quality")} className={`tab-btn ${activeTab === 'quality' ? 'active' : ''}`}>
          <AlertCircle size={16} /> Quality Issues
        </button>
        <button onClick={() => setActiveTab("safety")} className={`tab-btn ${activeTab === 'safety' ? 'active' : ''}`}>
          <ShieldAlert size={16} /> Safety incidents
        </button>
        <button onClick={() => setActiveTab("operational")} className={`tab-btn ${activeTab === 'operational' ? 'active' : ''}`}>
          <Layers size={16} /> Operational
        </button>
        <button onClick={() => setActiveTab("dpr")} className={`tab-btn ${activeTab === 'dpr' ? 'active' : ''}`}>
          <ClipboardList size={16} /> DPR (Daily Progress)
        </button>
        <button onClick={() => setActiveTab("insights")} className={`tab-btn ${activeTab === 'insights' ? 'active' : ''}`}>
          <BarChart2 size={16} /> Insights & Analytics
        </button>
      </nav>

      {/* Main View Area */}
      <main className="main-content">
        {/* Error Alert Display */}
        {syncError && (
          <div className="alert-banner">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertTriangle size={18} style={{ flexShrink: 0 }} />
              <span style={{ fontSize: '13px' }}>{syncError}</span>
            </div>
            <button onClick={() => performSync(false)} className="btn btn-secondary btn-danger" style={{ fontSize: '11px', padding: '4px 10px' }}>
              Retry Sync
            </button>
          </div>
        )}

        {renderTabContent()}
      </main>

      {/* Footer metadata info */}
      <footer style={{
        textAlign: 'center', 
        padding: '16px', 
        fontSize: '11px', 
        color: 'var(--text-muted)', 
        borderTop: '1px solid var(--border-glass)',
        background: 'rgba(0,0,0,0.1)'
      }}>
        Last Sync Status: {lastSynced || "Never"} | Sync Mode: {settings.mode.toUpperCase()}
      </footer>

      {showReportModal && (
        <DailyReportModal 
          isOpen={showReportModal}
          onClose={() => setShowReportModal(false)}
          scheduleData={scheduleData}
          qualityData={qualityData}
          safetyData={safetyData}
          operationalData={operationalData}
          dprData={dprData}
        />
      )}
    </div>

  );
}
