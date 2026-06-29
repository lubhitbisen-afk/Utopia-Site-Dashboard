import React, { useState, useMemo } from 'react';
import { Calendar, Plus, Edit, Trash2, Download, Clock, AlertTriangle, ArrowRight, ShieldAlert } from 'lucide-react';
import { formatDateReadable, parseDateString } from '../utils/sheets';

export default function Schedule({ data, onAdd, onUpdate, onDelete }) {
  const [showModal, setShowModal] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  
  // Form State
  const initialFormState = {
    activity: "",
    duration: 1,
    plannedStart: "",
    plannedEnd: "",
    actualStart: "",
    actualEnd: "",
    revisedEnd: "",
    remarks: "",
    completed: 0,
    status: "Not Started"
  };
  const [formData, setFormData] = useState(initialFormState);

  const todayStr = useMemo(() => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  }, []);

  // Sort schedule by Planned Start Date
  const sortedTasks = useMemo(() => {
    if (!data || data.length === 0) return [];
    return [...data].sort((a, b) => {
      const dateA = a["Planned Start Date"] || a.plannedStart || "";
      const dateB = b["Planned Start Date"] || b.plannedStart || "";
      return dateA.localeCompare(dateB);
    });
  }, [data]);

  // Normalize object keys (handles differences between CSV/API headers and local state)
  const normalizedTasks = useMemo(() => {
    return sortedTasks.map(t => {
      const plannedStart = t["Planned Start Date"] || t.plannedStart || "";
      const plannedEnd = t["Planned End Date"] || t.plannedEnd || "";
      const actualStart = t["Actual Start Date"] || t.actualStart || "";
      const actualEnd = t["Actual End Date"] || t.actualEnd || "";
      const revisedEnd = t["Revised End Date"] || t.revisedEnd || "";
      const duration = t["Duration (Days)"] !== undefined ? Number(t["Duration (Days)"]) : (t.duration !== undefined ? Number(t.duration) : 1);
      const completed = t["Completed %"] !== undefined ? Number(t["Completed %"]) : (t.completed !== undefined ? Number(t.completed) : 0);
      const status = t["Status"] || t.status || "Not Started";
      const remarks = t["Remarks"] || t.remarks || "";
      const activity = t["Activity Description"] || t.activity || "";
      const rowIndex = t.rowIndex;
      const id = t.id;

      // Dynamic calculation: Days Behind
      let daysBehind = 0;
      let delayText = "";
      
      const pEnd = new Date(plannedEnd);
      const aEnd = actualEnd ? new Date(actualEnd) : null;
      const rEnd = revisedEnd ? new Date(revisedEnd) : null;
      const today = new Date(todayStr);

      if (status !== "Completed") {
        const effectiveEnd = rEnd && rEnd > pEnd ? rEnd : pEnd;
        if (today > effectiveEnd) {
          daysBehind = Math.max(0, Math.floor((today - effectiveEnd) / (1000 * 60 * 60 * 24)));
          if (daysBehind > 0) delayText = `DELAYED by ${daysBehind} days`;
        }
      } else if (aEnd && pEnd) {
        if (aEnd > pEnd) {
          daysBehind = Math.max(0, Math.floor((aEnd - pEnd) / (1000 * 60 * 60 * 24)));
          if (daysBehind > 0) delayText = `DELAYED by ${daysBehind} days`;
        }
      }

      // Color Coding
      let colorClass = "gray"; // default
      if (status === "Completed") {
        colorClass = aEnd && pEnd && aEnd <= pEnd ? "green" : "red";
      } else if (status === "In Progress") {
        const effectiveEnd = rEnd && rEnd > pEnd ? rEnd : pEnd;
        const diffDays = Math.floor((effectiveEnd - today) / (1000 * 60 * 60 * 24));
        if (diffDays < 0) {
          colorClass = "red";
        } else if (diffDays <= 3) {
          colorClass = "yellow"; // approaching end
        } else {
          colorClass = "blue";
        }
      } else if (status === "Delayed") {
        colorClass = "red";
      } else if (status === "On Hold") {
        colorClass = "yellow";
      }

      return {
        id,
        rowIndex,
        activity,
        duration,
        plannedStart,
        plannedEnd,
        actualStart,
        actualEnd,
        revisedEnd,
        remarks,
        completed,
        status,
        daysBehind,
        delayText,
        colorClass
      };
    });
  }, [sortedTasks, todayStr]);

  // Filtering and Searching
  const filteredTasks = useMemo(() => {
    return normalizedTasks.filter(t => {
      const matchSearch = t.activity.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          t.remarks.toLowerCase().includes(searchTerm.toLowerCase());
      const matchStatus = statusFilter === "all" || t.status.toLowerCase() === statusFilter.toLowerCase();
      return matchSearch && matchStatus;
    });
  }, [normalizedTasks, searchTerm, statusFilter]);

  // Critical Path calculation: 
  // Identify tasks where a delay shifts the next tasks.
  // We define it as tasks that have 0 or less float: task PlannedEnd == next task PlannedStart
  // Or tasks currently "Delayed" or "In Progress" with daysBehind > 0.
  const criticalTasks = useMemo(() => {
    const criticalSet = new Set();
    
    // Simple heuristic: sequence linkages
    for (let i = 0; i < normalizedTasks.length; i++) {
      const current = normalizedTasks[i];
      if (!current.plannedEnd) continue;
      
      // If task is delayed/behind schedule, and not completed, flag it
      if (current.daysBehind > 0 && current.status !== "Completed") {
        criticalSet.add(current.id);
      }
      
      // Check linkages
      for (let j = 0; j < normalizedTasks.length; j++) {
        if (i === j) continue;
        const other = normalizedTasks[j];
        if (current.plannedEnd === other.plannedStart) {
          // If current is delayed, it impacts other directly
          if (current.status !== "Completed" && (current.daysBehind > 0 || current.status === "In Progress")) {
            criticalSet.add(current.id);
            criticalSet.add(other.id);
          }
        }
      }
    }
    
    // Ensure the last task in the critical chain is also flagged
    return criticalSet;
  }, [normalizedTasks]);

  // Blocking activities: Unfinished activities whose plannedEnd has passed OR is today, and matches another task's start date
  const blockingTasks = useMemo(() => {
    const blockers = [];
    normalizedTasks.forEach(t => {
      if (t.status !== "Completed") {
        const effectiveEnd = t.revisedEnd || t.plannedEnd;
        if (effectiveEnd && effectiveEnd <= todayStr) {
          // Find if this task is predecessor to any other task starting soon
          const dependents = normalizedTasks.filter(other => other.plannedStart === t.plannedEnd && other.id !== t.id);
          if (dependents.length > 0) {
            blockers.push({
              task: t,
              blocking: dependents.map(d => d.activity).join(", ")
            });
          }
        }
      }
    });
    return blockers;
  }, [normalizedTasks, todayStr]);

  // Stats Calculations
  const stats = useMemo(() => {
    if (normalizedTasks.length === 0) return { progress: 0, delayedCount: 0, nextToStart: "None" };
    
    const totalProgress = Math.round(
      normalizedTasks.reduce((sum, t) => sum + t.completed, 0) / normalizedTasks.length
    );
    const delayedCount = normalizedTasks.filter(t => t.daysBehind > 0 && t.status !== "Completed").length;
    
    const nextTask = normalizedTasks.find(t => t.status === "Not Started");
    
    return {
      progress: totalProgress,
      delayedCount,
      nextToStart: nextTask ? nextTask.activity : "All started/completed"
    };
  }, [normalizedTasks]);

  // Open Form for Add
  const handleAddNew = () => {
    setEditingTask(null);
    setFormData(initialFormState);
    setShowModal(true);
  };

  // Open Form for Edit
  const handleEdit = (task) => {
    setEditingTask(task);
    setFormData({
      activity: task.activity,
      duration: task.duration,
      plannedStart: task.plannedStart,
      plannedEnd: task.plannedEnd,
      actualStart: task.actualStart,
      actualEnd: task.actualEnd,
      revisedEnd: task.revisedEnd,
      remarks: task.remarks,
      completed: task.completed,
      status: task.status
    });
    setShowModal(true);
  };

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => {
      const updated = { ...prev, [name]: value };
      
      // Auto calculate End Date if Start Date and Duration are supplied
      if (name === "plannedStart" || name === "duration") {
        const start = name === "plannedStart" ? value : prev.plannedStart;
        const dur = name === "duration" ? Number(value) : Number(prev.duration);
        if (start && dur > 0) {
          const startDate = new Date(start);
          startDate.setDate(startDate.getDate() + dur - 1);
          updated.plannedEnd = startDate.toISOString().split('T')[0];
        }
      }
      return updated;
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    // Map form state keys back to spreadsheet row layout keys
    const sheetRow = {
      "Activity Description": formData.activity,
      "Duration (Days)": Number(formData.duration),
      "Planned Start Date": formData.plannedStart,
      "Planned End Date": formData.plannedEnd,
      "Actual Start Date": formData.actualStart,
      "Actual End Date": formData.actualEnd,
      "Revised End Date": formData.revisedEnd,
      "Remarks": formData.remarks,
      "Completed %": Number(formData.completed),
      "Status": formData.status
    };

    if (editingTask) {
      onUpdate("Schedule", sheetRow, editingTask.rowIndex, editingTask.id);
    } else {
      onAdd("Schedule", sheetRow);
    }
    setShowModal(false);
  };

  const handleDeleteClick = (task) => {
    if (window.confirm(`Are you sure you want to delete "${task.activity}"?`)) {
      onDelete("Schedule", task.rowIndex, task.id);
    }
  };

  // CSV Export
  const handleExportCSV = () => {
    const headers = [
      "Activity Description", "Duration (Days)", "Planned Start Date", "Planned End Date",
      "Actual Start Date", "Actual End Date", "Revised End Date", "Remarks", "Completed %", "Status"
    ];
    
    const csvRows = [headers.join(",")];
    
    normalizedTasks.forEach(t => {
      const row = [
        `"${t.activity.replace(/"/g, '""')}"`,
        t.duration,
        t.plannedStart,
        t.plannedEnd,
        t.actualStart,
        t.actualEnd,
        t.revisedEnd,
        `"${t.remarks.replace(/"/g, '""')}"`,
        t.completed,
        t.status
      ];
      csvRows.push(row.join(","));
    });
    
    const csvContent = "data:text/csv;charset=utf-8," + csvRows.join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Project_Schedule_${todayStr}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Gantt Chart bounds and SVG geometry calculation
  const ganttData = useMemo(() => {
    if (normalizedTasks.length === 0) return null;

    // Find min and max dates
    let minDate = null;
    let maxDate = null;

    normalizedTasks.forEach(t => {
      const pStart = parseDateString(t.plannedStart);
      const pEnd = parseDateString(t.plannedEnd);
      const aStart = parseDateString(t.actualStart);
      const aEnd = parseDateString(t.actualEnd);
      const rEnd = parseDateString(t.revisedEnd);

      const dates = [pStart, pEnd, aStart, aEnd, rEnd].filter(d => d !== null && !isNaN(d.getTime()));
      
      dates.forEach(d => {
        if (!minDate || d < minDate) minDate = new Date(d.getTime());
        if (!maxDate || d > maxDate) maxDate = new Date(d.getTime());
      });
    });

    if (!minDate || !maxDate) return null;

    // Pad dates slightly
    minDate.setDate(minDate.getDate() - 3);
    maxDate.setDate(maxDate.getDate() + 7);

    const totalDays = Math.max(1, Math.ceil((maxDate - minDate) / (1000 * 60 * 60 * 24)));
    
    // SVG Dimension Configuration
    const rowHeight = 42;
    const headerHeight = 40;
    const taskNameWidth = 220;
    const dayWidth = Math.max(15, Math.floor(700 / totalDays)); // responsive day width
    const chartWidth = taskNameWidth + (totalDays * dayWidth);
    const chartHeight = headerHeight + (normalizedTasks.length * rowHeight);

    return {
      minDate,
      maxDate,
      totalDays,
      rowHeight,
      headerHeight,
      taskNameWidth,
      dayWidth,
      chartWidth,
      chartHeight
    };
  }, [normalizedTasks]);

  // Convert date string to pixel coordinate X
  const getX = (dateStr, gantt) => {
    if (!dateStr || !gantt) return 0;
    const date = parseDateString(dateStr);
    if (!date || isNaN(date.getTime())) return 0;
    const diffTime = date - gantt.minDate;
    const diffDays = diffTime / (1000 * 60 * 60 * 24);
    return gantt.taskNameWidth + (diffDays * gantt.dayWidth);
  };

  // Convert date duration in days to width in pixels
  const getWidth = (startDateStr, endDateStr, gantt) => {
    if (!startDateStr || !endDateStr || !gantt) return 0;
    const start = parseDateString(startDateStr);
    const end = parseDateString(endDateStr);
    if (!start || isNaN(start.getTime()) || !end || isNaN(end.getTime())) return 0;
    const diffDays = Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1);
    return diffDays * gantt.dayWidth;
  };

  return (
    <div>
      {/* Metrics Banner */}
      <div className="metrics-grid">
        <div className="glass-card metric-card">
          <div className="metric-info">
            <h3>Project Progress</h3>
            <p>{stats.progress}%</p>
          </div>
          <div className="metric-icon" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10B981' }}>
            <Calendar size={22} />
          </div>
        </div>

        <div className="glass-card metric-card">
          <div className="metric-info">
            <h3>Delayed Activities</h3>
            <p style={{ color: stats.delayedCount > 0 ? 'var(--status-open)' : 'inherit' }}>{stats.delayedCount}</p>
          </div>
          <div className="metric-icon" style={{ background: stats.delayedCount > 0 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(255, 255, 255, 0.03)', color: stats.delayedCount > 0 ? '#EF4444' : 'var(--text-secondary)' }}>
            <Clock size={22} />
          </div>
        </div>

        <div className="glass-card metric-card">
          <div className="metric-info">
            <h3>Next Activity Start</h3>
            <p style={{ fontSize: '14px', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', maxWidth: '170px' }} title={stats.nextToStart}>
              {stats.nextToStart}
            </p>
          </div>
          <div className="metric-icon">
            <ArrowRight size={22} />
          </div>
        </div>
      </div>


      {/* Gantt Visualization */}
      {ganttData && (
        <div className="glass-card gantt-wrapper">
          <div className="gantt-title">
            <h3 style={{ fontSize: '16px' }}>Project Timeline (Gantt Chart)</h3>
            <div className="gantt-legend">
              <div className="legend-item">
                <div className="legend-color" style={{ background: 'var(--gantt-planned)', opacity: 0.4 }}></div>
                <span>Planned Schedule</span>
              </div>
              <div className="legend-item">
                <div className="legend-color" style={{ background: 'var(--accent)' }}></div>
                <span>Actual / revised</span>
              </div>
              <div className="legend-item">
                <div className="legend-color" style={{ background: 'var(--gantt-overdue)' }}></div>
                <span>Delayed Task</span>
              </div>
            </div>
          </div>

          <div className="gantt-container">
            <svg width={ganttData.chartWidth} height={ganttData.chartHeight} className="gantt-svg">
              {/* Draw Grid & Background */}
              <rect x="0" y="0" width={ganttData.taskNameWidth} height={ganttData.chartHeight} fill="rgba(255, 255, 255, 0.01)" />
              <line x1={ganttData.taskNameWidth} y1="0" x2={ganttData.taskNameWidth} y2={ganttData.chartHeight} stroke="var(--border-glass)" />
              
              {/* Months and Weeks Grid lines */}
              {Array.from({ length: ganttData.totalDays }).map((_, idx) => {
                const curDate = new Date(ganttData.minDate);
                curDate.setDate(curDate.getDate() + idx);
                const xVal = ganttData.taskNameWidth + (idx * ganttData.dayWidth);
                const isMonday = curDate.getDay() === 1;
                
                return (
                  <g key={idx}>
                    {/* Grid line */}
                    <line 
                      x1={xVal} 
                      y1="0" 
                      x2={xVal} 
                      y2={ganttData.chartHeight} 
                      className="gantt-grid-line" 
                      style={{ stroke: isMonday ? 'rgba(255, 255, 255, 0.12)' : 'var(--gantt-grid)' }}
                    />
                    {/* Month Label header */}
                    {isMonday && (
                      <text x={xVal + 4} y={ganttData.headerHeight - 24} className="gantt-header-text">
                        {curDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </text>
                    )}
                    {/* Day number header */}
                    <text x={xVal + (ganttData.dayWidth / 2)} y={ganttData.headerHeight - 8} textAnchor="middle" style={{ fontSize: '8px', fill: 'var(--text-muted)' }}>
                      {curDate.getDate()}
                    </text>
                  </g>
                );
              })}

              <line x1="0" y1={ganttData.headerHeight} x2={ganttData.chartWidth} y2={ganttData.headerHeight} stroke="var(--border-glass)" />

              {/* Draw Tasks Bars */}
              {normalizedTasks.map((t, idx) => {
                const yVal = ganttData.headerHeight + (idx * ganttData.rowHeight);
                const isCritical = criticalTasks.has(t.id);

                // Calculations for coordinates
                const planX = getX(t.plannedStart, ganttData);
                const planW = getWidth(t.plannedStart, t.plannedEnd, ganttData);

                // Use revisedEnd if exists, otherwise plannedEnd
                const effectiveEnd = t.revisedEnd || t.plannedEnd;
                // Use actualStart or plannedStart
                const startForActual = t.actualStart || t.plannedStart;
                const actX = getX(startForActual, ganttData);
                const actW = getWidth(startForActual, t.actualEnd || (t.status === "In Progress" ? todayStr : effectiveEnd), ganttData);

                const hasStarted = !!t.actualStart || t.status === "In Progress" || t.status === "Completed";

                return (
                  <g key={t.id} className="gantt-row-group">
                    {/* Row hover background */}
                    <rect x="0" y={yVal} width={ganttData.chartWidth} height={ganttData.rowHeight} fill="transparent" 
                          onMouseEnter={(e) => e.target.setAttribute('fill', 'rgba(255, 255, 255, 0.02)')}
                          onMouseLeave={(e) => e.target.setAttribute('fill', 'transparent')} 
                    />
                    
                    {/* Task Title */}
                    <text x="12" y={yVal + 24} className="gantt-task-name">
                      {isCritical ? '⚠️ ' : ''}{t.activity}
                    </text>

                    {/* Planned Bar */}
                    {planW > 0 && (
                      <rect 
                        x={planX} 
                        y={yVal + 10} 
                        width={planW} 
                        height={8} 
                        className="gantt-bar-planned" 
                        title={`Planned: ${t.plannedStart} to ${t.plannedEnd}`}
                      />
                    )}

                    {/* Actual / Revised Bar */}
                    {hasStarted && actW > 0 && (
                      <rect 
                        x={actX} 
                        y={yVal + 22} 
                        width={actW} 
                        height={10} 
                        className={t.colorClass === 'red' ? 'gantt-bar-overdue' : 'gantt-bar-actual'}
                        style={{ fill: t.colorClass === 'green' ? 'var(--status-resolved)' : t.colorClass === 'red' ? 'var(--status-open)' : 'var(--accent)' }}
                      />
                    )}

                    {/* Completed Bar indicator overlays actual bar */}
                    {hasStarted && actW > 0 && t.completed > 0 && (
                      <rect 
                        x={actX} 
                        y={yVal + 22} 
                        width={actW * (t.completed / 100)} 
                        height={10} 
                        className="gantt-bar-progress"
                        style={{ fill: 'rgba(255,255,255,0.25)' }}
                      />
                    )}

                    {/* Link connector line for layout grid separation */}
                    <line x1="0" y1={yVal + ganttData.rowHeight} x2={ganttData.chartWidth} y2={yVal + ganttData.rowHeight} stroke="var(--border-glass)" />
                  </g>
                );
              })}

              {/* Today's Vertical Line */}
              {getX(todayStr, ganttData) > ganttData.taskNameWidth && (
                <g>
                  <line 
                    x1={getX(todayStr, ganttData)} 
                    y1="0" 
                    x2={getX(todayStr, ganttData)} 
                    y2={ganttData.chartHeight} 
                    className="gantt-today-line" 
                  />
                  <text x={getX(todayStr, ganttData) + 4} y={15} style={{ fill: '#EF4444', fontSize: '9px', fontWeight: 'bold' }}>
                    TODAY
                  </text>
                </g>
              )}
            </svg>
          </div>
        </div>
      )}

      {/* Toolbar Actions */}
      <div className="actions-bar">
        <div className="search-box">
          <input 
            type="text" 
            placeholder="Search activities or remarks..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="search-input"
          />
          <Calendar size={18} className="search-icon" />
        </div>

        <div className="filters-group">
          <select 
            value={statusFilter} 
            onChange={(e) => setStatusFilter(e.target.value)}
            className="filter-select"
          >
            <option value="all">All Statuses</option>
            <option value="Not Started">Not Started</option>
            <option value="In Progress">In Progress</option>
            <option value="On Hold">On Hold</option>
            <option value="Completed">Completed</option>
            <option value="Delayed">Delayed</option>
          </select>

          <button onClick={handleExportCSV} className="btn btn-secondary">
            <Download size={16} /> Export CSV
          </button>

          <button onClick={handleAddNew} className="btn btn-primary">
            <Plus size={16} /> Add Activity
          </button>
        </div>
      </div>

      {/* Schedule Table */}
      <div className="table-container">
        <table className="responsive-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Activity Description</th>
              <th>Duration (Days)</th>
              <th>Planned Start & End</th>
              <th>Actual Start & End</th>
              <th>Status & Progress</th>
              <th>Remarks & Delay Check</th>
              <th style={{ width: '100px', textAlign: 'center' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredTasks.length === 0 ? (
              <tr>
                <td colSpan="8" style={{ textCenter: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                  No activities found matching filters.
                </td>
              </tr>
            ) : (
              filteredTasks.map((t) => {
                const isCritical = criticalTasks.has(t.id);
                return (
                  <tr key={t.id} className={t.daysBehind > 0 && t.status !== 'Completed' ? 'row-highlight' : ''}>
                    <td>{t.id}</td>
                    <td style={{ fontWeight: '600', color: 'var(--text-primary)' }}>
                      {isCritical && (
                        <span style={{ color: 'var(--status-open)', fontSize: '11px', background: 'rgba(239, 68, 68, 0.1)', padding: '2px 6px', borderRadius: '4px', marginRight: '6px' }}>
                          CRITICAL
                        </span>
                      )}
                      {t.activity}
                    </td>
                    <td>{t.duration} Days</td>
                    <td>
                      <div style={{ fontSize: '13px' }}>S: {formatDateReadable(t.plannedStart)}</div>
                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>E: {formatDateReadable(t.plannedEnd)}</div>
                    </td>
                    <td>
                      {t.actualStart ? (
                        <>
                          <div style={{ fontSize: '13px' }}>S: {formatDateReadable(t.actualStart)}</div>
                          <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                            E: {t.actualEnd ? formatDateReadable(t.actualEnd) : (t.revisedEnd ? `${formatDateReadable(t.revisedEnd)} (Rev)` : 'Ongoing')}
                          </div>
                        </>
                      ) : (
                        <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>Not Started</span>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span className={`badge badge-status-${t.status.toLowerCase().replace(" ", "")}`}>
                          {t.status}
                        </span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{ flex: 1, height: '6px', background: 'rgba(255,255,255,0.08)', borderRadius: '3px', width: '60px' }}>
                            <div style={{ height: '100%', background: 'var(--accent)', width: `${t.completed}%`, borderRadius: '3px' }}></div>
                          </div>
                          <span style={{ fontSize: '12px' }}>{t.completed}%</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div style={{ fontSize: '13px', maxWidth: '280px', wordBreak: 'break-word' }}>
                        {t.remarks || <span style={{ color: 'var(--text-muted)' }}>-</span>}
                      </div>
                      {t.daysBehind > 0 && (
                        <div style={{ color: '#EF4444', fontWeight: 'bold', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
                          <AlertTriangle size={12} /> {t.delayText}
                        </div>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', justifyContent: 'center', gap: '8px' }}>
                        <button onClick={() => handleEdit(t)} className="btn btn-secondary btn-icon-only" title="Edit Activity">
                          <Edit size={14} />
                        </button>
                        <button onClick={() => handleDeleteClick(t)} className="btn btn-danger btn-icon-only" title="Delete Activity">
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

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="modal-overlay">
          <form onSubmit={handleSubmit} className="glass-card modal-content">
            <div className="modal-header">
              <h3>{editingTask ? 'Edit Activity Description' : 'Add New Project Activity'}</h3>
              <button type="button" onClick={() => setShowModal(false)} className="modal-close-btn">&times;</button>
            </div>

            <div className="form-group">
              <label className="form-label">Activity Description *</label>
              <input 
                type="text" 
                name="activity" 
                value={formData.activity}
                onChange={handleFormChange}
                placeholder="e.g. Gr Floor Concrete Slab Pouring" 
                className="form-input" 
                required 
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Duration (Days) *</label>
                <input 
                  type="number" 
                  name="duration" 
                  value={formData.duration}
                  onChange={handleFormChange}
                  min="1"
                  className="form-input" 
                  required 
                />
              </div>
              <div className="form-group">
                <label className="form-label">Status *</label>
                <select name="status" value={formData.status} onChange={handleFormChange} className="form-select" required>
                  <option value="Not Started">Not Started</option>
                  <option value="In Progress">In Progress</option>
                  <option value="On Hold">On Hold</option>
                  <option value="Completed">Completed</option>
                  <option value="Delayed">Delayed</option>
                </select>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Planned Start Date *</label>
                <input 
                  type="date" 
                  name="plannedStart" 
                  value={formData.plannedStart}
                  onChange={handleFormChange}
                  className="form-input" 
                  required 
                />
              </div>
              <div className="form-group">
                <label className="form-label">Planned End Date *</label>
                <input 
                  type="date" 
                  name="plannedEnd" 
                  value={formData.plannedEnd}
                  onChange={handleFormChange}
                  className="form-input" 
                  required 
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Actual Start Date</label>
                <input 
                  type="date" 
                  name="actualStart" 
                  value={formData.actualStart}
                  onChange={handleFormChange}
                  className="form-input" 
                />
              </div>
              <div className="form-group">
                <label className="form-label">Actual End Date</label>
                <input 
                  type="date" 
                  name="actualEnd" 
                  value={formData.actualEnd}
                  onChange={handleFormChange}
                  className="form-input" 
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Revised End Date</label>
                <input 
                  type="date" 
                  name="revisedEnd" 
                  value={formData.revisedEnd}
                  onChange={handleFormChange}
                  className="form-input" 
                />
              </div>
              <div className="form-group">
                <label className="form-label">Completed % (0-100) *</label>
                <input 
                  type="number" 
                  name="completed" 
                  value={formData.completed}
                  onChange={handleFormChange}
                  min="0"
                  max="100"
                  className="form-input" 
                  required 
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Remarks</label>
              <textarea 
                name="remarks" 
                value={formData.remarks}
                onChange={handleFormChange}
                placeholder="Log any delays, observations or material constraints..." 
                className="form-textarea"
              ></textarea>
            </div>

            <div className="modal-footer">
              <button type="button" onClick={() => setShowModal(false)} className="btn btn-secondary">Cancel</button>
              <button type="submit" className="btn btn-primary">Save Activity</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
