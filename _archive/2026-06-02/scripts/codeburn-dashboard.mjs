#!/usr/bin/env node
import { execSync } from 'child_process';
import { writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const period = process.argv[2] || 'week';
const validPeriods = ['today', 'week', '30days', 'month', 'all'];
if (!validPeriods.includes(period)) {
  console.error(`Invalid period. Use: ${validPeriods.join(', ')}`);
  process.exit(1);
}

let data;
try {
  const out = execSync(`codeburn report --period ${period} --format json`, { encoding: 'utf8' });
  data = JSON.parse(out);
} catch (e) {
  console.error('Failed to run codeburn:', e.message);
  process.exit(1);
}

const html = buildHTML(data, period);
const outPath = join(tmpdir(), `codeburn-dashboard-${Date.now()}.html`);
writeFileSync(outPath, html);

try {
  if (process.platform === 'win32') execSync(`start "" "${outPath}"`);
  else if (process.platform === 'darwin') execSync(`open "${outPath}"`);
  else execSync(`xdg-open "${outPath}"`);
  console.log(`Dashboard opened: ${outPath}`);
} catch {
  console.log(`Open manually: ${outPath}`);
}

function fmt(n) {
  return n >= 1000 ? (n / 1000).toFixed(1) + 'K' : String(Math.round(n));
}
function fmtCost(n) {
  return '$' + Number(n).toFixed(2);
}

function buildHTML(d, period) {
  const periodLabels = { today: 'Today', week: '7 Days', '30days': '30 Days', month: 'This Month', all: 'All Time' };

  const dailyDates = (d.daily || []).map(r => r.date);
  const dailyCosts = (d.daily || []).map(r => r.cost);
  const dailyCalls = (d.daily || []).map(r => r.calls);

  const projectNames = (d.projects || []).map(p => p.name.replace(/^c--Users-Buur-Documents-Workflows-/, '').replace(/^C--Users-Buur-/, '~\\'));
  const projectCosts = (d.projects || []).map(p => p.cost);

  const activityNames = (d.activities || []).map(a => a.category);
  const activityCosts = (d.activities || []).map(a => a.cost);

  const modelNames = (d.models || []).filter(m => m.name !== '<synthetic>').map(m => m.name);
  const modelCosts = (d.models || []).filter(m => m.name !== '<synthetic>').map(m => m.cost);

  const topTools = (d.tools || []).slice(0, 8);
  const shellCmds = (d.shellCommands || []).slice(0, 8);

  const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#14b8a6'];

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>CodeBurn — ${periodLabels[period]}</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.3/dist/chart.umd.min.js"></script>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #0f0f13; color: #e2e8f0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 14px; min-height: 100vh; }
  .header { padding: 24px 32px 16px; border-bottom: 1px solid #1e1e2e; display: flex; align-items: center; gap: 16px; }
  .header h1 { font-size: 20px; font-weight: 700; color: #a5b4fc; letter-spacing: -0.5px; }
  .header .period { background: #1e1e2e; border: 1px solid #2d2d3d; border-radius: 6px; padding: 4px 12px; font-size: 12px; color: #94a3b8; }
  .header .generated { margin-left: auto; font-size: 11px; color: #475569; }
  .grid { display: grid; gap: 16px; padding: 24px 32px; }
  .stat-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
  .stat { background: #13131a; border: 1px solid #1e1e2e; border-radius: 12px; padding: 20px; }
  .stat .label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #64748b; margin-bottom: 8px; }
  .stat .value { font-size: 28px; font-weight: 700; color: #f1f5f9; }
  .stat .sub { font-size: 12px; color: #475569; margin-top: 4px; }
  .charts-row { display: grid; grid-template-columns: 2fr 1fr; gap: 16px; }
  .card { background: #13131a; border: 1px solid #1e1e2e; border-radius: 12px; padding: 20px; }
  .card h2 { font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: #64748b; margin-bottom: 16px; }
  .charts-row2 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; }
  .bottom-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .list-item { display: flex; align-items: center; gap: 10px; padding: 6px 0; border-bottom: 1px solid #1a1a24; }
  .list-item:last-child { border-bottom: none; }
  .list-item .name { flex: 1; color: #cbd5e1; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .list-item .bar-wrap { flex: 0 0 80px; background: #1e1e2e; border-radius: 4px; height: 6px; overflow: hidden; }
  .list-item .bar { height: 100%; border-radius: 4px; background: #6366f1; }
  .list-item .val { flex: 0 0 48px; text-align: right; font-size: 12px; color: #94a3b8; }
  .sessions { }
  .session { background: #0d0d14; border: 1px solid #1e1e2e; border-radius: 8px; padding: 12px 16px; margin-bottom: 8px; display: flex; align-items: center; gap: 12px; }
  .session:last-child { margin-bottom: 0; }
  .session .proj { font-size: 12px; color: #a5b4fc; flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .session .date { font-size: 11px; color: #475569; }
  .session .cost { font-weight: 700; color: #f1f5f9; font-size: 14px; }
  .session .calls { font-size: 11px; color: #64748b; }
  canvas { max-height: 220px; }
</style>
</head>
<body>
<div class="header">
  <h1>⚡ CodeBurn</h1>
  <span class="period">${periodLabels[period]}</span>
  <span class="generated">Generated ${new Date(d.generated).toLocaleString()}</span>
</div>
<div class="grid">

  <div class="stat-row">
    <div class="stat">
      <div class="label">Total Cost</div>
      <div class="value">${fmtCost(d.overview.cost)}</div>
      <div class="sub">${d.overview.sessions} sessions</div>
    </div>
    <div class="stat">
      <div class="label">API Calls</div>
      <div class="value">${fmt(d.overview.calls)}</div>
      <div class="sub">${(d.overview.calls / d.overview.sessions).toFixed(1)} avg/session</div>
    </div>
    <div class="stat">
      <div class="label">Cache Hit</div>
      <div class="value">${d.overview.cacheHitPercent}%</div>
      <div class="sub">${fmt(d.overview.tokens.cacheRead)} tokens read</div>
    </div>
    <div class="stat">
      <div class="label">Output Tokens</div>
      <div class="value">${fmt(d.overview.tokens.output)}</div>
      <div class="sub">${fmt(d.overview.tokens.cacheWrite)} cache written</div>
    </div>
  </div>

  <div class="charts-row">
    <div class="card">
      <h2>Daily Cost</h2>
      <canvas id="dailyChart"></canvas>
    </div>
    <div class="card">
      <h2>By Project</h2>
      <canvas id="projectChart"></canvas>
    </div>
  </div>

  <div class="charts-row2">
    <div class="card">
      <h2>By Activity</h2>
      ${renderList(activityNames, activityCosts, COLORS[0])}
    </div>
    <div class="card">
      <h2>Top Tools</h2>
      ${renderList(topTools.map(t => t.name), topTools.map(t => t.calls), COLORS[2], false)}
    </div>
    <div class="card">
      <h2>Shell Commands</h2>
      ${renderList(shellCmds.map(t => t.name), shellCmds.map(t => t.calls), COLORS[4], false)}
    </div>
  </div>

  <div class="bottom-row">
    <div class="card">
      <h2>Top Sessions</h2>
      <div class="sessions">
        ${(d.topSessions || []).map(s => `
          <div class="session">
            <div class="proj">${s.project.replace(/^c--Users-Buur-Documents-Workflows-/, '')}</div>
            <div class="date">${s.date}</div>
            <div class="calls">${s.calls} calls</div>
            <div class="cost">${fmtCost(s.cost)}</div>
          </div>`).join('')}
      </div>
    </div>
    <div class="card">
      <h2>By Model</h2>
      <canvas id="modelChart"></canvas>
    </div>
  </div>

</div>

<script>
const COLORS = ${JSON.stringify(COLORS)};
Chart.defaults.color = '#64748b';
Chart.defaults.borderColor = '#1e1e2e';

new Chart(document.getElementById('dailyChart'), {
  type: 'bar',
  data: {
    labels: ${JSON.stringify(dailyDates)},
    datasets: [
      {
        label: 'Cost ($)',
        data: ${JSON.stringify(dailyCosts)},
        backgroundColor: '#6366f180',
        borderColor: '#6366f1',
        borderWidth: 1,
        borderRadius: 4,
        yAxisID: 'y',
      }
    ]
  },
  options: {
    responsive: true,
    plugins: { legend: { display: false } },
    scales: {
      y: { ticks: { callback: v => '$' + v.toFixed(0) }, grid: { color: '#1a1a24' } },
      x: { grid: { display: false } }
    }
  }
});

new Chart(document.getElementById('projectChart'), {
  type: 'doughnut',
  data: {
    labels: ${JSON.stringify(projectNames)},
    datasets: [{ data: ${JSON.stringify(projectCosts)}, backgroundColor: COLORS, borderWidth: 0 }]
  },
  options: {
    responsive: true,
    plugins: {
      legend: { position: 'bottom', labels: { font: { size: 11 }, padding: 8, boxWidth: 10 } },
      tooltip: { callbacks: { label: ctx => ' $' + ctx.parsed.toFixed(2) } }
    }
  }
});

new Chart(document.getElementById('modelChart'), {
  type: 'doughnut',
  data: {
    labels: ${JSON.stringify(modelNames)},
    datasets: [{ data: ${JSON.stringify(modelCosts)}, backgroundColor: COLORS.slice(2), borderWidth: 0 }]
  },
  options: {
    responsive: true,
    plugins: {
      legend: { position: 'bottom', labels: { font: { size: 11 }, padding: 8, boxWidth: 10 } },
      tooltip: { callbacks: { label: ctx => ' $' + ctx.parsed.toFixed(2) } }
    }
  }
});
</script>
</body>
</html>`;
}

function renderList(names, values, color, isCost = true) {
  const max = Math.max(...values);
  return names.map((name, i) => {
    const pct = max > 0 ? (values[i] / max) * 100 : 0;
    const display = isCost ? fmtCost(values[i]) : fmt(values[i]);
    return `<div class="list-item">
      <div class="name">${name}</div>
      <div class="bar-wrap"><div class="bar" style="width:${pct.toFixed(1)}%;background:${color}"></div></div>
      <div class="val">${display}</div>
    </div>`;
  }).join('');
}
