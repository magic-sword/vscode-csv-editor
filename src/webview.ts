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
  #status { font-size: 11px; color: var(--vscode-descriptionForeground); }

  #table-container { flex: 1; overflow: auto; }
  table { border-collapse: collapse; width: max-content; min-width: 100%; }
  th { background: var(--vscode-editorGroupHeader-tabsBackground); position: sticky; top: 0; z-index: 1; padding: 5px 10px; text-align: left; border-bottom: 2px solid var(--vscode-panel-border); border-right: 1px solid var(--vscode-panel-border); white-space: nowrap; }
  td { padding: 4px 10px; border-bottom: 1px solid var(--vscode-panel-border); border-right: 1px solid var(--vscode-panel-border); max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; vertical-align: top; cursor: pointer; }
  td:hover { background: var(--vscode-list-hoverBackground); }
  tr.selected td { background: var(--vscode-list-activeSelectionBackground); color: var(--vscode-list-activeSelectionForeground); }
  .json-badge { background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); border-radius: 3px; padding: 1px 5px; font-size: 10px; cursor: pointer; }
  .cell-preview { max-width: 280px; overflow: hidden; text-overflow: ellipsis; display: inline-block; vertical-align: middle; }

  #load-more-row td { text-align: center; padding: 10px; }
  #btn-load-more { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); border: none; border-radius: 2px; padding: 5px 16px; cursor: pointer; font-size: 12px; }
  #btn-load-more:disabled { opacity: 0.5; cursor: default; }

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
  <span id="status"></span>
</div>
<div id="table-container" style="display:none">
  <table id="csv-table">
    <thead></thead>
    <tbody></tbody>
    <tfoot>
      <tr id="load-more-row" style="display:none">
        <td id="load-more-cell">
          <button id="btn-load-more">さらに読み込む</button>
        </td>
      </tr>
    </tfoot>
  </table>
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

// rows[r][c] = { v: string, lazy: boolean, json: boolean }
let rows = [];
let headers = [];
let totalRows = 0;
let loadedCount = 0;
let hasMore = false;
let editingCell = { row: -1, col: -1 };
const cellCache = new Map(); // "row,col" -> full content string

function looksLikeJson(s) {
    const t = s.trim();
    return (t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'));
}

// ── Render ────────────────────────────────────────────────────────────────────
function buildHeaderRow() {
    const thead = document.querySelector('#csv-table thead');
    thead.innerHTML = '';
    const hrow = document.createElement('tr');
    hrow.appendChild(Object.assign(document.createElement('th'), { textContent: '#' }));
    headers.forEach(h => {
        hrow.appendChild(Object.assign(document.createElement('th'), { textContent: h }));
    });
    thead.appendChild(hrow);
}

function makeDataRow(rowData, rowIndex) {
    const tr = document.createElement('tr');
    tr.appendChild(Object.assign(document.createElement('td'), { textContent: rowIndex + 1 }));
    rowData.forEach((cell, ci) => {
        const td = document.createElement('td');
        if (cell.json) {
            const badge = document.createElement('span');
            badge.className = 'json-badge';
            badge.textContent = 'JSON';
            badge.onclick = (e) => { e.stopPropagation(); openModal(rowIndex, ci); };
            td.appendChild(badge);
        } else {
            const span = document.createElement('span');
            span.className = 'cell-preview';
            span.textContent = cell.v;
            td.appendChild(span);
            td.ondblclick = () => openModal(rowIndex, ci);
        }
        tr.appendChild(td);
    });
    return tr;
}

function appendRowsToTable(newRows, startIndex) {
    const tbody = document.querySelector('#csv-table tbody');
    const frag = document.createDocumentFragment();
    newRows.forEach((rowData, i) => {
        frag.appendChild(makeDataRow(rowData, startIndex + i));
    });
    tbody.appendChild(frag);
}

function updateStatus() {
    const shown = hasMore ? loadedCount + ' / ' + totalRows : totalRows.toString();
    document.getElementById('status').textContent = shown + ' rows, ' + headers.length + ' columns';
}

function updateLoadMoreButton() {
    const row = document.getElementById('load-more-row');
    const btn = document.getElementById('btn-load-more');
    if (hasMore) {
        row.style.display = '';
        // colspan = headers + row-number column
        document.getElementById('load-more-cell').colSpan = headers.length + 1;
        btn.disabled = false;
        btn.textContent = 'さらに読み込む (' + loadedCount + ' / ' + totalRows + ')';
    } else {
        row.style.display = 'none';
    }
}

// ── Modal ─────────────────────────────────────────────────────────────────────
function openModal(ri, ci) {
    editingCell = { row: ri, col: ci };
    const cell = rows[ri][ci];
    const key = ri + ',' + ci;

    document.getElementById('modal-title').textContent = headers[ci] + '  (row ' + (ri + 1) + ')';
    document.getElementById('modal-error').style.display = 'none';
    document.getElementById('modal-overlay').classList.add('open');

    if (cell.lazy && !cellCache.has(key)) {
        const ta = document.getElementById('modal-textarea');
        ta.value = 'Loading...';
        ta.disabled = true;
        document.getElementById('btn-save-cell').disabled = true;
        vscode.postMessage({ type: 'getCellContent', row: ri, col: ci });
    } else {
        showModalContent(cell.lazy ? cellCache.get(key) : cell.v);
    }
}

function showModalContent(raw) {
    let display = raw;
    if (looksLikeJson(raw)) {
        try { display = JSON.stringify(JSON.parse(raw), null, 2); } catch {}
    }
    const ta = document.getElementById('modal-textarea');
    ta.value = display;
    ta.disabled = false;
    document.getElementById('btn-save-cell').disabled = false;
    ta.focus();
}

function closeModal() {
    document.getElementById('modal-overlay').classList.remove('open');
}

document.getElementById('modal-close').onclick = closeModal;
document.getElementById('btn-cancel').onclick = closeModal;
document.getElementById('modal-overlay').onclick = (e) => {
    if (e.target === document.getElementById('modal-overlay')) closeModal();
};

document.getElementById('btn-load-more').onclick = () => {
    document.getElementById('btn-load-more').disabled = true;
    vscode.postMessage({ type: 'requestPage', start: loadedCount });
};

document.getElementById('btn-save-cell').onclick = () => {
    const { row, col } = editingCell;
    let value = document.getElementById('modal-textarea').value;
    const errEl = document.getElementById('modal-error');
    const cell = rows[row][col];
    const key = row + ',' + col;
    const originalRaw = cell.lazy ? (cellCache.get(key) ?? '') : cell.v;

    if (looksLikeJson(originalRaw)) {
        try {
            value = JSON.stringify(JSON.parse(value));
        } catch (e) {
            errEl.textContent = 'Invalid JSON: ' + e.message;
            errEl.style.display = 'block';
            return;
        }
    }

    const isJson = looksLikeJson(value);
    const nowLazy = cell.lazy;
    if (nowLazy) {
        cellCache.set(key, value);
        rows[row][col] = { v: value.slice(0, 80), lazy: true, json: isJson };
    } else {
        rows[row][col] = { v: value, lazy: false, json: isJson };
    }

    // Update the specific cell in the DOM instead of re-rendering everything
    const tbody = document.querySelector('#csv-table tbody');
    const tr = tbody.rows[row];
    if (tr) {
        const td = tr.cells[col + 1]; // +1 for row-number column
        td.innerHTML = '';
        if (isJson) {
            const badge = document.createElement('span');
            badge.className = 'json-badge';
            badge.textContent = 'JSON';
            badge.onclick = (e) => { e.stopPropagation(); openModal(row, col); };
            td.appendChild(badge);
        } else {
            const span = document.createElement('span');
            span.className = 'cell-preview';
            span.textContent = value;
            td.appendChild(span);
            td.ondblclick = () => openModal(row, col);
        }
    }

    closeModal();
    vscode.postMessage({ type: 'editCell', row, col, value });
};

// ── Messages from extension ───────────────────────────────────────────────────
window.addEventListener('message', ({ data }) => {
    switch (data.type) {
        case 'load': {
            headers = data.headers;
            rows = data.rows;
            totalRows = data.totalRows;
            hasMore = data.hasMore;
            loadedCount = data.rows.length;
            cellCache.clear();

            buildHeaderRow();
            document.querySelector('#csv-table tbody').innerHTML = '';
            appendRowsToTable(rows, 0);

            document.getElementById('loading').style.display = 'none';
            document.getElementById('toolbar').style.display = 'flex';
            document.getElementById('table-container').style.display = 'block';
            updateStatus();
            updateLoadMoreButton();
            break;
        }
        case 'appendRows': {
            const newRows = data.rows;
            const start = data.start;
            hasMore = data.hasMore;
            rows = rows.concat(newRows);
            loadedCount = rows.length;
            appendRowsToTable(newRows, start);
            updateStatus();
            updateLoadMoreButton();
            break;
        }
        case 'cellContent': {
            const key = data.row + ',' + data.col;
            cellCache.set(key, data.text);
            if (editingCell.row === data.row && editingCell.col === data.col) {
                showModalContent(data.text);
            }
            break;
        }
    }
});
</script>
</body>
</html>`;
}
