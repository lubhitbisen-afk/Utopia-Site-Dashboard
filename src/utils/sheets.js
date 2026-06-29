/**
 * Google Sheets API v4 and Google Apps Script Integration Utility
 * Handles offline caching, direct Google Sheets read, and Google Apps Script proxy read/write.
 */

// Default mock data in case the user hasn't set up their spreadsheet yet
const DEFAULT_MOCK_DATA = {
  Schedule: [
    { id: 1, activity: "Excavation and Piling", duration: 15, plannedStart: "2026-06-01", plannedEnd: "2026-06-15", actualStart: "2026-06-01", actualEnd: "2026-06-16", revisedEnd: "", remarks: "Minor delay due to soil moisture", completed: 100, status: "Completed" },
    { id: 2, activity: "Foundation Concrete", duration: 10, plannedStart: "2026-06-16", plannedEnd: "2026-06-26", actualStart: "2026-06-17", actualEnd: "", revisedEnd: "2026-06-28", remarks: "Delayed start due to pump repair", completed: 80, status: "In Progress" },
    { id: 3, activity: "RCC Pillars and Columns - Gr. Floor", duration: 14, plannedStart: "2026-06-27", plannedEnd: "2026-07-11", actualStart: "", actualEnd: "", revisedEnd: "", remarks: "Awaiting foundation completion", completed: 0, status: "Not Started" },
    { id: 4, activity: "Brickwork and Partition Walls", duration: 12, plannedStart: "2026-07-12", plannedEnd: "2026-07-24", actualStart: "", actualEnd: "", revisedEnd: "", remarks: "Material procurement in progress", completed: 0, status: "Not Started" },
    { id: 5, activity: "Plumbing and Electrical Conduit Piping", duration: 10, plannedStart: "2026-07-20", plannedEnd: "2026-07-30", actualStart: "", actualEnd: "", revisedEnd: "", remarks: "Dependencies on brickwork", completed: 0, status: "Not Started" },
    { id: 6, activity: "Finishing & Plastering Work", duration: 15, plannedStart: "2026-07-31", plannedEnd: "2026-08-15", actualStart: "", actualEnd: "", revisedEnd: "", remarks: "Final inspection phase", completed: 0, status: "Not Started" }
  ],
  Quality: [
    { id: 1, date: "2026-06-20", issue: "Honeycombing in Column C3", description: "Voids and honeycombing observed near the beam junction due to lack of proper vibration during concrete pour.", priority: "High", status: "In Progress", contractor: "L&T Construction", link: "https://images.unsplash.com/photo-1541888946425-d81bb19240f5?q=80&w=1200", notes: "Subcontractor instructed to chip off and repair using non-shrink grout." },
    { id: 2, date: "2026-06-22", issue: "Slab Level Deviation", description: "Gr floor corridor slab shows level variation of +12mm over 3 meters. Standard limit is +/- 5mm.", priority: "Medium", status: "Open", contractor: "JK Infrastructure", link: "", notes: "Checking cause. Screed leveling will be required before tiling." },
    { id: 3, date: "2026-06-24", issue: "Crack in Retaining Wall", description: "Fine hairline cracks observed in retaining wall segment B. Width < 0.2mm.", priority: "Low", status: "Resolved", contractor: "L&T Construction", link: "", notes: "Monitored for 48 hours. Sealed with epoxy injection." }
  ],
  Safety: [
    { id: 1, date: "2026-06-19", incident: "No Helmet/Harness on Scaffolding", description: "Three workers found working on the 2nd level scaffolding without safety harnesses and helmets.", priority: "Critical", status: "Closed", contractor: "JK Infrastructure", link: "", notes: "Work stopped immediately. Safety penalty of $200 levied. Workers retrained." },
    { id: 2, date: "2026-06-23", incident: "Live Cable Exposed Near Water Tank", description: "Water pump power cord found damaged with exposed copper wire near the curing water tank. Major shock hazard.", priority: "Critical", status: "Open", contractor: "R.K. Electricals", link: "", notes: "Power source disconnected. Demanded replacement cable." }
  ],
  Operational: [
    { id: 1, date: "2026-06-15", inefficiency: "Cement Supply Delay", description: "500 bags of OPC cement delayed by 2 days due to transporter strike, halting foundation works.", priority: "High", status: "Closed", contractor: "Ultratech Logistics", link: "", notes: "Alternative local supplier arranged at premium. Claim raised on main transporter." },
    { id: 2, date: "2026-06-21", inefficiency: "Excavator Hydraulic Leak", description: "Tata Hitachi excavator went down at 10 AM due to a major hydraulic fluid leak. Repair took 6 hours.", priority: "Medium", status: "Closed", contractor: "Vanguard Equipment", link: "", notes: "Mechanic arrived with replacement hose at 3 PM. Machine operational at EOD." }
  ],
  DPR: [
    { id: 1, date: "2026-06-23", activity: "Foundation Concrete", workPlanned: "Pouring M25 concrete for column footings A1-A6", manpower: 25, manpowerDetails: "1 supervisor, 2 operators, 12 carpenters, 10 helpers", weather: "Sunny 38°C", link: "https://images.unsplash.com/photo-1590069261209-f8e9b8642343?q=80&w=1200", remarks: "Footings successfully poured. Volume consumed: 45 cu.m." },
    { id: 2, date: "2026-06-24", activity: "Curing & Shuttering", workPlanned: "Curing of foundation columns & shuttering work for column C1-C6", manpower: 18, manpowerDetails: "1 supervisor, 8 carpenters, 9 helpers", weather: "Cloudy 32°C", link: "", remarks: "Shuttering on schedule. Water curing done 3 times." },
    { id: 3, date: "2026-06-25", activity: "Excavation and Backfill", workPlanned: "Backfilling trench zone B and site cleaning", manpower: 15, manpowerDetails: "1 supervisor, 1 JCB operator, 13 helpers", weather: "Rainy 28°C", link: "", remarks: "Heavy rain at 2 PM stopped work for 2 hours. Backfill 70% completed." }
  ]
};

// Apps Script Code to be displayed to user
export const APPS_SCRIPT_CODE = `
function doGet(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var result = {};
  var sheets = ss.getSheets();
  
  for (var i = 0; i < sheets.length; i++) {
    var sheet = sheets[i];
    var name = sheet.getName();
    var data = sheet.getDataRange().getValues();
    if (data.length <= 1) {
      result[name] = [];
    } else {
      var headers = data[0];
      var rows = [];
      for (var r = 1; r < data.length; r++) {
        var row = {};
        row["rowIndex"] = r + 1; // 1-based spreadsheet row number
        for (var c = 0; c < headers.length; c++) {
          row[headers[c]] = data[r][c];
        }
        rows.push(row);
      }
      result[name] = rows;
    }
  }
  
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var params = JSON.parse(e.postData.contents);
  var action = params.action; // 'insert', 'update', 'delete'
  var sheetName = params.sheet;
  var sheet = ss.getSheetByName(sheetName);
  
  if (!sheet) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: "Sheet not found" }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  
  var headers = sheet.getDataRange().getValues()[0];
  var responseData = { success: true };
  
  try {
    if (action === 'insert') {
      var newRow = headers.map(function(h) {
        return params.data[h] !== undefined ? params.data[h] : "";
      });
      sheet.appendRow(newRow);
      responseData.rowIndex = sheet.getLastRow();
    } 
    else if (action === 'update') {
      var rowIndex = parseInt(params.rowIndex);
      if (isNaN(rowIndex) || rowIndex < 2 || rowIndex > sheet.getLastRow()) {
        throw new Error("Invalid row index for update: " + rowIndex);
      }
      
      var rowValues = headers.map(function(h) {
        return params.data[h] !== undefined ? params.data[h] : "";
      });
      
      // Update cell values for that row
      sheet.getRange(rowIndex, 1, 1, rowValues.length).setValues([rowValues]);
    } 
    else if (action === 'delete') {
      var rowIndex = parseInt(params.rowIndex);
      if (isNaN(rowIndex) || rowIndex < 2 || rowIndex > sheet.getLastRow()) {
        throw new Error("Invalid row index for delete: " + rowIndex);
      }
      sheet.deleteRow(rowIndex);
    }
  } catch(err) {
    responseData = { success: false, error: err.toString() };
  }
  
  return ContentService.createTextOutput(JSON.stringify(responseData))
    .setMimeType(ContentService.MimeType.JSON);
}
`;

// Helper to load settings from LocalStorage
export function getStoredSettings() {
  const defaults = {
    mode: "mock", // "mock" | "api" | "script"
    apiKey: "",
    sheetId: "",
    scriptUrl: "",
    theme: "dark"
  };
  try {
    const stored = localStorage.getItem("site_dashboard_settings");
    return stored ? JSON.parse(stored) : defaults;
  } catch {
    return defaults;
  }
}

// Helper to save settings to LocalStorage
export function saveStoredSettings(settings) {
  localStorage.setItem("site_dashboard_settings", JSON.stringify(settings));
}

// Helper to get local data cache
export function getLocalCache() {
  try {
    const cached = localStorage.getItem("site_dashboard_data_cache");
    const timestamp = localStorage.getItem("site_dashboard_last_sync");
    return {
      data: cached ? JSON.parse(cached) : null,
      timestamp: timestamp || null
    };
  } catch {
    return { data: null, timestamp: null };
  }
}

// Helper to save data cache
export function saveLocalCache(data) {
  localStorage.setItem("site_dashboard_data_cache", JSON.stringify(data));
  const now = new Date().toLocaleString();
  localStorage.setItem("site_dashboard_last_sync", now);
  return now;
}

export function parseDateString(val) {
  if (!val) return null;
  if (val instanceof Date) return val;
  
  const str = String(val).trim();
  if (!str) return null;
  
  // Try standard YYYY-MM-DD parsing
  let dObj = new Date(str);
  if (!isNaN(dObj.getTime()) && str.includes('-') && str.indexOf('-') === 4) {
    return dObj;
  }
  
  // Try parsing DD-MM-YYYY or DD/MM/YYYY
  const parts = str.split(/[-/]/);
  if (parts.length === 3) {
    const p0 = parseInt(parts[0], 10);
    const p1 = parseInt(parts[1], 10);
    const p2 = parseInt(parts[2], 10);
    
    // DD/MM/YYYY or DD-MM-YYYY (p0 is day, p1 is month, p2 is year)
    if (p2 > 1000 && p1 >= 1 && p1 <= 12 && p0 >= 1 && p0 <= 31) {
      dObj = new Date(p2, p1 - 1, p0);
      if (!isNaN(dObj.getTime())) return dObj;
    }
    
    // YYYY/MM/DD or YYYY-MM-DD (p0 is year, p1 is month, p2 is day)
    if (p0 > 1000 && p1 >= 1 && p1 <= 12 && p2 >= 1 && p2 <= 31) {
      dObj = new Date(p0, p1 - 1, p2);
      if (!isNaN(dObj.getTime())) return dObj;
    }
  }

  // Fallback to standard new Date() if we haven't matched yet
  dObj = new Date(str);
  if (!isNaN(dObj.getTime())) {
    return dObj;
  }

  // Check if it's a numeric Excel / Google Sheets serial date
  if (!isNaN(str) && !str.includes('-') && !str.includes('/')) {
    const num = Number(str);
    if (num > 30000 && num < 60000) {
      const serialDateObj = new Date((num - 25569) * 86400 * 1000);
      if (!isNaN(serialDateObj.getTime())) return serialDateObj;
    }
  }
  
  return null;
}

export function normalizeDatesInRow(row) {
  if (!row) return row;
  const cleanRow = { ...row };
  Object.keys(cleanRow).forEach(key => {
    if (key.toLowerCase().includes("date")) {
      const val = cleanRow[key];
      if (val) {
        try {
          const dObj = parseDateString(val);
          if (dObj && !isNaN(dObj.getTime())) {
            const y = dObj.getFullYear();
            const m = String(dObj.getMonth() + 1).padStart(2, '0');
            const d = String(dObj.getDate()).padStart(2, '0');
            cleanRow[key] = `${y}-${m}-${d}`;
          }
        } catch {
          // ignore
        }
      }
    }
  });
  return cleanRow;
}

export function formatDateReadable(dateStr) {
  if (!dateStr) return "-";
  try {
    const dObj = parseDateString(dateStr);
    if (!dObj || isNaN(dObj.getTime())) return String(dateStr);
    
    const year = dObj.getFullYear();
    const monthIndex = dObj.getMonth();
    const day = dObj.getDate();
    
    const months = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"
    ];
    const month = months[monthIndex];
    
    let suffix = "th";
    if (day === 1 || day === 21 || day === 31) suffix = "st";
    else if (day === 2 || day === 22) suffix = "nd";
    else if (day === 3 || day === 23) suffix = "rd";
    
    return `${day}${suffix} ${month} ${year}`;
  } catch {
    return String(dateStr);
  }
}


// Format mapping helper to align Google Sheet arrays with React objects
function mapHeadersToRows(values) {
  if (!values || values.length <= 1) return [];
  const headers = values[0];
  return values.slice(1).map((row, index) => {
    const obj = { rowIndex: index + 2 }; // Spreadsheet row index (starts at 2 since row 1 is headers)
    
    // Add columns mapped by header
    headers.forEach((header, hIdx) => {
      let val = row[hIdx];
      // Convert specific fields to numbers/percentages
      if (header === "Duration (Days)" || header === "Completed %" || header === "Manpower (Count)") {
        val = val !== undefined && val !== "" ? Number(val) : 0;
      }
      obj[header] = val !== undefined ? val : "";
    });

    // Generate simple ID for React mapping keys
    obj.id = index + 1;
    return normalizeDatesInRow(obj);
  });
}


// Master Fetch function that decides based on settings
export async function syncAllSheets() {
  const settings = getStoredSettings();
  
  if (settings.mode === "mock") {
    // If cache doesn't exist, seed it with defaults
    const cached = getLocalCache();
    if (!cached.data) {
      saveLocalCache(DEFAULT_MOCK_DATA);
      return { data: DEFAULT_MOCK_DATA, timestamp: new Date().toLocaleString(), mode: "mock" };
    }
    return { data: cached.data, timestamp: cached.timestamp, mode: "mock" };
  }

  if (settings.mode === "script") {
    if (!settings.scriptUrl) {
      throw new Error("Google Apps Script URL is not configured in Settings.");
    }
    try {
      const response = await fetch(`${settings.scriptUrl}?sheet=all`, {
        method: "GET",
        mode: "cors"
      });
      if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
      const rawData = await response.json();
      
      // Clean and map data
      const formattedData = {};
      const sheetKeys = ["Schedule", "Quality Issues", "Safety Issues", "Operational Inefficiencies", "DPR"];
      
      // Map Apps Script names (often spaces are stripped, map appropriately)
      sheetKeys.forEach(key => {
        let incomingKey = key;
        // Check variations of names
        if (!rawData[incomingKey]) {
          incomingKey = Object.keys(rawData).find(k => k.toLowerCase().replace(/[^a-z]/g, "") === key.toLowerCase().replace(/[^a-z]/g, ""));
        }
        const rows = rawData[incomingKey] || [];
        
        // Ensure every item has a unique ID and mapped keys
        formattedData[key] = rows.map((r, index) => normalizeDatesInRow({
          ...r,
          id: r.id || index + 1,
          rowIndex: r.rowIndex || index + 2
        }));
      });

      saveLocalCache(formattedData);
      return { data: formattedData, timestamp: new Date().toLocaleString(), mode: "script" };
    } catch (error) {
      console.error("Apps Script Sync failed:", error);
      // Fallback to cache if request fails
      const cached = getLocalCache();
      if (cached.data) {
        return { data: cached.data, timestamp: cached.timestamp, mode: "script (offline)", error: error.message };
      }
      throw error;
    }
  }

  if (settings.mode === "api") {
    if (!settings.apiKey || !settings.sheetId) {
      throw new Error("API Key or Spreadsheet ID is missing in Settings.");
    }
    
    try {
      const tabs = [
        { key: "Schedule", range: "Schedule!A1:J1000" },
        { key: "Quality", range: "Quality Issues!A1:H1000" },
        { key: "Safety", range: "Safety Issues!A1:H1000" },
        { key: "Operational", range: "Operational Inefficiencies!A1:H1000" },
        { key: "DPR", range: "DPR!A1:H1000" }
      ];

      const formattedData = {};

      // Load each tab sequentially (or in batch if API key allows, sequence is fine for loading)
      for (const tab of tabs) {
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${settings.sheetId}/values/${encodeURIComponent(tab.range)}?key=${settings.apiKey}`;
        const res = await fetch(url);
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error?.message || `Failed to fetch sheet ${tab.key}`);
        }
        const json = await res.json();
        
        // Define column mappings to match the schema
        formattedData[tab.key] = mapHeadersToRows(json.values, tab.key);
      }

      saveLocalCache(formattedData);
      return { data: formattedData, timestamp: new Date().toLocaleString(), mode: "api" };
    } catch (error) {
      console.error("Google Sheets API Sync failed:", error);
      const cached = getLocalCache();
      if (cached.data) {
        return { data: cached.data, timestamp: cached.timestamp, mode: "api (offline)", error: error.message };
      }
      throw error;
    }
  }
}

// Master Write Function
export async function writeRow(tabName, rowData, action, rowIndex = null) {
  const settings = getStoredSettings();
  const cached = getLocalCache();
  let currentData = cached.data || DEFAULT_MOCK_DATA;
  
  // Tab alignment between React state key and sheet name
  let sheetName = tabName;
  if (tabName === "Quality") sheetName = "Quality Issues";
  if (tabName === "Safety") sheetName = "Safety Issues";
  if (tabName === "Operational") sheetName = "Operational Inefficiencies";

  // 1. Handle Mock mode (Local storage write)
  if (settings.mode === "mock") {
    const list = [...(currentData[tabName] || [])];
    
    if (action === "insert") {
      const newId = list.reduce((max, item) => Math.max(max, item.id || 0), 0) + 1;
      const newItem = { ...rowData, id: newId, rowIndex: list.length + 2 };
      list.push(newItem);
    } else if (action === "update") {
      const idx = list.findIndex(item => item.rowIndex === rowIndex || item.id === rowData.id);
      if (idx !== -1) {
        list[idx] = { ...list[idx], ...rowData };
      }
    } else if (action === "delete") {
      const idx = list.findIndex(item => item.rowIndex === rowIndex || item.id === rowData.id);
      if (idx !== -1) {
        list.splice(idx, 1);
        // Re-calculate rowIndices for mock consistency
        list.forEach((item, index) => {
          item.rowIndex = index + 2;
        });
      }
    }
    
    currentData[tabName] = list;
    saveLocalCache(currentData);
    return { success: true, data: currentData };
  }

  // 2. Handle Apps Script mode (Full remote sync)
  if (settings.mode === "script") {
    if (!settings.scriptUrl) {
      throw new Error("Google Apps Script URL is missing.");
    }
    
    const payload = {
      action: action, // 'insert' | 'update' | 'delete'
      sheet: sheetName,
      data: rowData,
      rowIndex: rowIndex
    };

    try {
      const response = await fetch(settings.scriptUrl, {
        method: "POST",
        mode: "cors",
        headers: {
          "Content-Type": "text/plain"
        },
        body: JSON.stringify(payload)
      });
      
      if (!response.ok) throw new Error("Network write error: " + response.statusText);
      const resJson = await response.json();
      
      if (!resJson.success) {
        throw new Error(resJson.error || "Google Apps Script reported failure.");
      }

      // Re-sync full data to ensure our local copy is 100% aligned with the spreadsheet row ordering
      const syncResult = await syncAllSheets();
      return { success: true, data: syncResult.data };
    } catch (e) {
      console.error("Failed to write to Google Apps Script:", e);
      throw e;
    }
  }

  // 3. Handle Direct API key mode (Fallback write)
  if (settings.mode === "api") {
    // API key does not support writes directly. We write to local storage but throw a specific warning
    const list = [...(currentData[tabName] || [])];
    
    if (action === "insert") {
      const newId = list.reduce((max, item) => Math.max(max, item.id || 0), 0) + 1;
      list.push({ ...rowData, id: newId, rowIndex: list.length + 2, _localOnly: true });
    } else if (action === "update") {
      const idx = list.findIndex(item => item.rowIndex === rowIndex || item.id === rowData.id);
      if (idx !== -1) {
        list[idx] = { ...list[idx], ...rowData, _localOnly: true };
      }
    } else if (action === "delete") {
      const idx = list.findIndex(item => item.rowIndex === rowIndex || item.id === rowData.id);
      if (idx !== -1) {
        list.splice(idx, 1);
        list.forEach((item, index) => {
          item.rowIndex = index + 2;
        });
      }
    }

    currentData[tabName] = list;
    saveLocalCache(currentData);
    
    // Return success but indicate that it's local only because Google API keys don't support writing
    throw new Error("Direct API Key mode is read-only. Your change was saved in local storage, but cannot sync to the Google Sheet. Deploy and configure the Google Apps Script Web App in Settings to enable real-time write sync.");
  }
}

// Test connectivity utility
export async function testConnection(tempSettings) {
  if (tempSettings.mode === "mock") return true;

  if (tempSettings.mode === "script") {
    if (!tempSettings.scriptUrl) throw new Error("Apps Script URL is required");
    const response = await fetch(`${tempSettings.scriptUrl}?sheet=test-conn`, {
      method: "GET",
      mode: "cors"
    });
    if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
    const data = await response.json();
    return !!data;
  }

  if (tempSettings.mode === "api") {
    if (!tempSettings.apiKey || !tempSettings.sheetId) {
      throw new Error("API Key and Sheet ID are required");
    }
    // Test fetch the schedule sheet metadata or first row
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${tempSettings.sheetId}/values/Schedule!A1:A2?key=${tempSettings.apiKey}`;
    const response = await fetch(url);
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message || `Failed to connect. HTTP Status: ${response.status}`);
    }
    return true;
  }
}
