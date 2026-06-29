import React, { useState, useMemo } from 'react';
import { ClipboardList, Plus, Edit, Trash2, Download, Search, Sun, CloudRain, Users, Printer, Eye } from 'lucide-react';
import { formatDateReadable } from '../utils/sheets';

export default function DPR({ data, onAdd, onUpdate, onDelete }) {
  const [showModal, setShowModal] = useState(false);
  const [editingEntry, setEditingEntry] = useState(null);
  const [activeDprView, setActiveDprView] = useState(null); // Selected DPR for print preview
  
  // Table search & filter states
  const [searchTerm, setSearchTerm] = useState("");
  const [activityFilter, setActivityFilter] = useState("all");
  
  // Date selection states
  const todayStr = useMemo(() => {
    return new Date().toISOString().split('T')[0];
  }, []);

  const [selectedDate, setSelectedDate] = useState(todayStr);

  const initialFormState = {
    date: todayStr,
    activity: "",
    workPlanned: "",
    manpower: 10,
    manpowerDetails: "",
    weather: "Sunny",
    link: "",
    remarks: ""
  };
  const [formData, setFormData] = useState(initialFormState);

  // Normalize data keys
  const normalizedDpr = useMemo(() => {
    if (!data || data.length === 0) return [];
    return data.map(t => {
      const date = t.Date || t.date || "";
      const activity = t.Activity || t.activity || "";
      const workPlanned = t["Work Planned"] || t.workPlanned || "";
      const manpower = t["Manpower (Count)"] !== undefined ? Number(t["Manpower (Count)"]) : (t.manpower !== undefined ? Number(t.manpower) : 0);
      const manpowerDetails = t["Manpower Details"] || t.manpowerDetails || "";
      const weather = t.Weather || t.weather || "Sunny 38°C";
      const link = t["Photo/Video Link"] || t.link || "";
      const remarks = t.Remarks || t.remarks || "";
      const rowIndex = t.rowIndex;
      const id = t.id;

      return {
        id,
        rowIndex,
        date,
        activity,
        workPlanned,
        manpower,
        manpowerDetails,
        weather,
        link,
        remarks
      };
    }).sort((a, b) => b.date.localeCompare(a.date)); // sorted newest first
  }, [data]);

  // Extract unique activity list for filter
  const activitiesList = useMemo(() => {
    const list = new Set();
    normalizedDpr.forEach(item => {
      if (item.activity) list.add(item.activity);
    });
    return Array.from(list).sort();
  }, [normalizedDpr]);

  // Filtered entries for table list
  const filteredDpr = useMemo(() => {
    return normalizedDpr.filter(item => {
      const searchLower = searchTerm.toLowerCase();
      const matchSearch = item.remarks.toLowerCase().includes(searchLower) || 
                          item.weather.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          item.activity.toLowerCase().includes(searchTerm.toLowerCase());
      const matchActivity = activityFilter === "all" || item.activity === activityFilter;
      return matchSearch && matchActivity;
    });
  }, [normalizedDpr, searchTerm, activityFilter]);

  // Calendar parameters (uses the current month of selectedDate or June 2026 as benchmark)
  const calendarData = useMemo(() => {
    const pivot = selectedDate ? new Date(selectedDate) : new Date();
    const year = pivot.getFullYear();
    const month = pivot.getMonth(); // 0-indexed

    // Calculate dates
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    
    const startWeekDay = firstDay.getDay(); // 0 (Sun) to 6 (Sat)
    const totalDays = lastDay.getDate();

    // Map existing entries in this month
    const entriesMap = {};
    normalizedDpr.forEach(entry => {
      if (entry.date) {
        const eDate = new Date(entry.date);
        if (eDate.getFullYear() === year && eDate.getMonth() === month) {
          entriesMap[eDate.getDate()] = entry;
        }
      }
    });

    const monthName = pivot.toLocaleString('en-US', { month: 'long', year: 'numeric' });

    return {
      year,
      month,
      startWeekDay,
      totalDays,
      entriesMap,
      monthName
    };
  }, [selectedDate, normalizedDpr]);

  // Stats today
  const todayStats = useMemo(() => {
    const todayLog = normalizedDpr.find(d => d.date === todayStr);
    return {
      activity: todayLog ? todayLog.activity : "No log today",
      manpower: todayLog ? todayLog.manpower : "-",
      weather: todayLog ? todayLog.weather : "-"
    };
  }, [normalizedDpr, todayStr]);

  // Manpower trends calculation (shows last 7 entries chronologically)
  const manpowerTrendData = useMemo(() => {
    const items = [...normalizedDpr]
      .filter(x => x.date && x.manpower > 0)
      .slice(0, 7) // Take last 7 entries
      .reverse();  // chronological order
    
    const maxManpower = items.reduce((max, x) => Math.max(max, x.manpower), 10);
    return {
      items,
      maxManpower
    };
  }, [normalizedDpr]);

  const handleAddNew = () => {
    setEditingEntry(null);
    setFormData({
      ...initialFormState,
      date: selectedDate || todayStr
    });
    setShowModal(true);
  };

  const handleEdit = (entry) => {
    setEditingEntry(entry);
    setFormData({
      date: entry.date,
      activity: entry.activity,
      workPlanned: entry.workPlanned,
      manpower: entry.manpower,
      manpowerDetails: entry.manpowerDetails,
      weather: entry.weather,
      link: entry.link,
      remarks: entry.remarks
    });
    setShowModal(true);
  };

  const handleDelete = (entry) => {
    if (window.confirm(`Delete DPR entry for ${entry.date}?`)) {
      onDelete("DPR", entry.rowIndex, entry.id);
      if (activeDprView && activeDprView.id === entry.id) {
        setActiveDprView(null);
      }
    }
  };

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    const sheetRow = {
      "Date": formData.date,
      "Activity": formData.activity,
      "Work Planned": formData.workPlanned,
      "Manpower (Count)": Number(formData.manpower),
      "Manpower Details": formData.manpowerDetails,
      "Weather": formData.weather,
      "Photo/Video Link": formData.link,
      "Remarks": formData.remarks
    };

    if (editingEntry) {
      onUpdate("DPR", sheetRow, editingEntry.rowIndex, editingEntry.id);
    } else {
      onAdd("DPR", sheetRow);
    }
    setShowModal(false);
  };

  // Change active calendar month
  const handleMonthChange = (offset) => {
    const pivot = selectedDate ? new Date(selectedDate) : new Date();
    pivot.setMonth(pivot.getMonth() + offset);
    setSelectedDate(pivot.toISOString().split('T')[0]);
  };

  // Click a calendar cell
  const handleCellClick = (dayNum) => {
    const y = calendarData.year;
    const m = String(calendarData.month + 1).padStart(2, '0');
    const d = String(dayNum).padStart(2, '0');
    const dateStr = `${y}-${m}-${d}`;
    setSelectedDate(dateStr);
    
    const entry = calendarData.entriesMap[dayNum];
    if (entry) {
      setActiveDprView(entry);
    } else {
      setActiveDprView(null);
    }
  };

  // Trigger browser print for client/consultant review
  const handlePrint = (entry) => {
    const printWindow = window.open('', '_blank', 'width=800,height=900');
    
    const htmlContent = `
      <html>
        <head>
          <title>Daily Progress Report - ${entry.date}</title>
          <style>
            body { font-family: 'Helvetica Neue', Arial, sans-serif; padding: 40px; color: #333; line-height: 1.6; }
            .header { text-align: center; border-bottom: 3px double #ddd; padding-bottom: 20px; margin-bottom: 30px; }
            .header h1 { margin: 0; font-size: 26px; text-transform: uppercase; color: #1E3A8A; }
            .header p { margin: 5px 0 0; color: #666; font-size: 14px; }
            .metadata-table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
            .metadata-table td { padding: 12px; border: 1px solid #e0e0e0; font-size: 14px; }
            .metadata-table td.label { font-weight: bold; background: #f8fafc; color: #475569; width: 25%; }
            .content-section { margin-bottom: 25px; }
            .content-section h2 { font-size: 16px; border-left: 4px solid #1E3A8A; padding-left: 10px; margin-bottom: 12px; color: #1E3A8A; text-transform: uppercase; }
            .content-box { background: #fafafa; border: 1px solid #e5e7eb; border-radius: 6px; padding: 15px; font-size: 14px; min-height: 50px; }
            .footer { margin-top: 50px; border-top: 1px solid #e5e7eb; padding-top: 20px; text-align: center; font-size: 11px; color: #9CA3AF; }
            @media print {
              body { padding: 0; }
              button { display: none; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Daily Progress Report (DPR)</h1>
            <p>Project Management Dashboard System</p>
          </div>

          <table class="metadata-table">
            <tr>
              <td class="label">Date</td>
              <td>${entry.date}</td>
              <td class="label">Weather Condition</td>
              <td>${entry.weather}</td>
            </tr>
            <tr>
              <td class="label">Primary Activity</td>
              <td>${entry.activity}</td>
              <td class="label">Manpower Headcount</td>
              <td>${entry.manpower} workers</td>
            </tr>
          </table>

          <div class="content-section">
            <h2>Work Description & Plan</h2>
            <div class="content-box">${entry.workPlanned || 'No details provided.'}</div>
          </div>

          <div class="content-section">
            <h2>Manpower Breakdown / Labor Details</h2>
            <div class="content-box">${entry.manpowerDetails || 'No details provided.'}</div>
          </div>

          <div class="content-section">
            <h2>Remarks / Delay Incidents / Achievements</h2>
            <div class="content-box">${entry.remarks || 'No remarks recorded.'}</div>
          </div>

          ${entry.link ? `
          <div class="content-section">
            <h2>Media Attachment Link</h2>
            <div class="content-box"><a href="${entry.link}" target="_blank">${entry.link}</a></div>
          </div>
          ` : ''}

          <div style="margin-top: 60px; display: flex; justify-content: space-between;">
            <div style="text-align: center; width: 45%;">
              <div style="border-top: 1px solid #888; width: 80%; margin: 0 auto; padding-top: 5px; font-size: 12px; color: #555;">Site In-Charge Signature</div>
            </div>
            <div style="text-align: center; width: 45%;">
              <div style="border-top: 1px solid #888; width: 80%; margin: 0 auto; padding-top: 5px; font-size: 12px; color: #555;">Consultant / Client Signature</div>
            </div>
          </div>

          <div class="footer">
            Generated automatically via Project Management Site Dashboard App
          </div>
          
          <script>
            window.onload = function() { window.print(); }
          </script>
        </body>
      </html>
    `;
    
    printWindow.document.open();
    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  // Export Table data to CSV
  const handleExportCSV = () => {
    const headers = ["Date", "Activity", "Work Planned", "Manpower Count", "Manpower Details", "Weather", "Photo/Video Link", "Remarks"];
    const csvRows = [headers.join(",")];
    
    filteredDpr.forEach(t => {
      const row = [
        t.date,
        `"${t.activity.replace(/"/g, '""')}"`,
        `"${t.workPlanned.replace(/"/g, '""')}"`,
        t.manpower,
        `"${t.manpowerDetails.replace(/"/g, '""')}"`,
        `"${t.weather.replace(/"/g, '""')}"`,
        `"${t.link}"`,
        `"${t.remarks.replace(/"/g, '""')}"`
      ];
      csvRows.push(row.join(","));
    });
    
    const csvContent = "data:text/csv;charset=utf-8," + csvRows.join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `DPR_Log_Export_${todayStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Calendar cells rendering helper
  const renderCalendarCells = () => {
    const { startWeekDay, totalDays, entriesMap } = calendarData;
    const cells = [];

    // Push empty spacer cells for start weekday offset
    for (let i = 0; i < startWeekDay; i++) {
      cells.push(<div key={`empty-${i}`} className="dpr-calendar-cell" style={{ opacity: 0, pointerEvents: 'none' }} />);
    }

    // Push actual month day cells
    for (let d = 1; d <= totalDays; d++) {
      const hasEntry = !!entriesMap[d];
      
      // Calculate date string
      const y = calendarData.year;
      const m = String(calendarData.month + 1).padStart(2, '0');
      const dayStrFormatted = String(d).padStart(2, '0');
      const dateStr = `${y}-${m}-${dayStrFormatted}`;
      const isActive = selectedDate === dateStr;

      cells.push(
        <div
          key={`day-${d}`}
          onClick={() => handleCellClick(d)}
          className={`dpr-calendar-cell ${hasEntry ? 'has-entry' : ''} ${isActive ? 'active-selection' : ''}`}
        >
          <div className="dpr-calendar-date-number" style={{ color: isActive ? 'var(--accent)' : 'inherit' }}>
            {d}
          </div>
          {hasEntry && (
            <div className="dpr-calendar-indicator" title={entriesMap[d].activity} />
          )}
        </div>
      );
    }

    return cells;
  };

  return (
    <div>
      {/* Metrics Banner */}
      <div className="metrics-grid">
        <div className="glass-card metric-card">
          <div className="metric-info">
            <h3>Today's Focus</h3>
            <p style={{ fontSize: '14px', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', maxWidth: '170px' }} title={todayStats.activity}>
              {todayStats.activity}
            </p>
          </div>
          <div className="metric-icon" style={{ background: 'rgba(99, 102, 241, 0.15)', color: '#6366F1' }}>
            <ClipboardList size={22} />
          </div>
        </div>

        <div className="glass-card metric-card">
          <div className="metric-info">
            <h3>Active Workers</h3>
            <p>{todayStats.manpower}</p>
          </div>
          <div className="metric-icon" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10B981' }}>
            <Users size={22} />
          </div>
        </div>

        <div className="glass-card metric-card">
          <div className="metric-info">
            <h3>Today's Weather</h3>
            <p style={{ fontSize: '18px' }}>{todayStats.weather}</p>
          </div>
          <div className="metric-icon" style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#F59E0B' }}>
            <Sun size={22} />
          </div>
        </div>
      </div>

      {/* Calendar & Active DPR Preview Panel */}
      <div className="calendar-layout">
        {/* Monthly Calendar */}
        <div className="glass-card dpr-calendar-card">
          <div className="chart-title">
            <span>Progress Log Calendar</span>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <button onClick={() => handleMonthChange(-1)} className="btn btn-secondary btn-icon-only" style={{ padding: '4px 8px' }}>&lt;</button>
              <span style={{ fontSize: '13px', fontWeight: 'bold' }}>{calendarData.monthName}</span>
              <button onClick={() => handleMonthChange(1)} className="btn btn-secondary btn-icon-only" style={{ padding: '4px 8px' }}>&gt;</button>
            </div>
          </div>

          <div className="dpr-calendar-grid">
            <div className="dpr-calendar-day-header">Sun</div>
            <div className="dpr-calendar-day-header">Mon</div>
            <div className="dpr-calendar-day-header">Tue</div>
            <div className="dpr-calendar-day-header">Wed</div>
            <div className="dpr-calendar-day-header">Thu</div>
            <div className="dpr-calendar-day-header">Fri</div>
            <div className="dpr-calendar-day-header">Sat</div>
            {renderCalendarCells()}
          </div>
        </div>

        {/* Selected Day Preview Pane */}
        <div className="glass-card dpr-calendar-card" style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="chart-title">
            <span>Log Details: {formatDateReadable(selectedDate)}</span>
            {activeDprView && (
              <button onClick={() => handlePrint(activeDprView)} className="btn btn-secondary btn-icon-only" title="Print/Export Report for Client">
                <Printer size={14} />
              </button>
            )}
          </div>
          
          <div style={{ flex: 1, fontSize: '13px', display: 'flex', flexDirection: 'column', gap: '12px', justifyContent: activeDprView ? 'flex-start' : 'center', alignItems: activeDprView ? 'stretch' : 'center', color: activeDprView ? 'inherit' : 'var(--text-muted)' }}>
            {activeDprView ? (
              <>
                <div>
                  <strong style={{ color: 'var(--accent)' }}>Activity Description:</strong>
                  <div style={{ marginTop: '3px', fontWeight: '600' }}>{activeDprView.activity}</div>
                </div>

                <div>
                  <strong style={{ color: 'var(--accent)' }}>Work Accomplished:</strong>
                  <div style={{ marginTop: '3px', color: 'var(--text-secondary)' }}>{activeDprView.workPlanned}</div>
                </div>

                <div style={{ display: 'flex', gap: '12px' }}>
                  <div style={{ flex: 1 }}>
                    <strong style={{ color: 'var(--accent)' }}>Headcount:</strong>
                    <div style={{ marginTop: '3px' }}>{activeDprView.manpower} staff</div>
                  </div>
                  <div style={{ flex: 1 }}>
                    <strong style={{ color: 'var(--accent)' }}>Weather:</strong>
                    <div style={{ marginTop: '3px' }}>{activeDprView.weather}</div>
                  </div>
                </div>

                <div>
                  <strong style={{ color: 'var(--accent)' }}>Labor Breakdown:</strong>
                  <div style={{ marginTop: '3px', color: 'var(--text-secondary)', fontSize: '12px' }}>{activeDprView.manpowerDetails}</div>
                </div>

                <div>
                  <strong style={{ color: 'var(--accent)' }}>Supervisor Remarks:</strong>
                  <div style={{ marginTop: '3px', color: 'var(--text-secondary)', fontStyle: 'italic' }}>{activeDprView.remarks || '-'}</div>
                </div>

                {activeDprView.link && (
                  <div>
                    <a href={activeDprView.link} target="_blank" rel="noopener noreferrer" className="btn btn-secondary" style={{ width: '100%', justifyContent: 'center', fontSize: '12px', padding: '6px' }}>
                      <Eye size={12} /> View Attached Media
                    </a>
                  </div>
                )}
                
                <div style={{ display: 'flex', gap: '8px', marginTop: 'auto', paddingTop: '10px' }}>
                  <button onClick={() => handleEdit(activeDprView)} className="btn btn-secondary" style={{ flex: 1, padding: '6px', fontSize: '12px' }}>
                    <Edit size={12} /> Edit Entry
                  </button>
                  <button onClick={() => handleDelete(activeDprView)} className="btn btn-secondary btn-danger" style={{ flex: 1, padding: '6px', fontSize: '12px' }}>
                    <Trash2 size={12} /> Delete
                  </button>
                </div>
              </>
            ) : (
              <div style={{ textAlign: 'center', padding: '24px' }}>
                <ClipboardList size={40} style={{ opacity: 0.3, marginBottom: '8px' }} />
                <div>No progress report logged for this day.</div>
                <button onClick={handleAddNew} className="btn btn-primary" style={{ marginTop: '16px', fontSize: '12px', padding: '6px 12px' }}>
                  <Plus size={12} /> Create Entry
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Manpower Trends Graph (Priority 1) */}
      {manpowerTrendData.items.length > 0 && (
        <div className="glass-card" style={{ padding: '20px', marginBottom: '24px' }}>
          <h3 style={{ fontSize: '15px', marginBottom: '12px' }}>Labor Mobilization Trend (Last 7 Logs)</h3>
          <div className="manpower-bar-chart">
            {manpowerTrendData.items.map((item, index) => {
              const pct = (item.manpower / manpowerTrendData.maxManpower) * 100;
              return (
                <div key={index} className="manpower-bar-wrapper">
                  <span style={{ fontSize: '10px', color: 'var(--text-primary)', fontWeight: 'bold', marginBottom: '2px' }}>
                    {item.manpower}
                  </span>
                  <div className="manpower-bar" style={{ height: `${pct * 0.8}%`, background: 'linear-gradient(to top, var(--accent), #8B5CF6)' }} title={`${item.date}: ${item.manpower} workers`} />
                  <span className="manpower-bar-label">
                    {item.date.slice(5)} {/* MM-DD */}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Table search filters toolbar */}
      <div className="actions-bar">
        <div className="search-box">
          <input 
            type="text" 
            placeholder="Search daily remarks or weather..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
          <Search size={18} className="search-icon" />
        </div>

        <div className="filters-group">
          <select value={activityFilter} onChange={(e) => setActivityFilter(e.target.value)} className="filter-select">
            <option value="all">All Activities</option>
            {activitiesList.map((a, i) => (
              <option key={i} value={a}>{a}</option>
            ))}
          </select>

          <button onClick={handleExportCSV} className="btn btn-secondary">
            <Download size={16} /> Export CSV
          </button>

          <button onClick={handleAddNew} className="btn btn-primary">
            <Plus size={16} /> Add Daily Progress
          </button>
        </div>
      </div>

      {/* DPR Table List */}
      <div className="table-container">
        <table className="responsive-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Activity Category</th>
              <th>Work Accomplished / Description</th>
              <th>Weather</th>
              <th>Crew Size</th>
              <th>Crew Breakdown Details</th>
              <th>Remarks</th>
              <th style={{ width: '100px', textAlign: 'center' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredDpr.length === 0 ? (
              <tr>
                <td colSpan="8" style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                  No DPR logs found matching filters.
                </td>
              </tr>
            ) : (
              filteredDpr.map((item) => (
                <tr key={item.id} style={{ cursor: 'pointer' }} onClick={() => { setSelectedDate(item.date); setActiveDprView(item); }}>
                  <td style={{ fontWeight: 'bold' }}>{formatDateReadable(item.date)}</td>
                  <td style={{ color: 'var(--text-primary)', fontWeight: '600' }}>{item.activity}</td>
                  <td>
                    <div style={{ maxWidth: '300px', fontSize: '13px', wordBreak: 'break-word' }}>{item.workPlanned}</div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px' }}>
                      {item.weather.toLowerCase().includes("rain") ? <CloudRain size={13} style={{ color: 'var(--status-inprogress)' }} /> : <Sun size={13} style={{ color: 'var(--status-onhold)' }} />}
                      {item.weather}
                    </div>
                  </td>
                  <td style={{ fontWeight: 'bold', color: 'var(--text-primary)' }}>{item.manpower}</td>
                  <td>
                    <div style={{ maxWidth: '200px', fontSize: '12px', color: 'var(--text-secondary)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }} title={item.manpowerDetails}>
                      {item.manpowerDetails || '-'}
                    </div>
                  </td>
                  <td>
                    <div style={{ maxWidth: '220px', fontSize: '13px', fontStyle: 'italic', wordBreak: 'break-word' }}>{item.remarks || '-'}</div>
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '8px' }}>
                      <button onClick={() => handleEdit(item)} className="btn btn-secondary btn-icon-only" title="Edit Log">
                        <Edit size={14} />
                      </button>
                      <button onClick={() => handleDelete(item)} className="btn btn-danger btn-icon-only" title="Delete Log">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add / Edit DPR Modal */}
      {showModal && (
        <div className="modal-overlay">
          <form onSubmit={handleSubmit} className="glass-card modal-content">
            <div className="modal-header">
              <h3>{editingEntry ? 'Edit Daily Progress Report' : 'Create Daily Progress Report'}</h3>
              <button type="button" onClick={() => setShowModal(false)} className="modal-close-btn">&times;</button>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Report Date *</label>
                <input 
                  type="date" 
                  name="date" 
                  value={formData.date}
                  onChange={handleFormChange}
                  className="form-input" 
                  required 
                />
              </div>
              <div className="form-group" style={{ display: 'flex', alignItems: 'flex-end' }}>
                <button type="button" onClick={() => setFormData(prev => ({ ...prev, date: todayStr }))} className="btn btn-secondary" style={{ width: '100%', height: '42px', justifyContent: 'center' }}>
                  Today's Date
                </button>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Activity Description / Category *</label>
                <input 
                  type="text" 
                  name="activity" 
                  value={formData.activity}
                  onChange={handleFormChange}
                  placeholder="e.g. Columns concreting, Brickwork Level 2" 
                  className="form-input" 
                  required 
                />
              </div>
              <div className="form-group">
                <label className="form-label">Weather Conditions *</label>
                <select name="weather" value={formData.weather} onChange={handleFormChange} className="form-select" required>
                  <option value="Sunny">Sunny</option>
                  <option value="Cloudy">Cloudy</option>
                  <option value="Rainy">Rainy</option>
                  <option value="Windy">Windy</option>
                  <option value="Sunny & Windy">Sunny & Windy</option>
                </select>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Work Accomplished *</label>
              <textarea 
                name="workPlanned" 
                value={formData.workPlanned}
                onChange={handleFormChange}
                placeholder="List exactly what tasks were performed, areas completed, or quantities achieved..." 
                className="form-textarea"
                required
              ></textarea>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Manpower Headcount *</label>
                <input 
                  type="number" 
                  name="manpower" 
                  value={formData.manpower}
                  onChange={handleFormChange}
                  min="0"
                  className="form-input" 
                  required 
                />
              </div>
              <div className="form-group">
                <label className="form-label">Media Attachment Link (Photo/Video URL)</label>
                <input 
                  type="url" 
                  name="link" 
                  value={formData.link}
                  onChange={handleFormChange}
                  placeholder="https://..." 
                  className="form-input" 
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Manpower Crew Details Breakdown *</label>
              <input 
                type="text" 
                name="manpowerDetails" 
                value={formData.manpowerDetails}
                onChange={handleFormChange}
                placeholder="e.g. 1 supervisor, 8 carpenters, 10 helpers" 
                className="form-input" 
                required 
              />
            </div>

            <div className="form-group">
              <label className="form-label">Remarks & Observations</label>
              <textarea 
                name="remarks" 
                value={formData.remarks}
                onChange={handleFormChange}
                placeholder="Note any resource shortages, machine breakdown, weather stoppages, or milestones..." 
                className="form-textarea"
              ></textarea>
            </div>

            <div className="modal-footer">
              <button type="button" onClick={() => setShowModal(false)} className="btn btn-secondary">Cancel</button>
              <button type="submit" className="btn btn-primary">Save DPR</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
