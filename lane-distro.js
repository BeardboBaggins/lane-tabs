// Lane Distro page — lazy-loaded (HTML fragment fetched on first show).
// Depends on global `db` (Supabase client) and `currentView` / `updateHash`.

let distroLoaded = false;
let distroRows = [];
let distroFragmentMounted = false;

const DISTRO_GROUPS = [
  { key:'basics',   label:'Basics',                            cls:'grp-basic' },
  { key:'geo',      label:'Origin & Destination',              cls:'grp-geo' },
  { key:'ops',      label:'Ops',                               cls:'grp-ops' },
  { key:'expected', label:'Expected',                          cls:'grp-expected' },
  { key:'market',   label:'Market',                            cls:'grp-market' },
  { key:'actual',   label:'Actual (Mar 2026)',                 cls:'grp-actual' },
  { key:'delta',    label:'Exp vs Actual / Market vs Actual',  cls:'grp-delta' },
];
const DISTRO_COLS = [
  ['basics','Active'], ['basics','Last Update'], ['basics','RFQ #'], ['basics','Drop'],
  ['basics','Milk Run'], ['basics','Transit (hr)'], ['basics','Stops'],
  ['basics','Route #s'], ['basics','Dir'],
  ['geo','Origin GSDB'], ['geo','Origin'], ['geo','State'],
  ['geo','Dest GSDB'], ['geo','Act Dest GSDB'], ['geo','Dest'], ['geo','State'], ['geo','Admin'],
  ['ops','Backup'], ['ops','Trailers'], ['ops','Miles'], ['ops','RPM'],
  ['expected','Loads/Wk'], ['expected','Loads/Mo'], ['expected','Ford Rate'], ['expected','Fuel'],
  ['expected','Gross/Load'], ['expected','Gross/Wk'], ['expected','TTT/Load'], ['expected','Net/Load'],
  ['expected','TTT/Mo'], ['expected','Net/Mo (Exp Ct)'], ['expected','Net/Mo (Act Ct)'],
  ['market','Mkt TTT/Load'], ['market','Mkt Net/Load'], ['market','Mkt TTT/Mo'],
  ['market','Mkt Net/Mo (Exp)'], ['market','Mkt Net/Mo (Act)'],
  ['actual','Loads'], ['actual','TTT'], ['actual','Gross Rev'], ['actual','Net Rev'], ['actual','Avg TTT/Load'],
  ['delta','Δ Loads'], ['delta','Δ Gross'], ['delta','Δ Net'], ['delta','Mkt vs Act Net'],
];
const collapsedDistroGroups = new Set();

function fmtCurrency(v) {
  if (v === null || v === undefined) return '—';
  const n = Number(v);
  if (Number.isNaN(n)) return '—';
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
function fmtNum(v, digits = 2) {
  if (v === null || v === undefined) return '—';
  const n = Number(v);
  if (Number.isNaN(n)) return '—';
  return n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}
function fmtInt(v) {
  if (v === null || v === undefined) return '—';
  const n = Number(v);
  if (Number.isNaN(n)) return '—';
  return Math.round(n).toLocaleString('en-US');
}
function signClass(v) {
  if (v === null || v === undefined) return '';
  const n = Number(v);
  if (Number.isNaN(n) || n === 0) return '';
  return n > 0 ? 'pos' : 'neg';
}
function fmtDateISO(v) {
  if (!v) return '—';
  try { return new Date(v + 'T00:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }); }
  catch { return v; }
}

async function ensureDistroMounted() {
  if (distroFragmentMounted) return;
  const mount = document.getElementById('distro-mount');
  if (!mount) return;
  const html = await fetch('lane-distro.html').then(r => r.text());
  mount.innerHTML = html;
  distroFragmentMounted = true;
}

async function loadLaneDistro() {
  const { data, error } = await db.from('ref_lane_distro').select('*').order('sort_order');
  if (error) { console.error(error); return; }
  distroRows = data || [];

  const adminSel = document.getElementById('distro-admin');
  const admins = [...new Set(distroRows.map(r => r.lane_admin).filter(Boolean))].sort();
  adminSel.innerHTML = '<option value="">All</option>' +
    admins.map(a => `<option value="${a}">${a}</option>`).join('');

  renderDistroHeader();
  filterDistro();
  distroLoaded = true;
}

function renderDistroHeader() {
  const thead = document.querySelector('#distro-table thead');
  const groupCounts = Object.fromEntries(DISTRO_GROUPS.map(g => [g.key, 0]));
  DISTRO_COLS.forEach(([g]) => groupCounts[g]++);
  const groupRow = DISTRO_GROUPS.map(g => {
    const c = collapsedDistroGroups.has(g.key);
    const span = c ? 1 : groupCounts[g.key];
    const chev = c ? '▸' : '▾';
    return `<th class="${g.cls} grp-header" data-group="${g.key}" colspan="${span}"
      onclick="toggleDistroGroup('${g.key}')"
      title="${c ? 'Expand' : 'Collapse'} ${g.label.replace(/"/g, '')}"><span class="grp-chev">${chev}</span>${g.label}</th>`;
  }).join('');
  const colRow = DISTRO_COLS.map(([g, h]) => `<th data-group="${g}">${h}</th>`).join('');
  thead.innerHTML = `<tr class="group-row">${groupRow}</tr><tr class="col-row">${colRow}</tr>`;
}

function toggleDistroGroup(key) {
  if (collapsedDistroGroups.has(key)) collapsedDistroGroups.delete(key);
  else collapsedDistroGroups.add(key);
  const table = document.getElementById('distro-table');
  table.classList.toggle('distro-hide-' + key, collapsedDistroGroups.has(key));
  renderDistroHeader();
  updateDistroCollapseAllBtn();
}

function toggleAllDistroGroups() {
  const table = document.getElementById('distro-table');
  const anyExpanded = DISTRO_GROUPS.some(g => !collapsedDistroGroups.has(g.key));
  if (anyExpanded) {
    DISTRO_GROUPS.forEach(g => {
      collapsedDistroGroups.add(g.key);
      table.classList.add('distro-hide-' + g.key);
    });
  } else {
    DISTRO_GROUPS.forEach(g => {
      collapsedDistroGroups.delete(g.key);
      table.classList.remove('distro-hide-' + g.key);
    });
  }
  renderDistroHeader();
  updateDistroCollapseAllBtn();
}

function updateDistroCollapseAllBtn() {
  const btn = document.getElementById('distro-collapse-all-btn');
  if (!btn) return;
  const anyExpanded = DISTRO_GROUPS.some(g => !collapsedDistroGroups.has(g.key));
  btn.textContent = anyExpanded ? 'Hide All' : 'Show All';
}

function filterDistro() {
  const q = document.getElementById('distro-search').value.trim().toLowerCase();
  const admin = document.getElementById('distro-admin').value;
  const active = document.getElementById('distro-active').value;
  const dir = document.getElementById('distro-direction').value;

  const rows = distroRows.filter(r => {
    if (active && r.active !== active) return false;
    if (admin && r.lane_admin !== admin) return false;
    if (dir && r.ib_ob !== dir) return false;
    if (q) {
      const hay = [r.rfq_number, r.route_numbers, r.origin_city, r.origin_state, r.origin_gsdb,
                   r.dest_city, r.dest_state, r.dest_gsdb, r.act_dest_gsdb, r.lane_admin, r.backup_admin]
        .filter(Boolean).join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  renderDistroBody(rows);

  const tot = rows.length;
  document.getElementById('distro-count').textContent = `${tot} row${tot !== 1 ? 's' : ''}`;

  const ibRows = rows.filter(r => r.ib_ob === 'IB');
  const uniqueLanes = new Set(ibRows.map(r => r.rfq_number || r.id)).size;
  const activeLanes = new Set(ibRows.filter(r => r.active === 'Yes').map(r => r.rfq_number || r.id)).size;
  const expRev = ibRows.reduce((s, r) => s + (Number(r.exp_gross_rev_week) || 0) * 4.33, 0);
  const actRev = ibRows.reduce((s, r) => s + (Number(r.act_gross_rev_month) || 0), 0);
  const netDelta = ibRows.reduce((s, r) => s + (Number(r.delta_net_rev) || 0), 0);

  document.getElementById('dh-lanes').textContent = uniqueLanes.toLocaleString();
  document.getElementById('dh-active').textContent = activeLanes.toLocaleString();
  document.getElementById('dh-exp-rev').textContent = fmtCurrency(expRev);
  document.getElementById('dh-act-rev').textContent = fmtCurrency(actRev);
  document.getElementById('dh-net-delta').textContent = fmtCurrency(netDelta);
}

function renderDistroBody(rows) {
  const tbody = document.querySelector('#distro-table tbody');
  let prevRfq = null;
  tbody.innerHTML = rows.map(r => {
    const pairStart = r.rfq_number !== prevRfq;
    prevRfq = r.rfq_number;
    const inactive = r.active === 'No';
    const dirCls = r.ib_ob === 'IB' ? 'dir-ib' : 'dir-ob';
    const td = (grp, content, cls = '') =>
      `<td data-group="${grp}"${cls ? ` class="${cls}"` : ''}>${content}</td>`;
    return `<tr class="${pairStart ? 'pair-start' : ''} ${inactive ? 'inactive-row' : ''}">
      ${td('basics', r.active || '—')}
      ${td('basics', fmtDateISO(r.last_formal_update))}
      ${td('basics', r.rfq_number ? String(r.rfq_number).replace(/-\d+$/, '') : '—', 'rfq')}
      ${td('basics', r.drop_lane || '—')}
      ${td('basics', r.milk_run || '—')}
      ${td('basics', r.transit_hours ?? '—', 'num')}
      ${td('basics', r.stops && r.stops !== 'NA' ? r.stops : '—')}
      ${td('basics', r.route_numbers || '—')}
      ${td('basics', r.ib_ob || '—', dirCls)}
      ${td('geo', r.origin_gsdb || '—')}
      ${td('geo', r.origin_city || '—')}
      ${td('geo', r.origin_state || '—')}
      ${td('geo', r.dest_gsdb || '—')}
      ${td('geo', r.act_dest_gsdb || '—')}
      ${td('geo', r.dest_city || '—')}
      ${td('geo', r.dest_state || '—')}
      ${td('geo', r.lane_admin || '—')}
      ${td('ops', r.backup_admin || '—')}
      ${td('ops', r.trailers_needed || '—')}
      ${td('ops', fmtInt(r.ford_miles), 'num')}
      ${td('ops', fmtNum(r.rpm, 3), 'num')}
      ${td('expected', fmtNum(r.exp_loads_week, 1), 'num')}
      ${td('expected', fmtNum(r.exp_loads_month, 1), 'num')}
      ${td('expected', fmtCurrency(r.exp_ford_rate), 'num')}
      ${td('expected', fmtCurrency(r.exp_fuel), 'num')}
      ${td('expected', fmtCurrency(r.exp_gross_rev_load), 'num')}
      ${td('expected', fmtCurrency(r.exp_gross_rev_week), 'num')}
      ${td('expected', fmtCurrency(r.exp_ttt_load), 'num')}
      ${td('expected', fmtCurrency(r.exp_net_rev_load), 'num ' + signClass(r.exp_net_rev_load))}
      ${td('expected', fmtCurrency(r.exp_ttt_month), 'num')}
      ${td('expected', fmtCurrency(r.exp_net_rev_month_exp), 'num ' + signClass(r.exp_net_rev_month_exp))}
      ${td('expected', fmtCurrency(r.exp_net_rev_month_act), 'num ' + signClass(r.exp_net_rev_month_act))}
      ${td('market', fmtCurrency(r.mkt_ttt_load), 'num')}
      ${td('market', fmtCurrency(r.mkt_net_rev_load), 'num ' + signClass(r.mkt_net_rev_load))}
      ${td('market', fmtCurrency(r.mkt_ttt_month), 'num')}
      ${td('market', fmtCurrency(r.mkt_net_rev_month_exp), 'num ' + signClass(r.mkt_net_rev_month_exp))}
      ${td('market', fmtCurrency(r.mkt_net_rev_month_act), 'num ' + signClass(r.mkt_net_rev_month_act))}
      ${td('actual', fmtInt(r.act_loads_month), 'num')}
      ${td('actual', fmtCurrency(r.act_ttt_month), 'num')}
      ${td('actual', fmtCurrency(r.act_gross_rev_month), 'num')}
      ${td('actual', fmtCurrency(r.act_net_rev_month), 'num ' + signClass(r.act_net_rev_month))}
      ${td('actual', fmtCurrency(r.act_avg_ttt_load), 'num')}
      ${td('delta', fmtNum(r.delta_loads, 1), 'num ' + signClass(r.delta_loads))}
      ${td('delta', fmtCurrency(r.delta_gross_rev), 'num ' + signClass(r.delta_gross_rev))}
      ${td('delta', fmtCurrency(r.delta_net_rev), 'num ' + signClass(r.delta_net_rev))}
      ${td('delta', fmtCurrency(r.mkt_vs_act_net_rev), 'num ' + signClass(r.mkt_vs_act_net_rev))}
    </tr>`;
  }).join('');
}

async function showLaneDistro() {
  await ensureDistroMounted();
  const sb = document.getElementById('sidebar');
  sb.hidden = false;
  sb.classList.add('collapsed');
  const sbToggle = document.getElementById('sidebar-toggle-btn');
  if (sbToggle) { sbToggle.hidden = false; sbToggle.textContent = '›'; sbToggle.title = 'Expand sidebar'; }
  document.getElementById('landing-page').hidden = true;
  document.getElementById('distro-page').hidden = false;
  document.querySelector('.lane-info-card').hidden = true;
  document.getElementById('schedule-card').hidden = true;
  document.getElementById('btn-home')?.classList.remove('active');
  document.getElementById('btn-lanes')?.classList.remove('active');
  document.getElementById('btn-distro')?.classList.add('active');
  document.querySelectorAll('.lane-item.active').forEach(i => i.classList.remove('active'));
  currentView = 'distro';
  updateHash();
  if (!distroLoaded) loadLaneDistro();
}
