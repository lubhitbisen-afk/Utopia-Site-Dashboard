import React, { useState, useMemo } from 'react';
import { X, Printer, Download, Calendar, CloudRain, Sun, Users, AlertTriangle, AlertCircle, CheckCircle, FileText } from 'lucide-react';
import { formatDateReadable, parseDateString } from '../utils/sheets';

export default function DailyReportModal({ 
  isOpen, 
  onClose, 
  scheduleData, 
  qualityData, 
  safetyData, 
  operationalData, 
  dprData 
}) {
  const todayStr = useMemo(() => {
    return new Date().toISOString().split('T')[0];
  }, []);

  // Set default date to the latest DPR log date, or today if none exists
  const latestDprDate = useMemo(() => {
    if (!dprData || dprData.length === 0) return todayStr;
    const sorted = [...dprData].map(d => d.Date || d.date).filter(Boolean).sort();
    return sorted.length > 0 ? sorted[sorted.length - 1] : todayStr;
  }, [dprData, todayStr]);

  const [selectedDate, setSelectedDate] = useState(latestDprDate);

  // 1. Find DPR Details for the day
  const dprEntry = useMemo(() => {
    if (!dprData) return null;
    const match = dprData.find(d => (d.Date || d.date) === selectedDate);
    if (!match) return null;
    return {
      date: match.Date || match.date || "",
      activity: match.Activity || match.activity || "",
      workPlanned: match["Work Planned"] || match.workPlanned || "", // WORKS COMPLETED
      manpower: match["Manpower (Count)"] !== undefined ? Number(match["Manpower (Count)"]) : (match.manpower !== undefined ? Number(match.manpower) : 0),
      manpowerDetails: match["Manpower Details"] || match.manpowerDetails || "",
      weather: match.Weather || match.weather || "Sunny 38°C",
      link: match["Photo/Video Link"] || match.link || "",
      remarks: match.Remarks || match.remarks || "" // WORKS PLANNED (SUPERVISOR REMARKS)
    };
  }, [dprData, selectedDate]);

  // 2. Filter schedule active tasks on that date
  const activeTasks = useMemo(() => {
    if (!scheduleData) return [];
    return scheduleData.map(t => {
      const plannedStart = t["Planned Start Date"] || t.plannedStart || "";
      const plannedEnd = t["Planned End Date"] || t.plannedEnd || "";
      const actualStart = t["Actual Start Date"] || t.actualStart || "";
      const actualEnd = t["Actual End Date"] || t.actualEnd || "";
      const revisedEnd = t["Revised End Date"] || t.revisedEnd || "";
      const completed = t["Completed %"] !== undefined ? Number(t["Completed %"]) : (t.completed !== undefined ? Number(t.completed) : 0);
      const status = t["Status"] || t.status || "Not Started";
      const activity = t["Activity Description"] || t.activity || "";
      const remarks = t["Remarks"] || t.remarks || "";

      return { activity, plannedStart, plannedEnd, actualStart, actualEnd, revisedEnd, completed, status, remarks };
    }).filter(t => {
      const start = parseDateString(t.actualStart || t.plannedStart);
      const end = parseDateString(t.actualEnd || t.revisedEnd || t.plannedEnd);
      const target = parseDateString(selectedDate);
      if (!start || !end || !target) return false;
      return start <= target && end >= target;
    });
  }, [scheduleData, selectedDate]);

  // 3. Filter open issues (raised on or before selected date, and not resolved/closed as of selectedDate)
  // Since we don't have the history of resolved dates, we fetch any issue whose date is <= selectedDate and is currently open/inprogress.
  const openIssues = useMemo(() => {
    const filterIssues = (data, issueType) => {
      if (!data) return [];
      return data.map(t => {
        const date = t.Date || t.date || "";
        const issue = t["Issue/Defect"] || t["Safety Incident"] || t["Inefficiency Type"] || t.issue || t.incident || t.inefficiency || "";
        const description = t.Description || t.description || "";
        const priority = t.Priority || t.priority || "Medium";
        const status = t.Status || t.status || "Open";
        const contractor = t["Responsible Person/Contractor"] || t.contractor || "";
        const notes = t.Notes || t.notes || "";
        return { date, issue, description, priority, status, contractor, notes, type: issueType };
      }).filter(i => {
        const iDate = parseDateString(i.date);
        const target = parseDateString(selectedDate);
        if (!iDate || !target) return false;
        return iDate <= target && (i.status === "Open" || i.status === "In Progress");
      });
    };

    return [
      ...filterIssues(qualityData, "Quality"),
      ...filterIssues(safetyData, "Safety"),
      ...filterIssues(operationalData, "Operational")
    ];
  }, [qualityData, safetyData, operationalData, selectedDate]);

  // 4. Upcoming Schedule (tasks scheduled to start after the selected date)
  const upcomingTasks = useMemo(() => {
    if (!scheduleData) return [];
    const target = parseDateString(selectedDate);
    return scheduleData.map(t => {
      const plannedStart = t["Planned Start Date"] || t.plannedStart || "";
      const plannedEnd = t["Planned End Date"] || t.plannedEnd || "";
      const duration = t["Duration (Days)"] !== undefined ? Number(t["Duration (Days)"]) : (t.duration !== undefined ? Number(t.duration) : 1);
      const activity = t["Activity Description"] || t.activity || "";
      return { activity, plannedStart, plannedEnd, duration };
    }).filter(t => {
      const start = parseDateString(t.plannedStart);
      if (!start || !target) return false;
      return start > target;
    }).sort((a, b) => {
      const startA = parseDateString(a.plannedStart);
      const startB = parseDateString(b.plannedStart);
      if (!startA || !startB) return 0;
      return startA - startB;
    });
  }, [scheduleData, selectedDate]);

  // 4.5 Filter delayed tasks as of the selected date
  const delayedTasks = useMemo(() => {
    if (!scheduleData || !Array.isArray(scheduleData)) return [];
    return scheduleData.map(t => {
      const plannedStart = t["Planned Start Date"] || t.plannedStart || "";
      const plannedEnd = t["Planned End Date"] || t.plannedEnd || "";
      const actualStart = t["Actual Start Date"] || t.actualStart || "";
      const actualEnd = t["Actual End Date"] || t.actualEnd || "";
      const revisedEnd = t["Revised End Date"] || t.revisedEnd || "";
      const completed = t["Completed %"] !== undefined ? Number(t["Completed %"]) : (t.completed !== undefined ? Number(t.completed) : 0);
      const status = t["Status"] || t.status || "Not Started";
      const activity = t["Activity Description"] || t.activity || "";
      const remarks = t["Remarks"] || t.remarks || "";

      const pEnd = parseDateString(plannedEnd);
      const rEnd = revisedEnd ? parseDateString(revisedEnd) : null;
      const effectiveEnd = rEnd && rEnd > pEnd ? rEnd : pEnd;
      
      const targetDate = parseDateString(selectedDate);
      let isTaskDelayed = false;
      let daysBehind = 0;

      if (status.toLowerCase() === "delayed") {
        isTaskDelayed = true;
        if (effectiveEnd && !isNaN(effectiveEnd.getTime()) && targetDate > effectiveEnd) {
          daysBehind = Math.max(0, Math.floor((targetDate - effectiveEnd) / (1000 * 60 * 60 * 24)));
        }
      } else if (status !== "Completed" && completed < 100) {
        if (effectiveEnd && !isNaN(effectiveEnd.getTime()) && targetDate > effectiveEnd) {
          isTaskDelayed = true;
          daysBehind = Math.max(0, Math.floor((targetDate - effectiveEnd) / (1000 * 60 * 60 * 24)));
        } else if (rEnd && pEnd && rEnd > pEnd && !isNaN(rEnd.getTime()) && !isNaN(pEnd.getTime())) {
          // Rescheduled / extended tasks are considered delayed relative to baseline
          isTaskDelayed = true;
          daysBehind = Math.max(0, Math.floor((rEnd - pEnd) / (1000 * 60 * 60 * 24)));
        }
      }

      return { activity, plannedStart, plannedEnd, actualStart, actualEnd, revisedEnd, completed, status, remarks, isTaskDelayed, daysBehind };
    }).filter(t => t.isTaskDelayed);
  }, [scheduleData, selectedDate]);

  // 5. Generate Gantt Chart SVG parameters
  const gantParams = useMemo(() => {
    if (!scheduleData || scheduleData.length === 0) return null;

    const normalized = scheduleData.map(t => {
      const pStart = t["Planned Start Date"] || t.plannedStart || "";
      const pEnd = t["Planned End Date"] || t.plannedEnd || "";
      const aStart = t["Actual Start Date"] || t.actualStart || "";
      const aEnd = t["Actual End Date"] || t.actualEnd || "";
      const rEnd = t["Revised End Date"] || t.revisedEnd || "";
      const completed = t["Completed %"] !== undefined ? Number(t["Completed %"]) : (t.completed !== undefined ? Number(t.completed) : 0);
      const status = t["Status"] || t.status || "Not Started";
      const activity = t["Activity Description"] || t.activity || "";
      return { activity, pStart, pEnd, aStart, aEnd, rEnd, completed, status };
    }).sort((a, b) => a.pStart.localeCompare(b.pStart));

    // Find min and max dates
    let minDate = null;
    let maxDate = null;

    normalized.forEach(t => {
      const dates = [
        parseDateString(t.pStart),
        parseDateString(t.pEnd),
        parseDateString(t.aStart),
        parseDateString(t.aEnd),
        parseDateString(t.rEnd)
      ].filter(d => d !== null && !isNaN(d.getTime()));
      
      dates.forEach(d => {
        if (!minDate || d < minDate) minDate = new Date(d.getTime());
        if (!maxDate || d > maxDate) maxDate = new Date(d.getTime());
      });
    });

    if (!minDate || !maxDate) return null;

    // Pad slightly
    const minPadded = new Date(minDate);
    minPadded.setDate(minPadded.getDate() - 3);
    const maxPadded = new Date(maxDate);
    maxPadded.setDate(maxPadded.getDate() + 5);

    const totalDays = Math.max(1, Math.ceil((maxPadded - minPadded) / (1000 * 60 * 60 * 24)));
    
    const rowHeight = 35;
    const headerHeight = 35;
    const taskWidth = 180;
    const dayWidth = Math.max(10, Math.floor(550 / totalDays));
    const width = taskWidth + (totalDays * dayWidth);
    const height = headerHeight + (normalized.length * rowHeight);

    return {
      minDate: minPadded,
      maxDate: maxPadded,
      totalDays,
      rowHeight,
      headerHeight,
      taskWidth,
      dayWidth,
      width,
      height,
      tasks: normalized
    };
  }, [scheduleData]);

  // Helpers to calculate coordinates
  const getX = (dateStr, gantt) => {
    if (!dateStr || !gantt) return 0;
    const date = parseDateString(dateStr);
    if (!date || isNaN(date.getTime())) return 0;
    const diffTime = date - gantt.minDate;
    const diffDays = diffTime / (1000 * 60 * 60 * 24);
    return gantt.taskWidth + (diffDays * gantt.dayWidth);
  };

  const getWidth = (startDateStr, endDateStr, gantt) => {
    if (!startDateStr || !endDateStr || !gantt) return 0;
    const start = parseDateString(startDateStr);
    const end = parseDateString(endDateStr);
    if (!start || isNaN(start.getTime()) || !end || isNaN(end.getTime())) return 0;
    const diffDays = Math.max(1, Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1);
    return diffDays * gantt.dayWidth;
  };

  // Compile full HTML content for download or print
  const getReportHtml = (isForDownload = false) => {
    const logoUrl = window.location.origin + "/logo.png";
    const reportDateStr = formatDateReadable(selectedDate);
    
    // Draw Gantt Chart SVG string
    let ganttSvgStr = "";
    if (gantParams) {
      const todayX = getX(selectedDate, gantParams);
      
      const gridLines = Array.from({ length: gantParams.totalDays }).map((_, idx) => {
        const curDate = new Date(gantParams.minDate);
        curDate.setDate(curDate.getDate() + idx);
        const x = gantParams.taskWidth + (idx * gantParams.dayWidth);
        const isMonday = curDate.getDay() === 1;
        
        return `
          <line x1="${x}" y1="0" x2="${x}" y2="${gantParams.height}" stroke="${isMonday ? 'rgba(0,0,0,0.15)' : 'rgba(0,0,0,0.05)'}" stroke-width="${isMonday ? 1.5 : 1}" />
          ${isMonday ? `<text x="${x + 4}" y="${gantParams.headerHeight - 20}" font-size="8px" fill="#4B5563" font-weight="bold">${curDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</text>` : ''}
          <text x="${x + (gantParams.dayWidth / 2)}" y="${gantParams.headerHeight - 6}" font-size="7px" fill="#9CA3AF" text-anchor="middle">${curDate.getDate()}</text>
        `;
      }).join('');

      const taskRows = gantParams.tasks.map((t, idx) => {
        const y = gantParams.headerHeight + (idx * gantParams.rowHeight);
        const planX = getX(t.pStart, gantParams);
        const planW = getWidth(t.pStart, t.pEnd, gantParams);
        
        const effectiveEnd = t.rEnd || t.pEnd;
        const startForActual = t.aStart || t.pStart;
        const actX = getX(startForActual, gantParams);
        const actW = getWidth(startForActual, t.aEnd || (t.status === "In Progress" ? selectedDate : effectiveEnd), gantParams);
        const hasStarted = t.status === "In Progress" || t.status === "Completed" || !!t.aStart;

        // Color coding
        let actualColor = "#4F46E5"; // default accent
        if (t.status === "Completed") actualColor = "#10B981";
        else if (t.status === "On Hold" || t.status === "Delayed") actualColor = "#EF4444";

        return `
          <line x1="0" y1="${y}" x2="${gantParams.width}" y2="${y}" stroke="#E5E7EB" />
          <text x="10" y="${y + 20}" font-size="9px" font-weight="500" fill="#1F2937">${t.activity}</text>
          
          <!-- Planned Bar -->
          ${planW > 0 ? `<rect x="${planX}" y="${y + 8}" width="${planW}" height="6" fill="#93C5FD" rx="2" opacity="0.5" />` : ''}
          
          <!-- Actual / Revised Bar -->
          ${hasStarted && actW > 0 ? `
            <rect x="${actX}" y="${y + 17}" width="${actW}" height="8" fill="${actualColor}" rx="2" />
            ${t.completed > 0 ? `<rect x="${actX}" y="${y + 17}" width="${actW * (t.completed / 100)}" height="8" fill="rgba(255,255,255,0.3)" rx="2" />` : ''}
          ` : ''}
        `;
      }).join('');

      ganttSvgStr = `
        <svg width="${gantParams.width}" height="${gantParams.height}" style="font-family: sans-serif; background: #FAFAFA; border: 1px solid #E5E7EB; border-radius: 8px;">
          <!-- Grid -->
          ${gridLines}
          <line x1="${gantParams.taskWidth}" y1="0" x2="${gantParams.taskWidth}" y2="${gantParams.height}" stroke="#D1D5DB" stroke-width="1.5" />
          <line x1="0" y1="${gantParams.headerHeight}" x2="${gantParams.width}" y2="${gantParams.headerHeight}" stroke="#D1D5DB" stroke-width="1.5" />
          
          <!-- Task elements -->
          ${taskRows}
          
          <!-- Report Date vertical line -->
          ${todayX > gantParams.taskWidth ? `
            <line x1="${todayX}" y1="0" x2="${todayX}" y2="${gantParams.height}" stroke="#EF4444" stroke-width="2" stroke-dasharray="3 2" />
            <rect x="${todayX - 35}" y="2" width="70" height="13" fill="#EF4444" rx="2" />
            <text x="${todayX}" y="11" font-size="7px" fill="white" font-weight="bold" text-anchor="middle">REPORT DATE</text>
          ` : ''}
        </svg>
      `;
    }

    const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Daily Site Report - ${selectedDate} - RAGHAV UTOPIA</title>
  <style>
    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      color: #1F2937;
      background-color: #FFFFFF;
      margin: 0;
      padding: 0;
      line-height: 1.5;
    }
    .container {
      max-width: 900px;
      margin: 0 auto;
      padding: 15px 20px;
    }
    /* Header layout */
    .header-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 12px;
      border-bottom: 2px double #D1D5DB;
      padding-bottom: 10px;
    }
    .header-logo {
      width: 120px;
      text-align: left;
      vertical-align: middle;
    }
    .header-logo img {
      max-height: 70px;
      max-width: 150px;
      object-fit: contain;
    }
    .header-title-container {
      text-align: right;
      vertical-align: middle;
    }
    .project-title {
      font-size: 26px;
      font-weight: 800;
      color: #1E3A8A;
      margin: 0;
      letter-spacing: -0.5px;
    }
    .report-title {
      font-size: 15px;
      font-weight: 600;
      color: #4F46E5;
      margin: 3px 0 0;
      text-transform: uppercase;
      letter-spacing: 1px;
    }
    .meta-grid {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 12px;
      background: #F9FAFB;
      border-radius: 8px;
      overflow: hidden;
      border: 1px solid #E5E7EB;
    }
    .meta-grid td {
      padding: 8px 12px;
      border: 1px solid #E5E7EB;
      font-size: 13px;
    }
    .meta-label {
      font-weight: bold;
      color: #4B5563;
      background: #F3F4F6;
      width: 20%;
    }
    .meta-val {
      width: 30%;
    }
    /* Content sections */
    .section-title {
      font-size: 13.5px;
      color: #1E3A8A;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      border-bottom: 2px solid #1E3A8A;
      padding-bottom: 4px;
      margin-top: 15px;
      margin-bottom: 8px;
      font-weight: 700;
    }
    /* DPR Double Columns */
    .dpr-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 12px;
      border: 1px solid #E5E7EB;
    }
    .dpr-table th {
      background-color: #1E3A8A;
      color: #FFFFFF;
      font-weight: 600;
      font-size: 13.5px;
      padding: 8px 12px;
      text-align: left;
      border: 1px solid #1E3A8A;
    }
    .dpr-table td {
      padding: 8px 12px;
      border: 1px solid #E5E7EB;
      font-size: 13px;
      vertical-align: top;
      width: 50%;
    }
    .dpr-table tr:nth-child(even) {
      background-color: #F9FAFB;
    }
    .rich-text {
      white-space: pre-wrap;
      color: #374151;
    }
    /* Standard tables */
    .data-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 12px;
      border: 1px solid #E5E7EB;
    }
    .data-table th {
      background-color: #F3F4F6;
      color: #374151;
      font-weight: bold;
      font-size: 12px;
      padding: 8px 10px;
      text-align: left;
      border: 1px solid #E5E7EB;
      text-transform: uppercase;
    }
    .data-table td {
      padding: 7px 10px;
      border: 1px solid #E5E7EB;
      font-size: 12.5px;
      color: #374151;
    }
    .data-table tr:nth-child(even) {
      background-color: #FAFAFA;
    }
    /* Priority/Status Badges */
    .badge {
      display: inline-block;
      padding: 3px 8px;
      border-radius: 12px;
      font-size: 11.5px;
      font-weight: bold;
      text-transform: uppercase;
    }
    .badge-critical { background: #FEE2E2; color: #991B1B; border: 1px solid #FCA5A5; }
    .badge-high { background: #FFEDD5; color: #9A3412; border: 1px solid #FDBA74; }
    .badge-medium { background: #FEF3C7; color: #92400E; border: 1px solid #FCD34D; }
    .badge-low { background: #ECFDF5; color: #065F46; border: 1px solid #A7F3D0; }
    
    .badge-open { background: #FEE2E2; color: #DC2626; }
    .badge-inprogress { background: #DBEAFE; color: #2563EB; }
    .badge-resolved { background: #D1FAE5; color: #059669; }
    
    .empty-state {
      text-align: center;
      padding: 20px;
      color: #6B7280;
      font-style: italic;
      border: 1px dashed #D1D5DB;
      border-radius: 8px;
      font-size: 13px;
    }
    /* Annexures / Gantt container */
    .gantt-outer {
      margin-top: 15px;
      width: 100%;
      overflow-x: auto;
    }
    .signature-container {
      margin-top: 50px;
      margin-bottom: 20px;
      display: flex;
      justify-content: space-between;
    }
    .signature-box {
      width: 40%;
      text-align: center;
    }
    .signature-line {
      border-top: 1.5px solid #4B5563;
      margin-top: 45px;
      padding-top: 5px;
      font-size: 12px;
      color: #4B5563;
      font-weight: bold;
    }
    .footer {
      border-top: 1px solid #E5E7EB;
      padding-top: 15px;
      margin-top: 40px;
      text-align: center;
      font-size: 11px;
      color: #9CA3AF;
    }
    /* Print optimizations */
    @media print {
      body {
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .container {
        padding: 0;
      }
      .no-print {
        display: none;
      }
      .page-break {
        page-break-before: always;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <table class="header-table">
      <tr>
        <td class="header-logo">
          <img src="${logoUrl}" alt="Raghav Utopia Logo" onerror="this.style.display='none';">
        </td>
        <td class="header-title-container">
          <h1 class="project-title">RAGHAV UTOPIA</h1>
          <div class="report-title">Daily Site Progress & Safety Report</div>
        </td>
      </tr>
    </table>

    <table class="meta-grid">
      <tr>
        <td class="meta-label">Report Date</td>
        <td class="meta-val"><strong>${reportDateStr}</strong></td>
        <td class="meta-label">Weather Condition</td>
        <td class="meta-val">${dprEntry ? dprEntry.weather : 'Sunny 38°C'}</td>
      </tr>
      <tr>
        <td class="meta-label">Total Labor Strength</td>
        <td class="meta-val">${dprEntry ? `${dprEntry.manpower} Personnel` : 'No logs recorded'}</td>
        <td class="meta-label">Labor Breakdown</td>
        <td class="meta-val" style="font-size:12px;">${dprEntry ? dprEntry.manpowerDetails : '-'}</td>
      </tr>
    </table>

    <!-- DPR DETAILS & DOUBLE COLUMNS -->
    <div class="section-title">Daily Progress Log Details</div>
    ${dprEntry ? `
      <table class="dpr-table">
        <thead>
          <tr>
            <th>Works Planned for the Day (Supervisor Remarks)</th>
            <th>Works Completed</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              <div class="rich-text">${dprEntry.remarks || 'No planned activities specified in remarks.'}</div>
            </td>
            <td>
              <div class="rich-text" style="font-weight: 500;">${dprEntry.workPlanned || 'No completed work records details.'}</div>
            </td>
          </tr>
        </tbody>
      </table>
      ${dprEntry.link ? `
        <div style="font-size: 12px; margin-bottom: 15px; color: #1E3A8A; word-break: break-all;">
          <strong>Attached Progress Media Link:</strong> <a href="${dprEntry.link}" target="_blank">${dprEntry.link}</a>
        </div>
      ` : ''}
    ` : `
      <div class="empty-state">No daily progress details logged for this date in the DPR.</div>
    `}

    <!-- SCHEDULE STATUS FOR THE DAY -->
    <div class="section-title">Active Schedule Status for the Day</div>
    ${activeTasks.length > 0 ? `
      <table class="data-table">
        <thead>
          <tr>
            <th>Activity Description</th>
            <th>Planned Dates</th>
            <th>Actual / Revised Dates</th>
            <th>Status</th>
            <th>Progress %</th>
          </tr>
        </thead>
        <tbody>
          ${activeTasks.map(t => {
            const plannedText = `S: ${t.plannedStart}<br>E: ${t.plannedEnd}`;
            const actualText = t.actualStart ? `S: ${t.actualStart}<br>E: ${t.actualEnd || t.revisedEnd || 'Ongoing'}` : 'Not Started';
            return `
              <tr>
                <td style="font-weight: 600;">${t.activity}</td>
                <td style="font-size: 11px; white-space: nowrap;">${plannedText}</td>
                <td style="font-size: 11px; white-space: nowrap;">${actualText}</td>
                <td><span class="badge" style="background:#EBF5FF; color:#1E40AF; font-size:10px;">${t.status}</span></td>
                <td style="font-weight:bold;">${t.completed}%</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    ` : `
      <div class="empty-state">No activities scheduled as active on this date.</div>
    `}

    <!-- DELAYED ACTIVITIES -->
    <div class="section-title" style="color: #DC2626; border-bottom: 2px solid #DC2626;">Delayed Activities & Concerns (Urgent Attention)</div>
    ${delayedTasks.length > 0 ? `
      <table class="data-table">
        <thead>
          <tr style="background-color: #FEF2F2;">
            <th style="color: #991B1B; border: 1px solid #FCA5A5;">Activity Description</th>
            <th style="color: #991B1B; border: 1px solid #FCA5A5;">Planned End Date</th>
            <th style="color: #991B1B; border: 1px solid #FCA5A5;">Days Delayed</th>
            <th style="color: #991B1B; border: 1px solid #FCA5A5;">Current Status & Progress</th>
            <th style="color: #991B1B; border: 1px solid #FCA5A5;">Remarks & Reasons for Delay</th>
          </tr>
        </thead>
        <tbody>
          ${delayedTasks.map(t => `
            <tr style="background-color: #FFF5F5;">
              <td style="font-weight: bold; color: #B91C1C;">⚠️ ${t.activity}</td>
              <td style="white-space: nowrap;">${t.revisedEnd ? `${t.revisedEnd} (Revised)` : t.plannedEnd}</td>
              <td style="font-weight: bold; color: #B91C1C;">${t.daysBehind > 0 ? `${t.daysBehind} Days` : 'N/A'}</td>
              <td>
                <span class="badge" style="background:#FEE2E2; color:#991B1B;">${t.status}</span>
                <span style="font-weight:bold; margin-left:5px;">(${t.completed}%)</span>
              </td>
              <td style="font-style: italic; color: #4B5563;">${t.remarks || 'No remarks or mitigation plan logged.'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    ` : `
      <div class="empty-state" style="border: 1px solid #D1FAE5; background-color: #ECFDF5; color: #065F46; padding: 15px; margin-bottom: 20px;">
        No delayed activities or overdue schedules recorded as of this date.
      </div>
    `}

    <!-- OPEN ISSUES (SAFETY, QUALITY, OPERATIONAL) -->
    <div class="section-title">Open Safety, Quality & Operational Issues</div>
    ${openIssues.length > 0 ? `
      <table class="data-table">
        <thead>
          <tr>
            <th>Category</th>
            <th>Date Raised</th>
            <th>Issue / Defect Description</th>
            <th>Contractor / Responsible</th>
            <th>Priority</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${openIssues.map(i => `
            <tr>
              <td><span style="font-weight: bold; font-size: 11px; color: ${i.type === 'Safety' ? '#DC2626' : i.type === 'Quality' ? '#D97706' : '#2563EB'}">${i.type.toUpperCase()}</span></td>
              <td>${i.date}</td>
              <td>
                <div style="font-weight:600;">${i.issue}</div>
                <div style="font-size:11px; color:#4B5563; margin-top:2px;">${i.description}</div>
              </td>
              <td>${i.contractor || '-'}</td>
              <td><span class="badge badge-${i.priority.toLowerCase()}">${i.priority}</span></td>
              <td><span class="badge badge-${i.status.toLowerCase().replace(' ', '')}">${i.status}</span></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    ` : `
      <div class="empty-state">No open safety, quality, or operational issues currently flagged.</div>
    `}

    <div style="margin-top: 15px;"></div>
    
    <div class="section-title">Annexure A: Current Timeline (Gantt Chart)</div>
    <div class="gantt-outer">
      ${ganttSvgStr || '<div class="empty-state">No timeline schedule data loaded to generate Gantt chart.</div>'}
    </div>

    <div class="section-title">Annexure B: Upcoming Schedule & Milestones</div>
    ${upcomingTasks.length > 0 ? `
      <table class="data-table">
        <thead>
          <tr>
            <th>Activity Description</th>
            <th>Planned Start</th>
            <th>Planned End</th>
            <th>Duration (Days)</th>
          </tr>
        </thead>
        <tbody>
          ${upcomingTasks.map(t => `
            <tr>
              <td style="font-weight: 500;">${t.activity}</td>
              <td>${t.plannedStart}</td>
              <td>${t.plannedEnd}</td>
              <td>${t.duration} Days</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    ` : `
      <div class="empty-state">No upcoming activities scheduled. All tasks are completed or currently active.</div>
    `}



    <div class="footer">
      Generated automatically via Site Dashboard System for RAGHAV UTOPIA
    </div>
  </div>

  ${!isForDownload ? `
    <script>
      window.onload = function() { window.print(); }
    </script>
  ` : ''}
</body>
</html>
    `;
    return htmlContent;
  };

  const handlePrint = () => {
    const printWindow = window.open('', '_blank', 'width=950,height=900');
    if (printWindow) {
      printWindow.document.open();
      printWindow.document.write(getReportHtml(false));
      printWindow.document.close();
    }
  };

  const handleDownload = () => {
    const htmlContent = getReportHtml(true);
    const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Daily_Site_Report_${selectedDate}_Raghav_Utopia.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleDownloadWord = () => {
    const htmlContent = getReportHtml(true);
    const docContent = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head>
        <title>Daily Site Report - RAGHAV UTOPIA</title>
        <!--[if gte mso 9]>
        <xml>
          <w:WordDocument>
            <w:View>Print</w:View>
            <w:Zoom>100</w:Zoom>
          </w:WordDocument>
        </xml>
        <![endif]-->
      </head>
      <body>
        ${htmlContent}
      </body>
      </html>
    `;
    const blob = new Blob(['\ufeff' + docContent], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Daily_Site_Report_${selectedDate}_Raghav_Utopia.doc`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="glass-card modal-content" style={{ maxWidth: '900px', width: '90vw' }}>
        <div className="modal-header">
          <div>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
              <FileText size={20} className="text-accent" />
              Generate Daily Site Report
            </h3>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
              Project: <strong style={{ color: 'var(--text-primary)' }}>RAGHAV UTOPIA</strong>
            </p>
          </div>
          <button onClick={onClose} className="modal-close-btn">&times;</button>
        </div>

        {/* Date Selector and Controls */}
        <div className="actions-bar" style={{ background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-glass)', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Calendar size={18} className="text-accent" />
            <label style={{ fontSize: '14px', fontWeight: 'bold', color: 'var(--text-primary)' }}>Select Report Date:</label>
            <input 
              type="date" 
              value={selectedDate} 
              onChange={(e) => setSelectedDate(e.target.value)} 
              className="form-input" 
              style={{ width: '160px', padding: '6px 12px', borderRadius: '20px' }} 
            />
          </div>
          
          <div style={{ display: 'flex', gap: '10px' }}>
            <button onClick={handleDownload} className="btn btn-secondary" title="Download standalone HTML report">
              <Download size={16} /> Download HTML
            </button>
            <button onClick={handleDownloadWord} className="btn btn-secondary" title="Download editable Word Document">
              <FileText size={16} /> Download Word Doc
            </button>
            <button onClick={handlePrint} className="btn btn-primary" title="Print or save as PDF">
              <Printer size={16} /> Print / Save PDF
            </button>
          </div>
        </div>

        {/* Report Live Preview Area */}
        <div style={{ flex: 1, overflowY: 'auto', border: '1px solid var(--border-glass)', borderRadius: '12px', background: 'var(--bg-app)', padding: '24px', minHeight: '300px' }}>
          <div style={{ background: 'white', color: '#1F2937', padding: '30px', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', fontFamily: 'sans-serif' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'between', alignItems: 'center', borderBottom: '3.5px double #D1D5DB', paddingBottom: '16px', marginBottom: '20px' }}>
              <div style={{ flex: 1 }}>
                <img 
                  src="/logo.png" 
                  alt="Raghav Utopia Logo" 
                  style={{ maxHeight: '60px', maxWidth: '140px', objectFit: 'contain' }} 
                  onError={(e) => { e.currentTarget.style.display = 'none'; }} 
                />
              </div>
              <div style={{ textAlign: 'right' }}>
                <h1 style={{ fontSize: '24px', fontWeight: 'bold', color: '#1E3A8A', margin: 0 }}>RAGHAV UTOPIA</h1>
                <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#4F46E5', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: '2px' }}>
                  Daily Site Progress & Safety Report
                </div>
              </div>
            </div>

            {/* Metadata */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', background: '#F9FAFB', padding: '12px 16px', borderRadius: '8px', border: '1px solid #E5E7EB', marginBottom: '20px', fontSize: '13px' }}>
              <div><strong>Report Date:</strong> {formatDateReadable(selectedDate)}</div>
              <div><strong>Weather Condition:</strong> {dprEntry ? dprEntry.weather : 'Sunny 38°C'}</div>
              <div><strong>Labor Strength:</strong> {dprEntry ? `${dprEntry.manpower} Workers` : 'No logs'}</div>
              <div><strong>Labor Breakdown:</strong> {dprEntry ? dprEntry.manpowerDetails : '-'}</div>
            </div>

            {/* DPR DOUBLE COLUMNS */}
            <h4 style={{ fontSize: '14px', borderBottom: '2px solid #1E3A8A', color: '#1E3A8A', textTransform: 'uppercase', paddingBottom: '4px', margin: '20px 0 10px' }}>
              Daily Progress Log Details
            </h4>
            {dprEntry ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', border: '1px solid #E5E7EB', borderRadius: '6px', overflow: 'hidden', marginBottom: '15px' }}>
                <div style={{ padding: '12px', borderRight: '1px solid #E5E7EB', background: '#FAFAFA' }}>
                  <div style={{ fontSize: '11px', color: '#1E3A8A', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '6px' }}>
                    Works Planned for the Day (Supervisor Remarks)
                  </div>
                  <div style={{ fontSize: '13px', whiteSpace: 'pre-wrap', color: '#374151' }}>{dprEntry.remarks || 'No remarks recorded.'}</div>
                </div>
                <div style={{ padding: '12px' }}>
                  <div style={{ fontSize: '11px', color: '#1E3A8A', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '6px' }}>
                    Works Completed
                  </div>
                  <div style={{ fontSize: '13px', whiteSpace: 'pre-wrap', fontWeight: '600', color: '#1F2937' }}>{dprEntry.workPlanned || 'No details provided.'}</div>
                </div>
              </div>
            ) : (
              <div className="empty-state" style={{ color: '#9CA3AF', fontStyle: 'italic', padding: '12px', textAlign: 'center', border: '1px dashed #D1D5DB', borderRadius: '6px', fontSize: '13px', marginBottom: '15px' }}>
                No DPR entry found for this date.
              </div>
            )}

            {/* SCHEDULE STATUS */}
            <h4 style={{ fontSize: '14px', borderBottom: '2px solid #1E3A8A', color: '#1E3A8A', textTransform: 'uppercase', paddingBottom: '4px', margin: '20px 0 10px' }}>
              Active Schedule Status for the Day
            </h4>
            {activeTasks.length > 0 ? (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', marginBottom: '15px' }}>
                <thead>
                  <tr style={{ background: '#F3F4F6' }}>
                    <th style={{ border: '1px solid #E5E7EB', padding: '8px', textAlign: 'left' }}>Activity Description</th>
                    <th style={{ border: '1px solid #E5E7EB', padding: '8px', textAlign: 'left' }}>Status</th>
                    <th style={{ border: '1px solid #E5E7EB', padding: '8px', textAlign: 'center' }}>Progress %</th>
                  </tr>
                </thead>
                <tbody>
                  {activeTasks.map((t, i) => (
                    <tr key={i}>
                      <td style={{ border: '1px solid #E5E7EB', padding: '8px', fontWeight: '500' }}>{t.activity}</td>
                      <td style={{ border: '1px solid #E5E7EB', padding: '8px' }}>
                        <span style={{ padding: '2px 6px', background: '#DBEAFE', color: '#1E40AF', borderRadius: '4px', fontSize: '10px', fontWeight: 'bold' }}>{t.status}</span>
                      </td>
                      <td style={{ border: '1px solid #E5E7EB', padding: '8px', textAlign: 'center', fontWeight: 'bold' }}>{t.completed}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div style={{ color: '#9CA3AF', fontStyle: 'italic', padding: '12px', textAlign: 'center', border: '1px dashed #D1D5DB', borderRadius: '6px', fontSize: '13px', marginBottom: '15px' }}>
                No active schedule tasks for this date.
              </div>
            )}

            {/* DELAYED ACTIVITIES */}
            <h4 style={{ fontSize: '14px', borderBottom: '2px solid #DC2626', color: '#DC2626', textTransform: 'uppercase', paddingBottom: '4px', margin: '20px 0 10px' }}>
              Delayed Activities & Concerns (Urgent Attention)
            </h4>
            {delayedTasks.length > 0 ? (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', marginBottom: '15px' }}>
                <thead>
                  <tr style={{ background: '#FEE2E2' }}>
                    <th style={{ border: '1px solid #FCA5A5', padding: '8px', textAlign: 'left', color: '#991B1B' }}>Activity Description</th>
                    <th style={{ border: '1px solid #FCA5A5', padding: '8px', textAlign: 'left', color: '#991B1B' }}>Target Completion</th>
                    <th style={{ border: '1px solid #FCA5A5', padding: '8px', textAlign: 'center', color: '#991B1B' }}>Days Overdue</th>
                    <th style={{ border: '1px solid #FCA5A5', padding: '8px', textAlign: 'left', color: '#991B1B' }}>Remarks & Mitigations</th>
                  </tr>
                </thead>
                <tbody>
                  {delayedTasks.map((t, i) => (
                    <tr key={i} style={{ background: '#FFF5F5' }}>
                      <td style={{ border: '1px solid #FCA5A5', padding: '8px', fontWeight: 'bold', color: '#B91C1C' }}>⚠️ {t.activity}</td>
                      <td style={{ border: '1px solid #FCA5A5', padding: '8px', whiteSpace: 'nowrap' }}>{t.revisedEnd ? `${t.revisedEnd} (Revised)` : t.plannedEnd}</td>
                      <td style={{ border: '1px solid #FCA5A5', padding: '8px', textAlign: 'center', fontWeight: 'bold', color: '#B91C1C' }}>
                        {t.daysBehind > 0 ? `${t.daysBehind} Days` : 'N/A'}
                      </td>
                      <td style={{ border: '1px solid #FCA5A5', padding: '8px', color: '#4B5563', fontStyle: 'italic' }}>
                        {t.remarks || 'No remarks recorded.'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div style={{ color: '#065F46', background: '#ECFDF5', border: '1px solid #A7F3D0', padding: '12px', textAlign: 'center', borderRadius: '6px', fontSize: '13px', marginBottom: '15px' }}>
                No delayed activities or overdue tasks recorded as of this date.
              </div>
            )}

            {/* OPEN ISSUES */}
            <h4 style={{ fontSize: '14px', borderBottom: '2px solid #1E3A8A', color: '#1E3A8A', textTransform: 'uppercase', paddingBottom: '4px', margin: '20px 0 10px' }}>
              Open Safety, Quality & Operational Issues
            </h4>
            {openIssues.length > 0 ? (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', marginBottom: '15px' }}>
                <thead>
                  <tr style={{ background: '#F3F4F6' }}>
                    <th style={{ border: '1px solid #E5E7EB', padding: '8px', textAlign: 'left' }}>Category</th>
                    <th style={{ border: '1px solid #E5E7EB', padding: '8px', textAlign: 'left' }}>Issue Description</th>
                    <th style={{ border: '1px solid #E5E7EB', padding: '8px', textAlign: 'left' }}>Responsible Person</th>
                    <th style={{ border: '1px solid #E5E7EB', padding: '8px', textAlign: 'center' }}>Priority</th>
                  </tr>
                </thead>
                <tbody>
                  {openIssues.map((issue, i) => (
                    <tr key={i}>
                      <td style={{ border: '1px solid #E5E7EB', padding: '8px', fontWeight: 'bold', color: issue.type === 'Safety' ? '#DC2626' : issue.type === 'Quality' ? '#D97706' : '#2563EB' }}>
                        {issue.type.toUpperCase()}
                      </td>
                      <td style={{ border: '1px solid #E5E7EB', padding: '8px' }}>
                        <div style={{ fontWeight: '500' }}>{issue.issue}</div>
                        <div style={{ fontSize: '10px', color: '#6B7280' }}>{issue.description}</div>
                      </td>
                      <td style={{ border: '1px solid #E5E7EB', padding: '8px' }}>{issue.contractor || '-'}</td>
                      <td style={{ border: '1px solid #E5E7EB', padding: '8px', textAlign: 'center' }}>
                        <span className={`badge badge-${issue.priority.toLowerCase()}`} style={{ fontSize: '9px' }}>{issue.priority}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div style={{ color: '#9CA3AF', fontStyle: 'italic', padding: '12px', textAlign: 'center', border: '1px dashed #D1D5DB', borderRadius: '6px', fontSize: '13px', marginBottom: '15px' }}>
                No open issues as of this date.
              </div>
            )}

            {/* ANNEXURE A: GANTT CHART */}
            <h4 style={{ fontSize: '14px', borderBottom: '2px solid #1E3A8A', color: '#1E3A8A', textTransform: 'uppercase', paddingBottom: '4px', margin: '25px 0 10px' }}>
              Annexure A: Current Timeline (Gantt Chart)
            </h4>
            {gantParams ? (
              <div style={{ overflowX: 'auto', paddingBottom: '10px' }}>
                <svg width={gantParams.width} height={gantParams.height} style={{ background: '#FAFAFA', border: '1px solid #E5E7EB', borderRadius: '6px' }}>
                  {/* Grid Lines */}
                  {Array.from({ length: gantParams.totalDays }).map((_, idx) => {
                    const curDate = new Date(gantParams.minDate);
                    curDate.setDate(curDate.getDate() + idx);
                    const x = gantParams.taskWidth + (idx * gantParams.dayWidth);
                    const isMonday = curDate.getDay() === 1;
                    return (
                      <g key={idx}>
                        <line x1={x} y1="0" x2={x} y2={gantParams.height} stroke={isMonday ? 'rgba(0,0,0,0.12)' : 'rgba(0,0,0,0.04)'} strokeWidth={isMonday ? 1.5 : 1} />
                        {isMonday && (
                          <text x={x + 4} y={gantParams.headerHeight - 20} fontSize="8px" fill="#4B5563" fontWeight="bold">
                            {curDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </text>
                        )}
                        <text x={x + (gantParams.dayWidth / 2)} y={gantParams.headerHeight - 6} fontSize="7px" fill="#9CA3AF" textAnchor="middle">
                          {curDate.getDate()}
                        </text>
                      </g>
                    );
                  })}
                  <line x1={gantParams.taskWidth} y1="0" x2={gantParams.taskWidth} y2={gantParams.height} stroke="#D1D5DB" strokeWidth="1.5" />
                  <line x1="0" y1={gantParams.headerHeight} x2={gantParams.width} y2={gantParams.headerHeight} stroke="#D1D5DB" strokeWidth="1.5" />

                  {/* Task Rows */}
                  {gantParams.tasks.map((t, idx) => {
                    const y = gantParams.headerHeight + (idx * gantParams.rowHeight);
                    const planX = getX(t.pStart, gantParams);
                    const planW = getWidth(t.pStart, t.pEnd, gantParams);

                    const effectiveEnd = t.rEnd || t.pEnd;
                    const startForActual = t.aStart || t.pStart;
                    const actX = getX(startForActual, gantParams);
                    const actW = getWidth(startForActual, t.aEnd || (t.status === "In Progress" ? selectedDate : effectiveEnd), gantParams);
                    const hasStarted = t.status === "In Progress" || t.status === "Completed" || !!t.aStart;

                    let actualColor = "#6366F1"; // Accent
                    if (t.status === "Completed") actualColor = "#10B981";
                    else if (t.status === "On Hold" || t.status === "Delayed") actualColor = "#EF4444";

                    return (
                      <g key={idx}>
                        <line x1="0" y1={y} x2={gantParams.width} y2={y} stroke="#E5E7EB" />
                        <text x="10" y={y + 20} fontSize="9px" fontWeight="500" fill="#1F2937">{t.activity}</text>
                        {planW > 0 && <rect x={planX} y={y + 8} width={planW} height="5" fill="#93C5FD" rx="2" opacity="0.5" />}
                        {hasStarted && actW > 0 && (
                          <g>
                            <rect x={actX} y={y + 16} width={actW} height="8" fill={actualColor} rx="2" />
                            {t.completed > 0 && <rect x={actX} y={y + 16} width={actW * (t.completed / 100)} height="8" fill="rgba(255,255,255,0.3)" rx="2" />}
                          </g>
                        )}
                      </g>
                    );
                  })}

                  {/* Current Report Date vertical line */}
                  {getX(selectedDate, gantParams) > gantParams.taskWidth && (
                    <g>
                      <line x1={getX(selectedDate, gantParams)} y1="0" x2={getX(selectedDate, gantParams)} y2={gantParams.height} stroke="#EF4444" strokeWidth="2" strokeDasharray="3 2" />
                      <rect x={getX(selectedDate, gantParams) - 30} y="2" width="60" height="12" fill="#EF4444" rx="2" />
                      <text x={getX(selectedDate, gantParams)} y={10} fontSize="7px" fill="white" fontWeight="bold" textAnchor="middle">REPORT DATE</text>
                    </g>
                  )}
                </svg>
              </div>
            ) : (
              <div style={{ color: '#9CA3AF', fontStyle: 'italic', padding: '12px', textAlign: 'center', border: '1px dashed #D1D5DB', borderRadius: '6px', fontSize: '13px', marginBottom: '15px' }}>
                No Gantt Chart parameters loaded.
              </div>
            )}

            {/* ANNEXURE B: UPCOMING SCHEDULE */}
            <h4 style={{ fontSize: '14px', borderBottom: '2px solid #1E3A8A', color: '#1E3A8A', textTransform: 'uppercase', paddingBottom: '4px', margin: '25px 0 10px' }}>
              Annexure B: Upcoming Schedule & Milestones
            </h4>
            {upcomingTasks.length > 0 ? (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px', marginBottom: '15px' }}>
                <thead>
                  <tr style={{ background: '#F3F4F6' }}>
                    <th style={{ border: '1px solid #E5E7EB', padding: '8px', textAlign: 'left' }}>Activity Description</th>
                    <th style={{ border: '1px solid #E5E7EB', padding: '8px', textAlign: 'left' }}>Planned Start Date</th>
                    <th style={{ border: '1px solid #E5E7EB', padding: '8px', textAlign: 'left' }}>Planned End Date</th>
                    <th style={{ border: '1px solid #E5E7EB', padding: '8px', textAlign: 'center' }}>Duration</th>
                  </tr>
                </thead>
                <tbody>
                  {upcomingTasks.map((t, i) => (
                    <tr key={i}>
                      <td style={{ border: '1px solid #E5E7EB', padding: '8px', fontWeight: '500' }}>{t.activity}</td>
                      <td style={{ border: '1px solid #E5E7EB', padding: '8px' }}>{t.plannedStart}</td>
                      <td style={{ border: '1px solid #E5E7EB', padding: '8px' }}>{t.plannedEnd}</td>
                      <td style={{ border: '1px solid #E5E7EB', padding: '8px', textAlign: 'center' }}>{t.duration} Days</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div style={{ color: '#9CA3AF', fontStyle: 'italic', padding: '12px', textAlign: 'center', border: '1px dashed #D1D5DB', borderRadius: '6px', fontSize: '13px', marginBottom: '15px' }}>
                No upcoming tasks scheduled after this date.
              </div>
            )}
            

          </div>
        </div>

        <div className="modal-footer" style={{ marginTop: '20px' }}>
          <button onClick={onClose} className="btn btn-secondary">
            Close Preview
          </button>
        </div>
      </div>
    </div>
  );
}
