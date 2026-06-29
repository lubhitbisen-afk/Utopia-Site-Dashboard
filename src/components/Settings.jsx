import React, { useState, useEffect } from 'react';
import { getStoredSettings, saveStoredSettings, testConnection, APPS_SCRIPT_CODE } from '../utils/sheets';
import { Settings as SettingsIcon, Save, Key, Database, FileCode, CheckCircle, AlertTriangle, RefreshCw, Trash2, Sun, Moon } from 'lucide-react';

export default function Settings({ onSettingsSaved }) {
  const [settings, setSettings] = useState(getStoredSettings());
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null); // { success: boolean, message: string }
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    // Sync current theme with body class on mount
    document.body.classList.toggle('light-mode', settings.theme === 'light');
  }, [settings.theme]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setSettings(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSave = (e) => {
    e.preventDefault();
    saveStoredSettings(settings);
    
    // Toggle theme classes on document
    document.body.classList.toggle('light-mode', settings.theme === 'light');
    
    onSettingsSaved(settings);
    setTestResult({
      success: true,
      message: "Settings saved successfully! Refreshing dashboard..."
    });
    setTimeout(() => setTestResult(null), 3000);
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const ok = await testConnection(settings);
      if (ok) {
        setTestResult({
          success: true,
          message: `Connection test passed! App is ready to sync via ${settings.mode === 'script' ? 'Google Apps Script' : settings.mode === 'api' ? 'API Key (Read-only)' : 'Mock Mode'}.`
        });
      }
    } catch (err) {
      setTestResult({
        success: false,
        message: `Connection failed: ${err.message}`
      });
    } finally {
      setTesting(false);
    }
  };

  const handleClearCache = () => {
    if (window.confirm("Are you sure you want to clear the local storage cache? This will reset custom entries unless synced to Google Sheets.")) {
      localStorage.removeItem("site_dashboard_data_cache");
      localStorage.removeItem("site_dashboard_last_sync");
      setTestResult({
        success: true,
        message: "Local cache cleared. Refreshing..."
      });
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    }
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(APPS_SCRIPT_CODE);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const toggleTheme = () => {
    const newTheme = settings.theme === 'dark' ? 'light' : 'dark';
    setSettings(prev => ({ ...prev, theme: newTheme }));
  };

  return (
    <div className="settings-page">
      <div className="actions-bar">
        <h2 style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <SettingsIcon size={24} className="text-accent" /> Settings & API Configurations
        </h2>
      </div>

      <div className="charts-grid" style={{ gridTemplateColumns: '1.2fr 0.8fr' }}>
        {/* Left Card: Connection Form */}
        <form onSubmit={handleSave} className="glass-card chart-card">
          <div className="chart-title">
            <span>Database & Credentials Sync</span>
            <button type="button" onClick={toggleTheme} className="btn btn-secondary btn-icon-only" title="Toggle Light/Dark Theme">
              {settings.theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
          </div>

          {testResult && (
            <div className="alert-banner" style={{
              background: testResult.success ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
              borderColor: testResult.success ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.3)',
              color: testResult.success ? '#34D399' : '#F87171',
              padding: '12px 16px',
              borderRadius: '8px',
              marginBottom: '20px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {testResult.success ? <CheckCircle size={18} /> : <AlertTriangle size={18} />}
                <span style={{ fontSize: '13px' }}>{testResult.message}</span>
              </div>
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Synchronization Mode</label>
            <select name="mode" value={settings.mode} onChange={handleChange} className="form-select">
              <option value="mock">Offline / Local Storage Mode (Uses Mock Data + Cache)</option>
              <option value="api">Google Sheets API v4 Key (Read-Only Mode)</option>
              <option value="script">Google Apps Script URL (Full Read & Write Sync - RECOMMENDED)</option>
            </select>
          </div>

          {settings.mode === 'api' && (
            <div style={{ animation: 'fadeIn 0.25s' }}>
              <div className="alert-banner" style={{ background: 'rgba(245, 158, 11, 0.12)', borderColor: 'rgba(245, 158, 11, 0.25)', color: '#FBBF24', fontSize: '12px' }}>
                <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: '2px' }} />
                <span>Note: Direct API Key mode is **Read-Only** due to Google Sheets security restrictions. Adding/modifying items will only save to your browser's local cache. Use Google Apps Script Mode for complete two-way sync.</span>
              </div>

              <div className="form-group">
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Key size={14} /> Google Sheets API Key</label>
                <input
                  type="password"
                  name="apiKey"
                  value={settings.apiKey}
                  onChange={handleChange}
                  placeholder="AIzaSy..."
                  className="form-input"
                  required={settings.mode === 'api'}
                />
              </div>

              <div className="form-group">
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Database size={14} /> Spreadsheet ID</label>
                <input
                  type="text"
                  name="sheetId"
                  value={settings.sheetId}
                  onChange={handleChange}
                  placeholder="1u_wT_UqC7L..."
                  className="form-input"
                  required={settings.mode === 'api'}
                />
              </div>
            </div>
          )}

          {settings.mode === 'script' && (
            <div style={{ animation: 'fadeIn 0.25s' }}>
              <div className="form-group">
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><FileCode size={14} /> Google Apps Script Web App Deployment URL</label>
                <input
                  type="url"
                  name="scriptUrl"
                  value={settings.scriptUrl}
                  onChange={handleChange}
                  placeholder="https://script.google.com/macros/s/.../exec"
                  className="form-input"
                  required={settings.mode === 'script'}
                />
              </div>
            </div>
          )}

          <div className="modal-footer" style={{ borderTop: '1px solid var(--border-glass)', paddingTop: '20px', display: 'flex', flexWrap: 'wrap', gap: '12px', justifyContent: 'space-between' }}>
            <button
              type="button"
              onClick={handleClearCache}
              className="btn btn-danger"
              style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              <Trash2 size={16} /> Clear Local Cache
            </button>
            <div style={{ display: 'flex', gap: '12px' }}>
              {settings.mode !== 'mock' && (
                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={testing}
                  className="btn btn-secondary"
                  style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                  <RefreshCw size={16} className={testing ? 'animate-spin' : ''} />
                  {testing ? 'Testing...' : 'Test Connection'}
                </button>
              )}
              <button
                type="submit"
                className="btn btn-primary"
                style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
              >
                <Save size={16} /> Save Settings
              </button>
            </div>
          </div>
        </form>

        {/* Right Card: Documentation / Instructions */}
        <div className="glass-card chart-card">
          <div className="chart-title">
            <span>Setup Instructions</span>
          </div>

          <div style={{ fontSize: '13px', lineHeight: '1.6', overflowY: 'auto', maxHeight: '420px', paddingRight: '6px' }}>
            <h4 style={{ color: 'var(--accent)', marginBottom: '8px' }}>Google Sheets Structure</h4>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '12px' }}>
              Create a spreadsheet with exactly 5 tabs named:
              <br />
              <code>Schedule</code>, <code>Quality Issues</code>, <code>Safety Issues</code>, <code>Operational Inefficiencies</code>, and <code>DPR</code>.
              Ensure headers in Row 1 match the specification.
            </p>

            <h4 style={{ color: 'var(--accent)', marginBottom: '8px' }}>Option A: Direct API Read-Only</h4>
            <ol style={{ paddingLeft: '16px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              <li>Share your spreadsheet as "Anyone with the link can view".</li>
              <li>Get an API key from Google Cloud Console (enabled for Google Sheets API).</li>
              <li>Paste the API Key & Sheet ID (the long string in your sheet's URL).</li>
            </ol>

            <h4 style={{ color: 'var(--accent)', marginBottom: '8px' }}>Option B: Two-Way Apps Script (Recommended)</h4>
            <ol style={{ paddingLeft: '16px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              <li>Open your Google Sheet, click **Extensions** &rarr; **Apps Script**.</li>
              <li>Delete any existing template code.</li>
              <li>Copy and paste our Apps Script Proxy Code (click button below).</li>
              <li>Click **Deploy** (top right) &rarr; **New deployment**.</li>
              <li>Select type: **Web app**.</li>
              <li>Set **Execute as**: **Me**.</li>
              <li>Set **Who has access**: **Anyone**.</li>
              <li>Click **Deploy**, approve authorization, and **copy the Web App URL** into Settings here.</li>
            </ol>

            <button
              type="button"
              onClick={handleCopyCode}
              className="btn btn-secondary"
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', marginTop: '12px' }}
            >
              <FileCode size={16} />
              {copied ? 'Code Copied!' : 'Copy Apps Script Code'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
