export function getWebviewContent(): string {
    return /* html */`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>CSV Editor</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: var(--vscode-font-family); font-size: 13px; color: var(--vscode-foreground); background: var(--vscode-editor-background); height: 100vh; display: flex; flex-direction: column; }

  #toolbar { padding: 6px 10px; background: var(--vscode-editorGroupHeader-tabsBackground); border-bottom: 1px solid var(--vscode-panel-border); display: flex; gap: 8px; align-items: center; flex-shrink: 0; }
  #toolbar button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 4px 10px; cursor: pointer; border-radius: 2px; font-size: 12px; }
  #toolbar button:hover { background: var(--vscode-button-hoverBackground); }
  #status { margin-left: auto; font-size: 11px; color: var(--vscode-descriptionForeground); }

  #table-container { flex: 1; overflow: auto; }
  table { border-collapse: collapse; width: max-content; min-width: 100%; }
  th { background: var(--vscode-editorGroupHeader-tabsBackground); position: sticky; top: 0; z-index: 1; padding: 5px 10px; text-align: left; border-bottom: 2px solid var(--vscode-panel-border); border-right: 1px solid var(--vscode-panel-border); white-space: nowrap; }
  td { padding: 4px 10px; border-bottom: 1px solid var(--vscode-panel-border); border-right: 1px solid var(--vscode-panel-border); max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; vertical-align: top; cursor: pointer; }
  td:hover { background: var(--vscode-list-hoverBackground); }
  tr.selected td { background: var(--vscode-list-activeSelectionBackground); color: var(--vscode-list-activeSelectionForeground); }
  .json-badge { background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); border-radius: 3px; padding: 1px 5px; font-size: 10px; cursor: pointer; }
  .cell-preview { max-width: 280px; overflow: hidden; text-overflow: ellipsis; display: inline-block; vertical-align: middle; }

  #modal-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 100; justify-content: center; align-items: center; }
  #modal-overlay.open { display: flex; }
  #modal { background: var(--vscode-editor-background); border: 1px solid var(--vscode-panel-border); border-radius: 4px; width: 80vw; max-width: 900px; height: 70vh; display: flex; flex-direction: column; }
  #modal-header { padding: 10px 14px; border-bottom: 1px solid var(--vscode-panel-border); display: flex; justify-content: space-between; align-items: center; }
  #modal-title { font-weight: bold; font-size: 12px; color: var(--vscode-descriptionForeground); }
  #modal-close { background: none; border: none; color: var(--vscode-foreground); cursor: pointer; font-size: 16px; padding: 0 4px; }
  #modal-textarea { flex: 1; width: 100%; border: none; outline: none; resize: none; background: var(--vscode-editor-background); color: var(--vscode-editor-foreground); font-family: var(--vscode-editor-font-family, monospace); font-size: 12px; padding: 12px; }
  #modal-footer { padding: 8px 14px; border-top: 1px solid var(--vscode-panel-border); display: flex; gap: 8px; justify-content: flex-end; }
  #modal-footer button { padding: 4px 14px; border: none; cursor: pointer; border-radius: 2px; font-size: 12px; }
  #btn-save-cell { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
  #btn-cancel { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
  #modal-error { color: var(--vscode-errorForeground); font-size: 11px; display: none; padding: 4px 14px; }

  #loading { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; background: var(--vscode-editor-background); font-size: 14px; }
</style>
</head>
<body>

<div id="loading">Loading CSV...</div>

<div id="toolbar" style="display:none">
  <button id="btn-save">Save</button>
  <span id="status"></span>
</div>
<div id="table-container" style="display:none">
  <table id="csv-table"><thead></thead><tbody></tbody></table>
</div>

<div id="modal-overlay">
  <div id="modal">
    <div id="modal-header">
      <span id="modal-title"></span>
      <button id="modal-close">✕</button>
    </div>
    <textarea id="modal-textarea" spellcheck="false"></textarea>
    <div id="modal-error"></div>
    <div id="modal-footer">
      <button id="btn-cancel">Cancel</button>
      <button id="btn-save-cell">Save Cell</button>
    </div>
  </div>
</div>

<script>
const vscode = acquireVsCodeApi();
let rows = [];      // string[][]
let headers = [];   // string[]
let editingCell = { row: -1, col: -1 };

// ── CSV parser (handles quoted fields with newlines) ──────────────────────────
function parseCsv(text) {
    const results = [];
    let row = [], field = '', inQuote = false, i = 0;
    while (i < text.length) {
        const ch = text[i];
        if (inQuote) {
            if (ch === '"') {
                if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
                inQuote = false;
            } else {
                field += ch;
            }
        } else {
            if (ch === '"') { inQuote = true; }
            else if (ch === ',') { row.push(field); field = ''; }
            else if (ch === '\\r' && text[i + 1] === '\\n') { row.push(field); results.push(row); row = []; field = ''; i++; }
            else if (ch === '\\n') { row.push(field); results.push(row); row = []; field = ''; }
            else { field += ch; }
        }
        i++;
    }
    if (field || row.length) { row.push(field); results.push(row); }
    return results.filter(r => r.some(c => c.trim()));
}

function stringifyCsv(data) {
    return data.map(row =>
        row.map(cell => {
            if (cell.includes(',') || cell.includes('"') || cell.includes('\\n') || cell.includes('\\r')) {
                return '"' + cell.replace(/"/g, '""') + '"';
            }
            return cell;
        }).join(',')
    ).join('\\n');
}

function looksLikeJson(s) {
    const t = s.trim();
    return (t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'));
}

// ── Render ────────────────────────────────────────────────────────────────────
function renderTable() {
    const thead = document.querySelector('#csv-table thead');
    const tbody = document.querySelector('#csv-table tbody');
    thead.innerHTML = '';
    tbody.innerHTML = '';

    const hrow = document.createElement('tr');
    hrow.appendChild(Object.assign(document.createElement('th'), { textContent: '#' }));
    headers.forEach(h => {
        hrow.appendChild(Object.assign(document.createElement('th'), { textContent: h }));
    });
    thead.appendChild(hrow);

    rows.forEach((row, ri) => {
        const tr = document.createElement('tr');
        tr.appendChild(Object.assign(document.createElement('td'), { textContent: ri + 1 }));
        row.forEach((cell, ci) => {
            const td = document.createElement('td');
            if (looksLikeJson(cell)) {
                const badge = document.createElement('span');
                badge.className = 'json-badge';
                badge.textContent = 'JSON';
                badge.onclick = (e) => { e.stopPropagation(); openModal(ri, ci); };
                td.appendChild(badge);
            } else {
                const span = document.createElement('span');
                span.className = 'cell-preview';
                span.textContent = cell;
                td.appendChild(span);
                td.ondblclick = () => openModal(ri, ci);
            }
            tr.appendChild(td);
        });
        tbody.appendChild(tr);
    });

    document.getElementById('status').textContent = rows.length + ' rows, ' + headers.length + ' columns';
}

// ── Modal ─────────────────────────────────────────────────────────────────────
function openModal(ri, ci) {
    editingCell = { row: ri, col: ci };
    const raw = rows[ri][ci];
    let display = raw;
    if (looksLikeJson(raw)) {
        try { display = JSON.stringify(JSON.parse(raw), null, 2); } catch {}
    }
    document.getElementById('modal-title').textContent = headers[ci] + '  (row ' + (ri + 1) + ')';
    document.getElementById('modal-textarea').value = display;
    document.getElementById('modal-error').style.display = 'none';
    document.getElementById('modal-overlay').classList.add('open');
    document.getElementById('modal-textarea').focus();
}

function closeModal() {
    document.getElementById('modal-overlay').classList.remove('open');
}

document.getElementById('modal-close').onclick = closeModal;
document.getElementById('btn-cancel').onclick = closeModal;
document.getElementById('modal-overlay').onclick = (e) => { if (e.target === document.getElementById('modal-overlay')) closeModal(); };

document.getElementById('btn-save-cell').onclick = () => {
    const { row, col } = editingCell;
    let value = document.getElementById('modal-textarea').value;
    const errEl = document.getElementById('modal-error');

    if (looksLikeJson(rows[row][col])) {
        try {
            value = JSON.stringify(JSON.parse(value));
        } catch (e) {
            errEl.textContent = 'Invalid JSON: ' + e.message;
            errEl.style.display = 'block';
            return;
        }
    }

    rows[row][col] = value;
    renderTable();
    closeModal();
};

// ── Save ──────────────────────────────────────────────────────────────────────
document.getElementById('btn-save').onclick = () => {
    const allData = [headers, ...rows];
    vscode.postMessage({ type: 'save', text: stringifyCsv(allData) });
};

// ── Message from extension ────────────────────────────────────────────────────
window.addEventListener('message', ({ data }) => {
    if (data.type !== 'load') return;
    const parsed = parseCsv(data.text);
    if (parsed.length === 0) return;
    headers = parsed[0];
    rows = parsed.slice(1);
    document.getElementById('loading').style.display = 'none';
    document.getElementById('toolbar').style.display = 'flex';
    document.getElementById('table-container').style.display = 'block';
    renderTable();
});
</script>
</body>
</html>`;
}
