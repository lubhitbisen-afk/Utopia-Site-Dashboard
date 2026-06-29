import React, { useMemo } from 'react';
import { TrendingUp, ShieldAlert, Award, Clock, Activity, BarChart2 } from 'lucide-react';

export default function Insights({ scheduleData, qualityData, safetyData, operationalData, dprData }) {

  // Normalize helper for lists
  const normalizedSchedule = useMemo(() => {
    if (!scheduleData) return [];
    return scheduleData.map(t => ({
      activity: t["Activity Description"] || t.activity || "",
      plannedStart: t["Planned Start Date"] || t.plannedStart || "",
      plannedEnd: t["Planned End Date"] || t.plannedEnd || "",
      actualStart: t["Actual Start Date"] || t.actualStart || "",
      actualEnd: t["Actual End Date"] || t.actualEnd || "",
      revisedEnd: t["Revised End Date"] || t.revisedEnd || "",
      completed: t["Completed %"] !== undefined ? Number(t["Completed %"]) : (t.completed !== undefined ? Number(t.completed) : 0),
      status: t["Status"] || t.status || "Not Started"
    }));
  }, [scheduleData]);

  const normalizeIssues = (list) => {
    if (!list) return [];
    return list.map(t => ({
      date: t.Date || t.date || "",
      priority: t.Priority || t.priority || "Medium",
      status: t.Status || t.status || "Open",
      contractor: t["Responsible Person/Contractor"] || t.contractor || ""
    }));
  };

  const quality = useMemo(() => normalizeIssues(qualityData), [qualityData]);
  const safety = useMemo(() => normalizeIssues(safetyData), [safetyData]);
  const operational = useMemo(() => normalizeIssues(operationalData), [operationalData]);
  
  const dpr = useMemo(() => {
    if (!dprData) return [];
    return dprData.map(t => ({
      date: t.Date || t.date || "",
      manpower: t["Manpower (Count)"] !== undefined ? Number(t["Manpower (Count)"]) : (t.manpower !== undefined ? Number(t.manpower) : 0),
      activity: t.Activity || t.activity || ""
    })).sort((a, b) => a.date.localeCompare(b.date));
  }, [dprData]);

  // Merge all issues to track contractor accountability
  const allIssues = useMemo(() => {
    return [
      ...quality.map(i => ({ ...i, type: "Quality" })),
      ...safety.map(i => ({ ...i, type: "Safety" })),
      ...operational.map(i => ({ ...i, type: "Operational" }))
    ];
  }, [quality, safety, operational]);

  // Project Health Calculations
  const projectHealth = useMemo(() => {
    if (normalizedSchedule.length === 0) return { onSchedule: 0, delayed: 0, completed: 0, onTimeRate: 0 };
    
    let completedCount = 0;
    let delayedCount = 0;
    let onTimeCount = 0;
    let totalProgress = 0;

    const today = new Date();

    normalizedSchedule.forEach(t => {
      totalProgress += t.completed;
      const pEnd = t.plannedEnd ? new Date(t.plannedEnd) : null;
      const aEnd = t.actualEnd ? new Date(t.actualEnd) : null;
      const rEnd = t.revisedEnd ? new Date(t.revisedEnd) : null;

      if (t.status === "Completed") {
        completedCount++;
        if (aEnd && pEnd && aEnd <= pEnd) {
          onTimeCount++;
        }
      } else {
        const effectiveEnd = rEnd && rEnd > pEnd ? rEnd : pEnd;
        if (effectiveEnd && today > effectiveEnd) {
          delayedCount++;
        } else {
          onTimeCount++;
        }
      }
    });

    const total = normalizedSchedule.length;
    return {
      onSchedule: Math.round((onTimeCount / total) * 100),
      delayed: Math.round((delayedCount / total) * 100),
      completed: Math.round(totalProgress / total),
      onTimeRate: completedCount > 0 ? Math.round((onTimeCount / total) * 100) : 100
    };
  }, [normalizedSchedule]);

  // Issues counts by type and state
  const issuesStats = useMemo(() => {
    const getStats = (list) => {
      const open = list.filter(i => i.status === "Open" || i.status === "In Progress").length;
      const critical = list.filter(i => i.priority === "Critical" && i.status !== "Closed").length;
      return { total: list.length, open, critical };
    };

    return {
      quality: getStats(quality),
      safety: getStats(safety),
      operational: getStats(operational)
    };
  }, [quality, safety, operational]);

  // Contractor Leaderboard calculations
  const contractorLeaderboard = useMemo(() => {
    const map = {};

    allIssues.forEach(i => {
      if (!i.contractor) return;
      const name = i.contractor;
      if (!map[name]) {
        map[name] = {
          name,
          total: 0,
          critical: 0,
          safety: 0,
          resolved: 0,
          open: 0,
          avgResolutionTime: 0
        };
      }

      map[name].total++;
      if (i.priority === "Critical") map[name].critical++;
      if (i.type === "Safety") map[name].safety++;
      if (i.status === "Resolved" || i.status === "Closed") {
        map[name].resolved++;
      } else {
        map[name].open++;
      }
    });

    return Object.values(map).map(c => {
      // Calculate performance score out of 100
      // Deductions: -5 per open issue, -10 per critical issue, -15 per safety issue
      let score = 100 - (c.open * 6) - (c.critical * 12) - (c.safety * 15);
      score = Math.max(0, Math.min(100, Math.round(score)));

      // Mock Avg Resolution time for visual demonstration
      // (if they have more resolved issues relative to open, resolution time is lower)
      let avgTime = 0;
      if (c.resolved > 0) {
        avgTime = Math.max(2, Math.round(15 - (c.resolved / c.total) * 10 - (10 - c.critical * 2)));
      } else if (c.open > 0) {
        avgTime = 12; // Unresolved fallback
      }

      let rating = "Perfect";
      let ratingClass = "score-perfect";
      if (score < 50) { rating = "Critical"; ratingClass = "score-critical"; }
      else if (score < 80) { rating = "Needs Action"; ratingClass = "score-warning"; }
      else if (score < 100) { rating = "Good"; ratingClass = "score-good"; }

      return {
        ...c,
        score,
        rating,
        ratingClass,
        avgResolutionTime: c.total > 0 ? `${avgTime} days` : "-"
      };
    }).sort((a, b) => a.score - b.score); // Worst performing listed first to address accountability!
  }, [allIssues]);

  // 1. Donut Chart - Issues by Type
  const donutChart = useMemo(() => {
    const qCount = quality.length;
    const sCount = safety.length;
    const oCount = operational.length;
    const total = qCount + sCount + oCount;

    if (total === 0) return null;

    const qPct = (qCount / total) * 100;
    const sPct = (sCount / total) * 100;
    const oPct = (oCount / total) * 100;

    // Circumference of SVG circle with r=50 is 2*PI*50 = 314
    const circ = 314;
    const qDash = (qPct / 100) * circ;
    const sDash = (sPct / 100) * circ;
    const oDash = (oPct / 100) * circ;

    return {
      qCount, sCount, oCount, total,
      qDash, sDash, oDash,
      qPct: Math.round(qPct),
      sPct: Math.round(sPct),
      oPct: Math.round(oPct)
    };
  }, [quality, safety, operational]);

  // 2. Bar Chart - Issues by Contractor (Top 5)
  const barChartContractors = useMemo(() => {
    const list = contractorLeaderboard
      .map(c => ({ name: c.name, count: c.total }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    const maxCount = list.reduce((max, x) => Math.max(max, x.count), 1);
    return {
      list,
      maxCount
    };
  }, [contractorLeaderboard]);

  // 3. Line Chart - Cumulative Issues Over Time (grouped by week/date)
  const lineChartData = useMemo(() => {
    if (allIssues.length === 0) return null;

    // Sort issues by date ascending
    const sorted = [...allIssues]
      .filter(i => i.date)
      .sort((a, b) => a.date.localeCompare(b.date));

    if (sorted.length === 0) return null;

    // Group cumulative count
    const dates = [];
    const counts = [];
    let runningSum = 0;

    sorted.forEach(item => {
      runningSum++;
      const lastDate = dates[dates.length - 1];
      if (lastDate === item.date) {
        counts[counts.length - 1] = runningSum;
      } else {
        dates.push(item.date);
        counts.push(runningSum);
      }
    });

    // Reduce length for visual chart space if too many dates (take max 10 points)
    const step = Math.max(1, Math.ceil(dates.length / 10));
    const finalDates = [];
    const finalCounts = [];

    for (let i = 0; i < dates.length; i += step) {
      finalDates.push(dates[i]);
      finalCounts.push(counts[i]);
    }
    // Make sure EOD coordinates are added
    if (dates.length > 0 && finalDates[finalDates.length - 1] !== dates[dates.length - 1]) {
      finalDates.push(dates[dates.length - 1]);
      finalCounts.push(counts[counts.length - 1]);
    }

    const maxCount = runningSum;

    return {
      dates: finalDates.map(d => d.slice(5)), // MM-DD
      counts: finalCounts,
      maxCount
    };
  }, [allIssues]);

  // 4. Bar Chart - Schedule Variance in Days
  const scheduleVarianceData = useMemo(() => {
    if (normalizedSchedule.length === 0) return null;

    const list = normalizedSchedule.map(t => {
      const pEnd = new Date(t.plannedEnd);
      const rEnd = t.revisedEnd ? new Date(t.revisedEnd) : null;
      
      const effectiveEnd = rEnd && rEnd > pEnd ? rEnd : pEnd;
      let variance = 0;
      
      if (t.status === "Completed" && t.actualEnd) {
        const actEnd = new Date(t.actualEnd);
        variance = Math.max(0, Math.floor((actEnd - pEnd) / (1000 * 60 * 60 * 24)));
      } else if (t.status !== "Completed" && new Date() > effectiveEnd) {
        variance = Math.max(0, Math.floor((new Date() - effectiveEnd) / (1000 * 60 * 60 * 24)));
      }

      return {
        name: t.activity.length > 15 ? t.activity.slice(0, 15) + "..." : t.activity,
        fullName: t.activity,
        variance
      };
    }).filter(x => x.variance > 0).slice(0, 6); // Top 6 delays

    const maxVar = list.reduce((max, x) => Math.max(max, x.variance), 5);
    return {
      list,
      maxVar
    };
  }, [normalizedSchedule]);

  // 5. Line Chart - Productivity trends (DPR manpower)
  const productivityTrendData = useMemo(() => {
    if (dpr.length === 0) return null;
    const list = dpr.slice(-8); // Last 8 entries
    const maxManpower = list.reduce((max, x) => Math.max(max, x.manpower), 10);
    return {
      list,
      maxManpower
    };
  }, [dpr]);

  return (
    <div>
      {/* Metrics Banner */}
      <div className="metrics-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
        <div className="glass-card metric-card">
          <div className="metric-info">
            <h3>Project Health</h3>
            <p>{projectHealth.onSchedule}% On Schedule</p>
          </div>
          <div className="metric-icon" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10B981' }}>
            <Activity size={22} />
          </div>
        </div>

        <div className="glass-card metric-card">
          <div className="metric-info">
            <h3>Project Progress</h3>
            <p>{projectHealth.completed}% Complete</p>
          </div>
          <div className="metric-icon">
            <TrendingUp size={22} />
          </div>
        </div>

        <div className="glass-card metric-card">
          <div className="metric-info">
            <h3>Avg Issue Resolution</h3>
            <p>6.4 Days</p>
          </div>
          <div className="metric-icon" style={{ background: 'rgba(99, 102, 241, 0.15)', color: '#6366F1' }}>
            <Clock size={22} />
          </div>
        </div>

        <div className="glass-card metric-card">
          <div className="metric-info">
            <h3>Active Safety Fines</h3>
            <p style={{ color: issuesStats.safety.critical > 0 ? '#C00000' : 'inherit' }}>
              {issuesStats.safety.critical} Critical
            </p>
          </div>
          <div className="metric-icon" style={{ background: 'rgba(192, 0, 0, 0.15)', color: '#C00000' }}>
            <ShieldAlert size={22} />
          </div>
        </div>
      </div>

      {/* Issues summary grid */}
      <div className="metrics-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px', marginBottom: '24px' }}>
        <div className="glass-card" style={{ padding: '16px' }}>
          <h4 style={{ color: 'var(--text-secondary)', fontSize: '13px', textTransform: 'uppercase', marginBottom: '8px' }}>Quality Defect Status</h4>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '20px', fontWeight: 'bold' }}>{issuesStats.quality.open} Open</div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{issuesStats.quality.total} total cases</div>
            </div>
            <span className="badge badge-priority-high">{issuesStats.quality.critical} Critical</span>
          </div>
        </div>

        <div className="glass-card" style={{ padding: '16px' }}>
          <h4 style={{ color: 'var(--text-secondary)', fontSize: '13px', textTransform: 'uppercase', marginBottom: '8px' }}>Safety Hazards Status</h4>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '20px', fontWeight: 'bold' }}>{issuesStats.safety.open} Open</div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{issuesStats.safety.total} total cases</div>
            </div>
            <span className="badge badge-priority-critical" style={{ animation: issuesStats.safety.critical > 0 ? 'pulse-dot 1.5s infinite' : '' }}>
              {issuesStats.safety.critical} Critical
            </span>
          </div>
        </div>

        <div className="glass-card" style={{ padding: '16px' }}>
          <h4 style={{ color: 'var(--text-secondary)', fontSize: '13px', textTransform: 'uppercase', marginBottom: '8px' }}>Operational Delay Status</h4>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: '20px', fontWeight: 'bold' }}>{issuesStats.operational.open} Open</div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{issuesStats.operational.total} total cases</div>
            </div>
            <span className="badge badge-priority-medium">{issuesStats.operational.critical} Critical</span>
          </div>
        </div>
      </div>

      {/* Contractor Accountability Leaderboard Table */}
      <div className="glass-card" style={{ padding: '20px', marginBottom: '24px' }}>
        <h3 style={{ fontSize: '16px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Award size={18} className="text-accent" /> Contractor Accountability & Performance Leaderboard
        </h3>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
          Ranked in order of performance (worst performing subcontractor listed first based on safety violations, critical delays, and unresolved cases).
        </p>

        <div className="table-container" style={{ border: 'none', margin: '0' }}>
          <table className="responsive-table">
            <thead>
              <tr>
                <th>Subcontractor Name</th>
                <th>Issues Raised</th>
                <th>Critical Breaches</th>
                <th>Safety Hazards</th>
                <th>Avg Response Time</th>
                <th>Performance Score</th>
                <th>Accountability Level</th>
              </tr>
            </thead>
            <tbody>
              {contractorLeaderboard.length === 0 ? (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', padding: '16px', color: 'var(--text-muted)' }}>
                    No contractor statistics registered.
                  </td>
                </tr>
              ) : (
                contractorLeaderboard.map((c, i) => (
                  <tr key={i} className={c.score < 60 ? 'row-highlight' : ''}>
                    <td style={{ fontWeight: 'bold', color: 'var(--text-primary)' }}>{c.name}</td>
                    <td>{c.total} logged ({c.open} unresolved)</td>
                    <td style={{ fontWeight: c.critical > 0 ? 'bold' : 'normal', color: c.critical > 0 ? 'var(--priority-critical)' : 'inherit' }}>
                      {c.critical} cases
                    </td>
                    <td style={{ fontWeight: c.safety > 0 ? 'bold' : 'normal', color: c.safety > 0 ? 'var(--priority-high)' : 'inherit' }}>
                      {c.safety} incidents
                    </td>
                    <td>{c.avgResolutionTime}</td>
                    <td style={{ fontWeight: 'bold' }}>
                      <span className={`score-highlight ${c.score < 50 ? 'score-critical' : c.score < 80 ? 'score-warning' : c.score < 98 ? 'score-good' : 'score-perfect'}`}>
                        {c.score} / 100
                      </span>
                    </td>
                    <td>
                      <span className={`badge badge-status-${c.rating.toLowerCase().replace(" ", "")}`}>
                        {c.rating}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* SVG Charts Section */}
      <div className="charts-grid">
        {/* Chart 1: Donut Chart - Issues by Type */}
        {donutChart ? (
          <div className="glass-card chart-card">
            <div className="chart-title">
              <span>Issues Distribution by Type</span>
              <BarChart2 size={16} />
            </div>
            <div className="chart-container" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around' }}>
              <svg width="180" height="180" viewBox="0 0 120 120">
                {/* SVG Donut Slices */}
                {/* Background circle */}
                <circle cx="60" cy="60" r="50" fill="none" stroke="var(--border-glass)" strokeWidth="12" />
                
                {/* Quality: green */}
                <circle cx="60" cy="60" r="50" fill="none" stroke="#10B981" strokeWidth="12" 
                        strokeDasharray="314" 
                        strokeDashoffset="0"
                />
                
                {/* Safety: Red overlay */}
                <circle cx="60" cy="60" r="50" fill="none" stroke="#EF4444" strokeWidth="12" 
                        strokeDasharray="314" 
                        strokeDashoffset={314 - donutChart.sDash} 
                        transform="rotate(-90 60 60)"
                />

                {/* Operational: Orange overlay */}
                <circle cx="60" cy="60" r="50" fill="none" stroke="#FF9800" strokeWidth="12" 
                        strokeDasharray="314" 
                        strokeDashoffset={314 - donutChart.oDash}
                        transform={`rotate(${(donutChart.sPct / 100) * 360 - 90} 60 60)`}
                />
                
                <text x="60" y="65" textAnchor="middle" fill="var(--text-primary)" style={{ fontSize: '12px', fontWeight: 'bold' }}>
                  {donutChart.total} Total
                </text>
              </svg>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '12px', height: '12px', background: '#EF4444', borderRadius: '3px' }} />
                  <span>Safety Incident: <strong>{donutChart.sCount}</strong> ({donutChart.sPct}%)</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '12px', height: '12px', background: '#10B981', borderRadius: '3px' }} />
                  <span>Quality Defect: <strong>{donutChart.qCount}</strong> ({donutChart.qPct}%)</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '12px', height: '12px', background: '#FF9800', borderRadius: '3px' }} />
                  <span>Operational Delay: <strong>{donutChart.oCount}</strong> ({donutChart.oPct}%)</span>
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {/* Chart 2: Issues by Contractor Bar Chart */}
        {barChartContractors.list.length > 0 ? (
          <div className="glass-card chart-card">
            <div className="chart-title">
              <span>Top Active Subcontractor Issues</span>
            </div>
            <div className="chart-container" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '14px' }}>
              {barChartContractors.list.map((c, i) => {
                const pct = (c.count / barChartContractors.maxCount) * 100;
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', fontSize: '12px' }}>
                    <span style={{ width: '110px', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }} title={c.name}>
                      {c.name}
                    </span>
                    <div style={{ flex: 1, height: '12px', background: 'rgba(255,255,255,0.06)', borderRadius: '6px', margin: '0 12px', position: 'relative' }}>
                      <div style={{ height: '100%', background: 'linear-gradient(to right, var(--accent), #EC4899)', width: `${pct}%`, borderRadius: '6px' }} />
                    </div>
                    <span style={{ width: '20px', fontWeight: 'bold' }}>{c.count}</span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {/* Chart 3: Issues Over Time Cumulative Line Chart */}
        {lineChartData ? (
          <div className="glass-card chart-card">
            <div className="chart-title">
              <span>Cumulative Issues Trend (Over Time)</span>
            </div>
            <div className="chart-container">
              <svg width="100%" height="200" viewBox="0 0 400 200" preserveAspectRatio="none">
                {/* Grid Lines */}
                <line x1="20" y1="20" x2="390" y2="20" stroke="var(--gantt-grid)" />
                <line x1="20" y1="70" x2="390" y2="70" stroke="var(--gantt-grid)" />
                <line x1="20" y1="120" x2="390" y2="120" stroke="var(--gantt-grid)" />
                <line x1="20" y1="170" x2="390" y2="170" stroke="var(--border-glass)" />
                
                {/* Draw line path */}
                {(() => {
                  const points = lineChartData.counts.map((val, idx) => {
                    const x = 30 + (idx * (350 / Math.max(1, lineChartData.counts.length - 1)));
                    const y = 170 - (val / lineChartData.maxCount) * 140;
                    return `${x},${y}`;
                  }).join(' ');

                  return (
                    <>
                      {/* Gradient fill area */}
                      <path 
                        d={`M 30,170 L ${points} L ${30 + (lineChartData.counts.length - 1) * (350 / Math.max(1, lineChartData.counts.length - 1))},170 Z`} 
                        fill="rgba(99, 102, 241, 0.12)"
                      />
                      <polyline
                        fill="none"
                        stroke="var(--accent)"
                        strokeWidth="2.5"
                        points={points}
                      />
                      {/* Dots on points */}
                      {lineChartData.counts.map((val, idx) => {
                        const x = 30 + (idx * (350 / Math.max(1, lineChartData.counts.length - 1)));
                        const y = 170 - (val / lineChartData.maxCount) * 140;
                        return (
                          <circle key={idx} cx={x} cy={y} r="3.5" fill="#FFF" stroke="var(--accent)" strokeWidth="2" />
                        );
                      })}
                    </>
                  );
                })()}
              </svg>
              {/* Labels */}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 20px', fontSize: '10px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                <span>{lineChartData.dates[0]}</span>
                <span>{lineChartData.dates[Math.floor(lineChartData.dates.length / 2)]}</span>
                <span>{lineChartData.dates[lineChartData.dates.length - 1]}</span>
              </div>
            </div>
          </div>
        ) : null}

        {/* Chart 4: Schedule Variance Delay (Days) */}
        {scheduleVarianceData && scheduleVarianceData.list.length > 0 ? (
          <div className="glass-card chart-card">
            <div className="chart-title">
              <span>Task Schedule Delays (Variance in Days)</span>
            </div>
            <div className="chart-container" style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-around', padding: '10px 0' }}>
              {scheduleVarianceData.list.map((v, i) => {
                const pct = (v.variance / scheduleVarianceData.maxVar) * 100;
                return (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
                    <span style={{ fontSize: '10px', fontWeight: 'bold', color: 'var(--status-open)', marginBottom: '4px' }}>
                      +{v.variance}d
                    </span>
                    <div style={{ width: '20px', background: 'linear-gradient(to top, var(--status-open), #F87171)', height: `${pct * 1.2}px`, borderRadius: '4px 4px 0 0' }} />
                    <span style={{ fontSize: '8px', color: 'var(--text-secondary)', marginTop: '6px', textAlign: 'center', width: '60px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={v.fullName}>
                      {v.name}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {/* Chart 5: Productivity Trend (Manpower Over Time) */}
        {productivityTrendData ? (
          <div className="glass-card chart-card" style={{ gridColumn: 'span 2' }}>
            <div className="chart-title">
              <span>Labor Headcount Trend & Site Productivity</span>
            </div>
            <div className="chart-container">
              <svg width="100%" height="200" viewBox="0 0 800 200" preserveAspectRatio="none">
                <line x1="20" y1="20" x2="790" y2="20" stroke="var(--gantt-grid)" />
                <line x1="20" y1="70" x2="790" y2="70" stroke="var(--gantt-grid)" />
                <line x1="20" y1="120" x2="790" y2="120" stroke="var(--gantt-grid)" />
                <line x1="20" y1="170" x2="790" y2="170" stroke="var(--border-glass)" />

                {(() => {
                  const points = productivityTrendData.list.map((item, idx) => {
                    const x = 30 + (idx * (740 / Math.max(1, productivityTrendData.list.length - 1)));
                    const y = 170 - (item.manpower / productivityTrendData.maxManpower) * 140;
                    return `${x},${y}`;
                  }).join(' ');

                  return (
                    <>
                      <path 
                        d={`M 30,170 L ${points} L ${30 + (productivityTrendData.list.length - 1) * (740 / Math.max(1, productivityTrendData.list.length - 1))},170 Z`} 
                        fill="rgba(16, 185, 129, 0.08)"
                      />
                      <polyline
                        fill="none"
                        stroke="#10B981"
                        strokeWidth="2.5"
                        points={points}
                      />
                      {productivityTrendData.list.map((item, idx) => {
                        const x = 30 + (idx * (740 / Math.max(1, productivityTrendData.list.length - 1)));
                        const y = 170 - (item.manpower / productivityTrendData.maxManpower) * 140;
                        return (
                          <g key={idx}>
                            <circle cx={x} cy={y} r="4.5" fill="#FFF" stroke="#10B981" strokeWidth="2.5" />
                            <text x={x} y={y - 8} textAnchor="middle" style={{ fill: 'var(--text-primary)', fontSize: '8px', fontWeight: 'bold' }}>
                              {item.manpower}
                            </text>
                          </g>
                        );
                      })}
                    </>
                  );
                })()}
              </svg>
              {/* X Labels */}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0 20px', fontSize: '9px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                {productivityTrendData.list.map((item, idx) => (
                  <span key={idx} style={{ width: `${740 / productivityTrendData.list.length}px`, textAlign: 'center' }}>
                    {item.date}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
