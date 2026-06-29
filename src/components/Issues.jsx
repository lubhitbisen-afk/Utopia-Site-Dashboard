import React, { useState, useMemo } from 'react';
import { ShieldAlert, Plus, Edit, Trash2, Download, Search, CheckSquare, Square, ExternalLink, Users, AlertCircle, Clock } from 'lucide-react';
import { formatDateReadable } from '../utils/sheets';

export default function Issues({ type, data, onAdd, onUpdate, onDelete, onBulkResolve }) {
  const [showModal, setShowModal] = useState(false);
  const [editingIssue, setEditingIssue] = useState(null);
  
  // Filtering and searching state
  const [searchTerm, setSearchTerm] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [contractorFilter, setContractorFilter] = useState("all");
  const [dateRangePreset, setDateRangePreset] = useState("all"); // 'all', '7days', 'thismonth', 'custom'
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  
  // Bulk selection checklist state
  const [selectedRowIndices, setSelectedRowIndices] = useState([]);

  // Form input states
  const todayStr = useMemo(() => {
    return new Date().toISOString().split('T')[0];
  }, []);

  const initialFormState = {
    date: todayStr,
    issue: "",
    description: "",
    priority: "Medium",
    status: "Open",
    contractor: "",
    link: "",
    notes: ""
  };
  const [formData, setFormData] = useState(initialFormState);

  // Normalize issues data to generic keys
  const normalizedIssues = useMemo(() => {
    if (!data || data.length === 0) return [];
    
    return data.map(t => {
      const date = t.Date || t.date || "";
      const issue = t["Issue/Defect"] || t["Safety Incident"] || t["Inefficiency Type"] || t.issue || t.incident || t.inefficiency || "";
      const description = t.Description || t.description || "";
      const priority = t.Priority || t.priority || "Medium";
      const status = t.Status || t.status || "Open";
      const contractor = t["Responsible Person/Contractor"] || t.contractor || "";
      const link = t["Photo/Video Link"] || t.link || "";
      const notes = t.Notes || t.notes || "";
      const rowIndex = t.rowIndex;
      const id = t.id;
      
      // Calculate Days Open
      let daysOpen = 0;
      if (status === "Open" || status === "In Progress") {
        if (date) {
          const issueDate = new Date(date);
          const today = new Date();
          daysOpen = Math.max(0, Math.floor((today - issueDate) / (1000 * 60 * 60 * 24)));
        }
      }

      // Highlight overdue: Open status & older than 7 days
      const isOverdue = (status === "Open" && daysOpen > 7);

      return {
        id,
        rowIndex,
        date,
        issue,
        description,
        priority,
        status,
        contractor,
        link,
        notes,
        daysOpen,
        isOverdue
      };
    });
  }, [data]);

  // Sort by Date (newest/most recent first)
  const sortedIssues = useMemo(() => {
    return [...normalizedIssues].sort((a, b) => {
      return b.date.localeCompare(a.date);
    });
  }, [normalizedIssues]);

  // Extract list of contractors for filter dropdown
  const contractorsList = useMemo(() => {
    const list = new Set();
    normalizedIssues.forEach(item => {
      if (item.contractor) list.add(item.contractor);
    });
    return Array.from(list).sort();
  }, [normalizedIssues]);

  // Filtering Logic
  const filteredIssues = useMemo(() => {
    return sortedIssues.filter(item => {
      // 1. Search Box
      const searchLower = searchTerm.toLowerCase();
      const matchSearch = item.issue.toLowerCase().includes(searchLower) || 
                          item.description.toLowerCase().includes(searchLower) ||
                          item.contractor.toLowerCase().includes(searchLower) ||
                          item.notes.toLowerCase().includes(searchLower);

      // 2. Dropdown Filters
      const matchPriority = priorityFilter === "all" || item.priority.toLowerCase() === priorityFilter.toLowerCase();
      const matchStatus = statusFilter === "all" || item.status.toLowerCase() === statusFilter.toLowerCase();
      const matchContractor = contractorFilter === "all" || item.contractor === contractorFilter;

      // 3. Date Range Filter
      let matchDate = true;
      if (dateRangePreset !== "all" && item.date) {
        const itemDate = new Date(item.date);
        const today = new Date();
        
        if (dateRangePreset === "7days") {
          const sevenDaysAgo = new Date();
          sevenDaysAgo.setDate(today.getDate() - 7);
          matchDate = itemDate >= sevenDaysAgo && itemDate <= today;
        } else if (dateRangePreset === "thismonth") {
          const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
          matchDate = itemDate >= firstDayOfMonth && itemDate <= today;
        } else if (dateRangePreset === "custom" && customStartDate && customEndDate) {
          const start = new Date(customStartDate);
          const end = new Date(customEndDate);
          // Set end date time to 23:59:59
          end.setHours(23, 59, 59);
          matchDate = itemDate >= start && itemDate <= end;
        }
      }

      return matchSearch && matchPriority && matchStatus && matchContractor && matchDate;
    });
  }, [sortedIssues, searchTerm, priorityFilter, statusFilter, contractorFilter, dateRangePreset, customStartDate, customEndDate]);

  // Summary Metrics calculations
  const summaryStats = useMemo(() => {
    const total = normalizedIssues.length;
    const open = normalizedIssues.filter(i => i.status === "Open").length;
    const inProgress = normalizedIssues.filter(i => i.status === "In Progress").length;
    const resolved = normalizedIssues.filter(i => i.status === "Resolved" || i.status === "Closed").length;
    const critical = normalizedIssues.filter(i => i.priority === "Critical" && i.status !== "Closed").length;

    // Contractor metrics counts
    const contractorCounts = {};
    normalizedIssues.forEach(item => {
      if (item.contractor && item.status !== "Closed") {
        contractorCounts[item.contractor] = (contractorCounts[item.contractor] || 0) + 1;
      }
    });

    // Find contractor with most open issues
    let worstContractor = "None";
    let maxIssues = 0;
    Object.keys(contractorCounts).forEach(c => {
      if (contractorCounts[c] > maxIssues) {
        maxIssues = contractorCounts[c];
        worstContractor = c;
      }
    });

    const contractorBreakdown = Object.keys(contractorCounts)
      .map(name => `${name} (${contractorCounts[name]})`)
      .slice(0, 3)
      .join(", ");

    return {
      total,
      open: open + inProgress,
      critical,
      resolved,
      worstContractor: worstContractor !== "None" ? `${worstContractor} (${maxIssues} active)` : "None",
      contractorBreakdown: contractorBreakdown || "No active issues"
    };
  }, [normalizedIssues]);

  // Label mappings depending on the issue tab type
  const labelMap = useMemo(() => {
    if (type === "Safety") {
      return {
        title: "Safety Incident Register",
        issueLabel: "Safety Incident Name",
        issueKey: "Safety Incident",
        placeholder: "e.g. Scaffolding railing missing",
        tabSheetsKey: "Safety"
      };
    }
    if (type === "Operational") {
      return {
        title: "Operational Inefficiencies",
        issueLabel: "Inefficiency Type / Delay Cause",
        issueKey: "Inefficiency Type",
        placeholder: "e.g. Cement concrete supply delayed",
        tabSheetsKey: "Operational"
      };
    }
    // Default Quality
    return {
      title: "Quality Defects & Issues",
      issueLabel: "Issue / Defect Description",
      issueKey: "Issue/Defect",
      placeholder: "e.g. Concrete plaster honeycomb voids",
      tabSheetsKey: "Quality"
    };
  }, [type]);

  // Add / Edit submission
  const handleAddNew = () => {
    setEditingIssue(null);
    setFormData(initialFormState);
    setShowModal(true);
  };

  const handleEdit = (issue) => {
    setEditingIssue(issue);
    setFormData({
      date: issue.date,
      issue: issue.issue,
      description: issue.description,
      priority: issue.priority,
      status: issue.status,
      contractor: issue.contractor,
      link: issue.link,
      notes: issue.notes
    });
    setShowModal(true);
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

    // Map properties back to target sheet structure
    const sheetRow = {
      "Date": formData.date,
      [labelMap.issueKey]: formData.issue,
      "Description": formData.description,
      "Priority": formData.priority,
      "Status": formData.status,
      "Responsible Person/Contractor": formData.contractor,
      "Photo/Video Link": formData.link,
      "Notes": formData.notes
    };

    if (editingIssue) {
      onUpdate(labelMap.tabSheetsKey, sheetRow, editingIssue.rowIndex, editingIssue.id);
    } else {
      onAdd(labelMap.tabSheetsKey, sheetRow);
    }
    setShowModal(false);
  };

  const handleDelete = (issue) => {
    if (window.confirm(`Are you sure you want to delete this log: "${issue.issue}"?`)) {
      onDelete(labelMap.tabSheetsKey, issue.rowIndex, issue.id);
      setSelectedRowIndices(prev => prev.filter(idx => idx !== issue.rowIndex));
    }
  };

  // Inline dropdown changes (very premium feature)
  const handleInlineChange = (issue, field, newValue) => {
    const sheetRow = {
      "Date": issue.date,
      [labelMap.issueKey]: issue.issue,
      "Description": issue.description,
      "Priority": field === 'priority' ? newValue : issue.priority,
      "Status": field === 'status' ? newValue : issue.status,
      "Responsible Person/Contractor": issue.contractor,
      "Photo/Video Link": issue.link,
      "Notes": issue.notes
    };
    onUpdate(labelMap.tabSheetsKey, sheetRow, issue.rowIndex, issue.id);
  };

  // Checklist Selection Handlers
  const handleSelectRow = (rowIndex) => {
    setSelectedRowIndices(prev => {
      if (prev.includes(rowIndex)) {
        return prev.filter(idx => idx !== rowIndex);
      } else {
        return [...prev, rowIndex];
      }
    });
  };

  const handleSelectAll = () => {
    if (selectedRowIndices.length === filteredIssues.length) {
      setSelectedRowIndices([]);
    } else {
      setSelectedRowIndices(filteredIssues.map(i => i.rowIndex));
    }
  };

  const handleBulkResolveClick = () => {
    if (selectedRowIndices.length === 0) return;
    if (window.confirm(`Are you sure you want to mark ${selectedRowIndices.length} issues as "Resolved"?`)) {
      // Find rows and pass updates
      const updates = selectedRowIndices.map(rIdx => {
        const item = data.find(x => x.rowIndex === rIdx);
        if (!item) return null;
        
        // Map elements
        const date = item.Date || item.date || "";
        const issue = item["Issue/Defect"] || item["Safety Incident"] || item["Inefficiency Type"] || item.issue || item.incident || item.inefficiency || "";
        const description = item.Description || item.description || "";
        const priority = item.Priority || item.priority || "Medium";
        const contractor = item["Responsible Person/Contractor"] || item.contractor || "";
        const link = item["Photo/Video Link"] || item.link || "";
        const notes = item.Notes || item.notes || "";
        const id = item.id;
        
        return {
          rowIndex: rIdx,
          id,
          data: {
            "Date": date,
            [labelMap.issueKey]: issue,
            "Description": description,
            "Priority": priority,
            "Status": "Resolved",
            "Responsible Person/Contractor": contractor,
            "Photo/Video Link": link,
            "Notes": notes
          }
        };
      }).filter(Boolean);

      onBulkResolve(labelMap.tabSheetsKey, updates);
      setSelectedRowIndices([]);
    }
  };

  // Export to CSV
  const handleExportCSV = () => {
    const headers = ["Date", labelMap.issueKey, "Description", "Priority", "Status", "Contractor", "Photo/Video Link", "Notes"];
    const csvRows = [headers.join(",")];
    
    filteredIssues.forEach(t => {
      const row = [
        t.date,
        `"${t.issue.replace(/"/g, '""')}"`,
        `"${t.description.replace(/"/g, '""')}"`,
        t.priority,
        t.status,
        `"${t.contractor.replace(/"/g, '""')}"`,
        `"${t.link}"`,
        `"${t.notes.replace(/"/g, '""')}"`
      ];
      csvRows.push(row.join(","));
    });
    
    const csvContent = "data:text/csv;charset=utf-8," + csvRows.join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${type}_Issues_${todayStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div>
      {/* Metrics Banner */}
      <div className="metrics-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        <div className="glass-card metric-card">
          <div className="metric-info">
            <h3>Active Issues</h3>
            <p>{summaryStats.open}</p>
          </div>
          <div className="metric-icon" style={{ background: summaryStats.open > 0 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(255, 255, 255, 0.03)', color: summaryStats.open > 0 ? '#EF4444' : 'var(--text-secondary)' }}>
            <AlertCircle size={22} />
          </div>
        </div>

        <div className="glass-card metric-card">
          <div className="metric-info">
            <h3>Critical Items</h3>
            <p style={{ color: summaryStats.critical > 0 ? '#C00000' : 'inherit' }}>{summaryStats.critical}</p>
          </div>
          <div className="metric-icon" style={{
            background: summaryStats.critical > 0 ? 'rgba(192, 0, 0, 0.2)' : 'rgba(255, 255, 255, 0.03)',
            color: summaryStats.critical > 0 ? '#FF0000' : 'var(--text-secondary)'
          }}>
            <ShieldAlert size={22} className={summaryStats.critical > 0 ? 'animate-bounce' : ''} />
          </div>
        </div>

        <div className="glass-card metric-card">
          <div className="metric-info">
            <h3>Max Unresolved</h3>
            <p style={{ fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '160px' }} title={summaryStats.worstContractor}>
              {summaryStats.worstContractor}
            </p>
          </div>
          <div className="metric-icon">
            <Users size={22} />
          </div>
        </div>

        <div className="glass-card metric-card">
          <div className="metric-info">
            <h3>Total Logged</h3>
            <p>{summaryStats.total}</p>
          </div>
          <div className="metric-icon" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10B981' }}>
            <Clock size={22} />
          </div>
        </div>
      </div>

      {/* Toolbar actions bar */}
      <div className="actions-bar">
        <div className="search-box">
          <input 
            type="text" 
            placeholder={`Search issues, notes, or contractors...`} 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
          <Search size={18} className="search-icon" />
        </div>

        <div className="filters-group">
          <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)} className="filter-select">
            <option value="all">All Priorities</option>
            <option value="Critical">Critical</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>

          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="filter-select">
            <option value="all">All Statuses</option>
            <option value="Open">Open</option>
            <option value="In Progress">In Progress</option>
            <option value="Resolved">Resolved</option>
            <option value="Closed">Closed</option>
          </select>

          <select value={contractorFilter} onChange={(e) => setContractorFilter(e.target.value)} className="filter-select">
            <option value="all">All Contractors</option>
            {contractorsList.map((c, i) => (
              <option key={i} value={c}>{c}</option>
            ))}
          </select>

          <select value={dateRangePreset} onChange={(e) => setDateRangePreset(e.target.value)} className="filter-select">
            <option value="all">All Dates</option>
            <option value="7days">Last 7 Days</option>
            <option value="thismonth">This Month</option>
            <option value="custom">Custom Range...</option>
          </select>

          {dateRangePreset === "custom" && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', animation: 'fadeIn 0.2s' }}>
              <input type="date" value={customStartDate} onChange={(e) => setCustomStartDate(e.target.value)} className="form-input" style={{ width: '130px', padding: '6px 10px', borderRadius: '20px' }} />
              <span style={{ fontSize: '12px' }}>to</span>
              <input type="date" value={customEndDate} onChange={(e) => setCustomEndDate(e.target.value)} className="form-input" style={{ width: '130px', padding: '6px 10px', borderRadius: '20px' }} />
            </div>
          )}

          {selectedRowIndices.length > 0 && (
            <button onClick={handleBulkResolveClick} className="btn btn-secondary btn-danger" style={{ background: 'rgba(16, 185, 129, 0.15)', borderColor: 'rgba(16, 185, 129, 0.3)', color: '#34D399' }}>
              Bulk Resolve ({selectedRowIndices.length})
            </button>
          )}

          <button onClick={handleExportCSV} className="btn btn-secondary">
            <Download size={16} /> Export
          </button>

          <button onClick={handleAddNew} className="btn btn-primary">
            <Plus size={16} /> Raise Issue
          </button>
        </div>
      </div>

      {/* Issues Table list */}
      <div className="table-container">
        <table className="responsive-table">
          <thead>
            <tr>
              <th className="checkbox-td">
                <button type="button" onClick={handleSelectAll} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                  {selectedRowIndices.length === filteredIssues.length && filteredIssues.length > 0 ? (
                    <CheckSquare size={16} className="text-accent" />
                  ) : (
                    <Square size={16} />
                  )}
                </button>
              </th>
              <th>Date</th>
              <th>Issue / Defect Description</th>
              <th>Priority</th>
              <th>Status</th>
              <th>Contractor / Responsible</th>
              <th>Days Open</th>
              <th>Attachments / Notes</th>
              <th style={{ width: '100px', textAlign: 'center' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredIssues.length === 0 ? (
              <tr>
                <td colSpan="9" style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                  No issues found matching filters.
                </td>
              </tr>
            ) : (
              filteredIssues.map((item) => {
                const isSafetyCritical = (type === "Safety" && item.priority === "Critical");
                const isSelected = selectedRowIndices.includes(item.rowIndex);
                
                return (
                  <tr 
                    key={item.id} 
                    className={`${item.isOverdue ? 'row-highlight' : ''}`}
                    style={isSafetyCritical ? { borderLeft: '4px solid var(--priority-critical)' } : {}}
                  >
                    <td className="checkbox-td">
                      <button type="button" onClick={() => handleSelectRow(item.rowIndex)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}>
                        {isSelected ? <CheckSquare size={16} className="text-accent" /> : <Square size={16} />}
                      </button>
                    </td>
                    <td>{formatDateReadable(item.date)}</td>
                    <td>
                      <div style={{ fontWeight: '600', color: isSafetyCritical ? '#EF4444' : 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {isSafetyCritical && (
                          <span className="sync-dot syncing" style={{ background: 'var(--priority-critical)', width: '10px', height: '10px', flexShrink: 0 }} />
                        )}
                        {item.issue}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px', maxWidth: '300px', wordBreak: 'break-word' }}>
                        {item.description}
                      </div>
                    </td>
                    <td>
                      {/* Priority selector directly in the table */}
                      <select 
                        value={item.priority} 
                        onChange={(e) => handleInlineChange(item, 'priority', e.target.value)}
                        className={`badge badge-priority-${item.priority.toLowerCase()}`}
                        style={{ border: 'none', padding: '4px 8px', outline: 'none', cursor: 'pointer' }}
                      >
                        <option value="Critical">Critical</option>
                        <option value="High">High</option>
                        <option value="Medium">Medium</option>
                        <option value="Low">Low</option>
                      </select>
                    </td>
                    <td>
                      {/* Status selector directly in the table */}
                      <select
                        value={item.status}
                        onChange={(e) => handleInlineChange(item, 'status', e.target.value)}
                        className={`badge badge-status-${item.status.toLowerCase().replace(" ", "")}`}
                        style={{ border: 'none', padding: '4px 8px', outline: 'none', cursor: 'pointer' }}
                      >
                        <option value="Open">Open</option>
                        <option value="In Progress">In Progress</option>
                        <option value="Resolved">Resolved</option>
                        <option value="Closed">Closed</option>
                      </select>
                    </td>
                    <td>
                      <div style={{ fontWeight: '500', color: 'var(--text-primary)' }}>{item.contractor || '-'}</div>
                    </td>
                    <td>
                      {(item.status === "Open" || item.status === "In Progress") ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: item.daysOpen > 7 ? '#EF4444' : 'inherit', fontWeight: item.daysOpen > 7 ? 'bold' : 'normal' }}>
                          {item.daysOpen} days
                          {item.isOverdue && <AlertCircle size={14} style={{ color: '#EF4444' }} />}
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>Closed</span>
                      )}
                    </td>
                    <td>
                      <div style={{ fontSize: '13px' }}>
                        {item.link ? (
                          <a href={item.link} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: 'var(--accent)', textDecoration: 'none', marginBottom: '4px' }}>
                            <ExternalLink size={12} /> View Photo/Video
                          </a>
                        ) : null}
                        <div style={{ color: 'var(--text-secondary)', fontSize: '12px', fontStyle: 'italic', maxWidth: '200px', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }} title={item.notes}>
                          {item.notes || '-'}
                        </div>
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', justifyContent: 'center', gap: '8px' }}>
                        <button onClick={() => handleEdit(item)} className="btn btn-secondary btn-icon-only" title="Edit Issue Details">
                          <Edit size={14} />
                        </button>
                        <button onClick={() => handleDelete(item)} className="btn btn-danger btn-icon-only" title="Delete Issue Log">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Add / Edit Form Modal */}
      {showModal && (
        <div className="modal-overlay">
          <form onSubmit={handleSubmit} className="glass-card modal-content">
            <div className="modal-header">
              <h3>{editingIssue ? `Edit ${type} Issue` : `Log New ${type} Issue`}</h3>
              <button type="button" onClick={() => setShowModal(false)} className="modal-close-btn">&times;</button>
            </div>

            <div className="form-group">
              <label className="form-label">Date *</label>
              <input 
                type="date" 
                name="date" 
                value={formData.date}
                onChange={handleFormChange}
                className="form-input" 
                required 
              />
            </div>

            <div className="form-group">
              <label className="form-label">{labelMap.issueLabel} *</label>
              <input 
                type="text" 
                name="issue" 
                value={formData.issue}
                onChange={handleFormChange}
                placeholder={labelMap.placeholder} 
                className="form-input" 
                required 
              />
            </div>

            <div className="form-group">
              <label className="form-label">Issue Details / Description *</label>
              <textarea 
                name="description" 
                value={formData.description}
                onChange={handleFormChange}
                placeholder="Detail the specific findings, location, scope of damage, or root cause of the issue..." 
                className="form-textarea"
                required
              ></textarea>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Priority *</label>
                <select name="priority" value={formData.priority} onChange={handleFormChange} className="form-select" required>
                  <option value="Critical">Critical</option>
                  <option value="High">High</option>
                  <option value="Medium">Medium</option>
                  <option value="Low">Low</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Status *</label>
                <select name="status" value={formData.status} onChange={handleFormChange} className="form-select" required>
                  <option value="Open">Open</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Resolved">Resolved</option>
                  <option value="Closed">Closed</option>
                </select>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Responsible Contractor / Subcontractor Name *</label>
              <input 
                type="text" 
                name="contractor" 
                value={formData.contractor}
                onChange={handleFormChange}
                placeholder="e.g. JK Infrastructure" 
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

            <div className="form-group">
              <label className="form-label">Notes & Instructions</label>
              <textarea 
                name="notes" 
                value={formData.notes}
                onChange={handleFormChange}
                placeholder="Any follow-up details, safety fines, scaffolding stops, or materials required to close this issue..." 
                className="form-textarea"
              ></textarea>
            </div>

            <div className="modal-footer">
              <button type="button" onClick={() => setShowModal(false)} className="btn btn-secondary">Cancel</button>
              <button type="submit" className="btn btn-primary">Save Log</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
