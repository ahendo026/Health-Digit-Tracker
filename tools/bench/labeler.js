#!/usr/bin/env node
'use strict';

// Standalone image labeler. Serves images from a local folder and writes a
// ground-truth CSV next to it. Never contacts HealthDigits or shows model output.

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');

// ---------------------------------------------------------------- arguments

function expandHome(p) {
  return p.startsWith('~') ? path.join(os.homedir(), p.slice(1)) : p;
}

const argv = process.argv.slice(2);
let folder = null;
let mode = null;
let outPath = null;
let port = 5055;
let openBrowserEnabled = true;

for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--mode') mode = argv[++i];
  else if (a === '--out') outPath = expandHome(argv[++i]);
  else if (a === '--port') port = Number(argv[++i]);
  else if (a === '--no-open') openBrowserEnabled = false;
  else folder = expandHome(a);
}

folder = folder || (process.env.LABELER_FOLDER && expandHome(process.env.LABELER_FOLDER));
mode = mode || process.env.LABELER_MODE || null;

if (!folder) {
  console.error('usage: node labeler.js <corpus-folder> [--mode smart40|bench] [--out labels.csv] [--port 5055]');
  process.exit(1);
}
folder = path.resolve(folder);
if (!fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) {
  console.error('not a directory: ' + folder);
  process.exit(1);
}

const folderName = path.basename(folder);
if (!mode) mode = /smart40/i.test(folderName) ? 'smart40' : 'bench';
if (mode !== 'smart40' && mode !== 'bench') {
  console.error('--mode must be smart40 or bench');
  process.exit(1);
}

if (!outPath) {
  outPath = path.join(path.dirname(folder), folderName.replace(/-corpus$/, '') + '-labels.csv');
}

const COLUMNS = mode === 'smart40'
  ? ['cycle', 'filename', 'expected_class', 'expected_values', 'expected_behavior', 'notes']
  : ['filename', 'expected_class', 'expected_values', 'source_app_or_device', 'notes'];

const CLASSES = ['blood_pressure_reading', 'glucose_reading', 'weight_reading',
  'meal_event', 'workout_event', 'unknown'];

// ------------------------------------------------------------------- images

const IMAGE_RE = /\.(png|jpe?g)$/i;
const files = fs.readdirSync(folder)
  .filter((f) => IMAGE_RE.test(f) && fs.statSync(path.join(folder, f)).isFile())
  .sort();

// ---------------------------------------------------------------------- csv

function csvEscape(v) {
  const s = v == null ? '' : String(v);
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  let i = 0;
  let started = false;
  const pushField = () => { row.push(field); field = ''; started = false; };
  const pushRow = () => { rows.push(row); row = []; };
  while (i < text.length) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        quoted = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"' && !started) { quoted = true; started = true; i++; continue; }
    if (c === ',') { pushField(); i++; continue; }
    if (c === '\r') { i++; continue; }
    if (c === '\n') { pushField(); pushRow(); i++; continue; }
    field += c; started = true; i++;
  }
  if (field !== '' || row.length) { pushField(); pushRow(); }
  return rows.filter((r) => !(r.length === 1 && r[0] === ''));
}

// rows: array of objects keyed by COLUMNS, kept in file order.
let rows = [];

function loadCsv() {
  rows = [];
  if (!fs.existsSync(outPath)) return;
  const parsed = parseCsv(fs.readFileSync(outPath, 'utf8'));
  if (!parsed.length) return;
  const header = parsed[0];
  for (const r of parsed.slice(1)) {
    const obj = {};
    header.forEach((h, idx) => { obj[h] = r[idx] == null ? '' : r[idx]; });
    if (obj.filename) rows.push(obj);
  }
}

function writeCsv() {
  const lines = [COLUMNS.join(',')];
  for (const r of rows) lines.push(COLUMNS.map((c) => csvEscape(r[c])).join(','));
  fs.writeFileSync(outPath, lines.join('\n') + '\n');
}

loadCsv();

// ------------------------------------------------------------------- server

function send(res, code, type, body) {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(body);
}

function sendJson(res, code, obj) {
  send(res, code, 'application/json', JSON.stringify(obj));
}

const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' };

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (req.method === 'GET' && url.pathname === '/') {
    return send(res, 200, 'text/html; charset=utf-8', HTML);
  }

  if (req.method === 'GET' && url.pathname === '/api/state') {
    const labeled = {};
    for (const r of rows) labeled[r.filename] = r;
    return sendJson(res, 200, {
      mode, folder, outPath, files, labeled,
      total: files.length,
      labeledCount: files.filter((f) => labeled[f]).length,
      rowCount: rows.length,
    });
  }

  if (req.method === 'GET' && url.pathname.startsWith('/img/')) {
    const name = decodeURIComponent(url.pathname.slice('/img/'.length));
    if (!files.includes(name)) return send(res, 404, 'text/plain', 'not found');
    const full = path.join(folder, name);
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(name).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    return fs.createReadStream(full).pipe(res);
  }

  if (req.method === 'POST' && url.pathname === '/api/save') {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      let payload;
      try { payload = JSON.parse(body); } catch (e) { return sendJson(res, 400, { error: 'bad json' }); }
      const filename = payload.filename;
      if (!files.includes(filename)) return sendJson(res, 400, { error: 'unknown file' });
      if (!CLASSES.includes(payload.expected_class)) return sendJson(res, 400, { error: 'bad class' });

      const row = { filename, expected_class: payload.expected_class };
      row.expected_values = JSON.stringify(payload.values || {});
      row.notes = payload.notes || '';
      if (mode === 'smart40') {
        row.cycle = payload.cycle == null ? '' : String(payload.cycle);
        row.expected_behavior = payload.expected_behavior || '';
      } else {
        row.source_app_or_device = payload.source_app_or_device || '';
      }

      const existing = rows.findIndex((r) => r.filename === filename);
      if (existing >= 0) rows[existing] = row; else rows.push(row);
      writeCsv();

      return sendJson(res, 200, { ok: true, rowCount: rows.length });
    });
    return;
  }

  send(res, 404, 'text/plain', 'not found');
});

// --------------------------------------------------------------------- html

const HTML = `<!doctype html>
<meta charset="utf-8">
<title>labeler</title>
<style>
  body { margin:0; font:14px system-ui, sans-serif; display:flex; height:100vh; }
  #left { flex:1; overflow:auto; background:#222; padding:8px; }
  #left img { display:block; }
  #left.fit img { max-width:100%; max-height:calc(100vh - 16px); }
  #zoom { position:fixed; left:14px; bottom:14px; z-index:10; padding:6px 11px;
    font:inherit; cursor:pointer; background:rgba(255,255,255,.92); border:1px solid #666; }
  #right { width:360px; padding:16px; overflow:auto; border-left:1px solid #ccc; }
  h2 { font-size:15px; margin:0 0 4px; word-break:break-all; }
  #progress { color:#555; margin-bottom:12px; }
  .classes button { display:block; width:100%; text-align:left; margin:3px 0; padding:7px;
    border:1px solid #bbb; background:#f5f5f5; cursor:pointer; font:inherit; }
  .classes button.sel { background:#2d6cdf; color:#fff; border-color:#2d6cdf; }
  label { display:block; margin:8px 0 2px; color:#333; }
  input { width:100%; padding:5px; font:inherit; box-sizing:border-box; }
  .actions { margin-top:16px; display:flex; gap:8px; }
  .actions button { padding:8px 14px; font:inherit; cursor:pointer; }
  #save { background:#2d6cdf; color:#fff; border:none; }
  #done { padding:40px; font-size:18px; }
  .hint { color:#777; font-size:12px; margin-top:10px; }
</style>
<div id="left"></div>
<div id="right"></div>
<button type="button" id="zoom"></button>
<script>
const FIELDS = {
  blood_pressure_reading: [['systolic','number',''],['diastolic','number','']],
  glucose_reading: [['value','number',''],['unit','text','mg/dL']],
  weight_reading: [['value','number',''],['unit','text','lb or kg']],
  meal_event: [['calories','number',''],['protein','number',''],['carbs','number',''],['fat','number','']],
  workout_event: [['duration','text',''],['distance','text',''],['calories','number',''],['avg_hr','number',''],['max_hr','number','']],
  unknown: []
};
const CLASSES = Object.keys(FIELDS);

let S = null;           // server state
let queue = [];         // filenames still to visit
let past = [];          // visited filenames (back stack)
let current = null;
let selClass = null;
let lastSource = '';    // bench: remembered source_app_or_device
let fitMode = localStorage.getItem('fit') !== '0';   // sticky; fit is the default

function applyFit() {
  document.getElementById('left').classList.toggle('fit', fitMode);
  const b = document.getElementById('zoom');
  b.textContent = fitMode ? 'Actual size' : 'Fit to window';
  b.style.display = current ? '' : 'none';
}

document.getElementById('zoom').onclick = () => {
  fitMode = !fitMode;
  localStorage.setItem('fit', fitMode ? '1' : '0');
  applyFit();
};

async function init() {
  S = await (await fetch('/api/state')).json();
  document.title = 'labeler — ' + S.mode;
  // Already-labeled files go onto the back stack so Back works in a resumed session.
  past = S.files.filter(f => S.labeled[f]);
  queue = S.files.filter(f => !S.labeled[f]);
  current = queue.shift() || null;
  render();
}

function labeledCount() { return S.files.filter(f => S.labeled[f]).length; }

function render() {
  const left = document.getElementById('left');
  const right = document.getElementById('right');
  if (!current) {
    left.innerHTML = '';
    right.innerHTML = '<div id="done">Done — ' + S.rowCount +
      ' rows in ' + esc(S.outPath) + '</div>' +
      '<div class="actions"><button type="button" id="back"' +
      (past.length ? '' : ' disabled') + '>Back</button></div>';
    document.getElementById('back').onclick = back;
    applyFit();
    return;
  }
  left.innerHTML = '<img src="/img/' + encodeURIComponent(current) + '">';
  applyFit();

  const saved = S.labeled[current];
  selClass = saved ? saved.expected_class : null;
  let vals = {};
  if (saved) { try { vals = JSON.parse(saved.expected_values || '{}'); } catch (e) { vals = {}; } }

  let h = '<h2>' + esc(current) + '</h2>';
  h += '<div id="progress">' + labeledCount() + ' of ' + S.total + ' labeled</div>';
  h += '<div class="classes">';
  for (const c of CLASSES) {
    h += '<button type="button" data-class="' + c + '"' +
         (c === selClass ? ' class="sel"' : '') + '>' + c + '</button>';
  }
  h += '</div><form id="f"><div id="vals"></div>';
  if (S.mode === 'smart40') {
    h += '<label>cycle</label><input name="cycle" type="number" value="' +
         esc(saved ? saved.cycle : '') + '">';
    h += '<label>expected_behavior</label><input name="expected_behavior" value="' +
         esc(saved ? saved.expected_behavior : '') + '">';
  } else {
    const src = saved ? saved.source_app_or_device : lastSource;
    h += '<label>source_app_or_device</label><input name="source_app_or_device" value="' +
         esc(src) + '">';
  }
  h += '<label>notes</label><input name="notes" value="' + esc(saved ? saved.notes : '') + '">';
  h += '<div class="actions"><button id="save" type="submit">Save</button>' +
       '<button type="button" id="skip">Skip</button>' +
       '<button type="button" id="back"' + (past.length ? '' : ' disabled') + '>Back</button></div>';
  h += '<div class="hint">Enter saves. Skipped images come back at the end.</div>';
  h += '</form>';
  right.innerHTML = h;

  right.querySelectorAll('.classes button').forEach(b => {
    b.onclick = () => {
      selClass = b.dataset.class;
      right.querySelectorAll('.classes button').forEach(x => x.classList.toggle('sel', x === b));
      renderVals(vals);
    };
  });
  document.getElementById('skip').onclick = skip;
  document.getElementById('back').onclick = back;
  document.getElementById('f').onsubmit = (e) => { e.preventDefault(); save(); };
  renderVals(vals);
}

function renderVals(vals) {
  const box = document.getElementById('vals');
  if (!selClass) { box.innerHTML = ''; return; }
  let h = '';
  for (const [name, type, ph] of FIELDS[selClass]) {
    const v = vals[name] == null ? '' : vals[name];
    h += '<label>' + name + '</label><input data-val="' + name + '" type="' + type +
         '" placeholder="' + esc(ph) + '" value="' + esc(v) + '">';
  }
  box.innerHTML = h;
  const first = box.querySelector('input');
  if (first) first.focus();
}

async function save() {
  if (!selClass) { alert('pick a class'); return; }
  const f = document.getElementById('f');
  const values = {};
  f.querySelectorAll('[data-val]').forEach(inp => {
    const raw = inp.value.trim();
    if (raw === '') return;                       // absent fields are omitted entirely
    values[inp.dataset.val] = inp.type === 'number' ? Number(raw) : raw;
  });
  const payload = {
    filename: current,
    expected_class: selClass,
    values,
    notes: f.notes.value,
  };
  if (S.mode === 'smart40') {
    payload.cycle = f.cycle.value;
    payload.expected_behavior = f.expected_behavior.value;
  } else {
    payload.source_app_or_device = f.source_app_or_device.value;
    lastSource = payload.source_app_or_device;
  }
  const r = await fetch('/api/save', {
    method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload)
  });
  const j = await r.json();
  if (!r.ok) { alert('save failed: ' + (j.error || r.status)); return; }
  S = await (await fetch('/api/state')).json();
  advance();
}

function advance() {
  past.push(current);
  current = queue.shift() || null;
  render();
}

function skip() {
  if (queue.length === 0) { render(); return; }   // nothing to swap with
  queue.push(current);
  past.push(current);
  current = queue.shift();
  render();
}

function back() {
  if (!past.length) return;
  if (current) queue.unshift(current);
  // drop any trailing repeats of the same file left by skip()
  let prev = past.pop();
  while (prev === current && past.length) prev = past.pop();
  current = prev;
  const i = queue.indexOf(current);
  if (i >= 0) queue.splice(i, 1);
  render();
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

init();
</script>
`;

// --------------------------------------------------------------------- boot

server.listen(port, '127.0.0.1', () => {
  const url = 'http://localhost:' + port + '/';
  console.log('labeler  mode=' + mode);
  console.log('  folder: ' + folder + '  (' + files.length + ' images)');
  console.log('  output: ' + outPath + '  (' + rows.length + ' existing rows)');
  console.log('  open:   ' + url);
  if (openBrowserEnabled) openBrowser(url);
});

function openBrowser(url) {
  for (const cmd of ['wslview', 'xdg-open', 'explorer.exe']) {
    try {
      execFile(cmd, [url], () => {});
      return;
    } catch (e) { /* try next */ }
  }
}
