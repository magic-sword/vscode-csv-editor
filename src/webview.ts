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

  /* ── Toolbars ── */
  #toolbar { padding: 5px 10px; background: var(--vscode-editorGroupHeader-tabsBackground); border-bottom: 1px solid var(--vscode-panel-border); display: flex; gap: 8px; align-items: center; flex-shrink: 0; }
  #status { font-size: 11px; color: var(--vscode-descriptionForeground); }

  #search-bar { padding: 5px 10px; border-bottom: 1px solid var(--vscode-panel-border); display: flex; gap: 6px; align-items: center; flex-shrink: 0; background: var(--vscode-editor-background); }
  #search-input { flex: 1; background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border, var(--vscode-panel-border)); color: var(--vscode-input-foreground); padding: 3px 8px; font-size: 12px; border-radius: 2px; font-family: var(--vscode-editor-font-family, monospace); min-width: 0; }
  #search-input:focus { outline: 1px solid var(--vscode-focusBorder); }
  #search-input:disabled { opacity: 0.5; cursor: not-allowed; }
  @keyframes loading-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
  #loading-indicator { animation: loading-pulse 1.2s ease-in-out infinite; color: var(--vscode-descriptionForeground); font-size: 11px; }
  .search-btn { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); border: none; padding: 3px 10px; border-radius: 2px; cursor: pointer; font-size: 12px; white-space: nowrap; flex-shrink: 0; }
  .search-btn:hover { background: var(--vscode-button-secondaryHoverBackground, var(--vscode-button-secondaryBackground)); }
  #btn-search { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
  #search-error { font-size: 11px; color: var(--vscode-errorForeground); flex-shrink: 0; max-width: 400px; }

  /* ── Table ── */
  #table-container { flex: 1; overflow: auto; }
  table { border-collapse: collapse; width: max-content; min-width: 100%; }
  th { background: var(--vscode-editorGroupHeader-tabsBackground); position: sticky; top: 0; z-index: 1; padding: 5px 10px; text-align: left; border-bottom: 2px solid var(--vscode-panel-border); border-right: 1px solid var(--vscode-panel-border); white-space: nowrap; }
  td { padding: 4px 10px; border-bottom: 1px solid var(--vscode-panel-border); border-right: 1px solid var(--vscode-panel-border); max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; vertical-align: top; cursor: pointer; }
  td:hover { background: var(--vscode-list-hoverBackground); }
  td.row-num { color: var(--vscode-descriptionForeground); font-size: 11px; cursor: default; user-select: none; }
  .json-badge { background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); border-radius: 3px; padding: 1px 5px; font-size: 10px; cursor: pointer; }
  .cell-preview { max-width: 280px; overflow: hidden; text-overflow: ellipsis; display: inline-block; vertical-align: middle; }
  .search-match { background: color-mix(in srgb, var(--vscode-editor-findMatchHighlightBackground, #ea5c0055) 40%, transparent); }

  #load-more-row td { text-align: center; padding: 10px; }
  #btn-load-more { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); border: none; border-radius: 2px; padding: 5px 16px; cursor: pointer; font-size: 12px; }
  #btn-load-more:disabled { opacity: 0.5; cursor: default; }

  /* ── Shared modal shell ── */
  #modal-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 100; justify-content: center; align-items: center; }
  #modal-overlay.open { display: flex; }
  #modal { background: var(--vscode-editor-background); border: 1px solid var(--vscode-panel-border); border-radius: 4px; width: 80vw; max-width: 900px; height: 70vh; display: flex; flex-direction: column; overflow: hidden; }
  #modal-header { padding: 10px 14px; border-bottom: 1px solid var(--vscode-panel-border); display: flex; justify-content: space-between; align-items: center; flex-shrink: 0; }
  #modal-title { font-weight: bold; font-size: 12px; color: var(--vscode-descriptionForeground); }
  #modal-close { background: none; border: none; color: var(--vscode-foreground); cursor: pointer; font-size: 16px; padding: 0 4px; }

  /* ── Text mode ── */
  #modal-textarea { flex: 1; width: 100%; border: none; outline: none; resize: none; background: var(--vscode-editor-background); color: var(--vscode-editor-foreground); font-family: var(--vscode-editor-font-family, monospace); font-size: 12px; padding: 12px; }
  #modal-footer { padding: 8px 14px; border-top: 1px solid var(--vscode-panel-border); display: flex; gap: 8px; justify-content: flex-end; flex-shrink: 0; }
  #modal-footer button { padding: 4px 14px; border: none; cursor: pointer; border-radius: 2px; font-size: 12px; }
  #btn-save-cell { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
  #btn-cancel { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
  #modal-error { color: var(--vscode-errorForeground); font-size: 11px; display: none; padding: 4px 14px; flex-shrink: 0; }

  /* ── JSON tree mode ── */
  #json-breadcrumb { padding: 6px 14px; border-bottom: 1px solid var(--vscode-panel-border); display: none; align-items: center; gap: 3px; flex-wrap: wrap; font-size: 11px; flex-shrink: 0; min-height: 30px; }
  .bc-item { color: var(--vscode-textLink-foreground); cursor: pointer; }
  .bc-item:hover { text-decoration: underline; }
  .bc-sep { color: var(--vscode-descriptionForeground); }
  #json-tree-view { display: none; flex: 1; overflow: auto; padding: 10px 14px; font-family: var(--vscode-editor-font-family, monospace); font-size: 12px; }
  .jtree { list-style: none; padding: 0; margin: 0; }
  .jtree > li { padding: 3px 6px; display: flex; align-items: baseline; gap: 8px; border-radius: 3px; }
  .jtree > li:hover { background: var(--vscode-list-hoverBackground); }
  .jkey   { color: #9cdcfe; flex-shrink: 0; }
  .jindex { color: var(--vscode-descriptionForeground); flex-shrink: 0; }
  .jval-string  { color: #ce9178; word-break: break-all; }
  .jval-number  { color: #b5cea8; }
  .jval-boolean { color: #569cd6; }
  .jval-null    { color: #569cd6; font-style: italic; }
  .jnav { color: var(--vscode-textLink-foreground); cursor: pointer; font-style: italic; }
  .jnav:hover { text-decoration: underline; }
  .jedit-btn { background: none; border: 1px solid var(--vscode-panel-border); color: var(--vscode-descriptionForeground); cursor: pointer; font-size: 10px; padding: 0 5px; border-radius: 2px; opacity: 0; flex-shrink: 0; }
  .jtree > li:hover .jedit-btn { opacity: 1; }
  .jmore-btn { background: none; border: none; display: block; color: var(--vscode-textLink-foreground); cursor: pointer; font-size: 11px; padding: 6px 6px; }
  .jmore-btn:hover { text-decoration: underline; }
  .jmore-btn:disabled { opacity: 0.5; cursor: default; text-decoration: none; }
  .jinput-wrap { display: flex; flex-direction: column; gap: 4px; flex: 1; }
  .jinput { background: var(--vscode-input-background); border: 1px solid var(--vscode-focusBorder); color: var(--vscode-input-foreground); font-family: inherit; font-size: inherit; padding: 2px 6px; border-radius: 2px; width: 100%; }
  .jinput-btns { display: flex; gap: 6px; }
  .jinput-save { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 2px 10px; border-radius: 2px; cursor: pointer; font-size: 11px; }
  .jinput-cancel { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); border: none; padding: 2px 10px; border-radius: 2px; cursor: pointer; font-size: 11px; }
  .jsaved-note { font-size: 10px; color: var(--vscode-descriptionForeground); padding: 2px 6px; }

  #loading { position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; background: var(--vscode-editor-background); z-index: 200; }
  #loading-content { display: flex; flex-direction: column; align-items: center; gap: 14px; min-width: 300px; }
  #loading-title { font-size: 14px; }
  #loading-progress-track { width: 100%; height: 4px; background: var(--vscode-panel-border); border-radius: 2px; overflow: hidden; }
  @keyframes loading-slide { 0% { transform: translateX(-100%); } 100% { transform: translateX(400%); } }
  #loading-progress-fill { height: 100%; width: 25%; background: var(--vscode-progressBar-background, #0078d4); border-radius: 2px; animation: loading-slide 1.5s ease-in-out infinite; }
  #loading-progress-fill.determinate { width: var(--pct, 0%); animation: none; transition: width 0.15s linear; }
  #loading-stats { font-size: 11px; color: var(--vscode-descriptionForeground); text-align: center; min-height: 1em; }
</style>
</head>
<body>

<div id="loading">
  <div id="loading-content">
    <div id="loading-title">Loading CSV...</div>
    <div id="loading-progress-track"><div id="loading-progress-fill"></div></div>
    <div id="loading-stats"></div>
  </div>
</div>

<div id="toolbar" style="display:none">
  <span id="status"></span>
</div>

<div id="search-bar" style="display:none">
  <input id="search-input" type="text"
    placeholder='例: label = "cat"  /  score >= 0.9 AND name contains "Alice"  /  (a = "x" OR b = "y") AND c != "z"'
    title='演算子: = != > < >= <= contains startswith endswith&#10;AND / OR で複合条件&#10;( ) でグループ化&#10;列名にスペースがある場合は "列名" と引用符で囲む' />
  <button id="btn-search" class="search-btn">検索</button>
  <button id="btn-clear-search" class="search-btn" style="display:none">✕ クリア</button>
  <span id="search-error"></span>
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
    <textarea id="modal-textarea" spellcheck="false" style="display:none"></textarea>
    <div id="modal-error"></div>
    <div id="modal-footer" style="display:none">
      <button id="btn-cancel">Cancel</button>
      <button id="btn-save-cell">Save Cell</button>
    </div>
    <div id="json-breadcrumb"></div>
    <div id="json-tree-view"></div>
  </div>
</div>

<script>
const vscode = acquireVsCodeApi();

// ── State ─────────────────────────────────────────────────────────────────────
let rows = [];               // currently displayed WebviewCell[][]
let rowOriginalIndices = []; // rowOriginalIndices[i] = original CSV row index for rows[i]
let headers = [];
let totalRows = 0;
let loadedCount = 0;
let hasMore = false;
let isLoading = false;       // true while extension is still parsing remaining rows
let loadBytesRead = 0;
let loadTotalBytes = 0;

// Search state
let isSearchMode = false;
let searchTotalMatches = 0;
let searchLoadedCount = 0;
let searchHasMore = false;

// Text modal
let editingCell = { row: -1, col: -1 }; // row = original CSV row index
const cellCache = new Map(); // "origRow,col" -> full text

// JSON tree modal
let jsonRow = -1, jsonCol = -1;
let jsonPath = [];
let pendingScalarEdit = null;

// ── Utilities ─────────────────────────────────────────────────────────────────
function looksLikeJson(s) {
    const t = s.trim();
    return (t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'));
}

function getOriginalIndex(displayedRi) {
    return rowOriginalIndices[displayedRi] ?? displayedRi;
}

// ── Table rendering ───────────────────────────────────────────────────────────
function buildHeaderRow() {
    const thead = document.querySelector('#csv-table thead');
    thead.innerHTML = '';
    const hrow = document.createElement('tr');
    hrow.appendChild(Object.assign(document.createElement('th'), { textContent: '#' }));
    headers.forEach(h => hrow.appendChild(Object.assign(document.createElement('th'), { textContent: h })));
    thead.appendChild(hrow);
}

// displayedRi: index in rows array (for onclick capture)
// origIdx: original CSV row index (for display number + data-orig-row)
function makeDataRow(rowData, displayedRi, origIdx) {
    const tr = document.createElement('tr');
    tr.dataset.origRow = String(origIdx);

    const numTd = document.createElement('td');
    numTd.className = 'row-num';
    numTd.textContent = String(origIdx + 1);
    tr.appendChild(numTd);

    rowData.forEach((cell, ci) => {
        const td = document.createElement('td');
        if (cell.json) {
            const badge = document.createElement('span');
            badge.className = 'json-badge';
            badge.textContent = 'JSON';
            badge.onclick = e => { e.stopPropagation(); openModal(displayedRi, ci); };
            td.appendChild(badge);
        } else {
            const span = document.createElement('span');
            span.className = 'cell-preview';
            span.textContent = cell.v;
            td.appendChild(span);
            td.ondblclick = () => openModal(displayedRi, ci);
        }
        tr.appendChild(td);
    });
    return tr;
}

function appendRowsToTable(newRows, startDisplay, origIndices) {
    const tbody = document.querySelector('#csv-table tbody');
    const frag = document.createDocumentFragment();
    newRows.forEach((rowData, i) => {
        const displayedRi = startDisplay + i;
        const origIdx = origIndices ? origIndices[i] : displayedRi;
        frag.appendChild(makeDataRow(rowData, displayedRi, origIdx));
    });
    tbody.appendChild(frag);
}

function updateStatus() {
    const statusEl = document.getElementById('status');
    if (isSearchMode) {
        const shown = searchHasMore ? searchLoadedCount + ' / ' + searchTotalMatches : String(searchTotalMatches);
        statusEl.innerHTML = shown + ' 件ヒット (全 ' + totalRows + ' 行, ' + headers.length + ' 列)';
    } else if (isLoading) {
        statusEl.innerHTML = loadedCount + ' 行表示中 <span id="loading-indicator">読み込み中...</span>';
    } else {
        const shown = hasMore ? loadedCount + ' / ' + totalRows : String(totalRows);
        statusEl.textContent = shown + ' 行, ' + headers.length + ' 列';
    }
}

function updateLoadingProgress() {
    const stats = document.getElementById('loading-stats');
    if (!stats) return;
    const fill = document.getElementById('loading-progress-fill');
    if (loadTotalBytes > 0) {
        const pct = Math.min(100, Math.round(loadBytesRead / loadTotalBytes * 100));
        fill.style.setProperty('--pct', pct + '%');
        fill.classList.add('determinate');
        const mb = (loadBytesRead / 1024 / 1024).toFixed(0);
        const totalMb = (loadTotalBytes / 1024 / 1024).toFixed(0);
        stats.textContent = mb + ' MB / ' + totalMb + ' MB  (' + pct + '%)  —  ' + loadedCount + ' 行';
    } else {
        stats.textContent = loadedCount > 0 ? loadedCount + ' 行読み込み済み...' : '';
    }
}

function setSearchEnabled(enabled) {
    const input = document.getElementById('search-input');
    const btn = document.getElementById('btn-search');
    input.disabled = !enabled;
    btn.disabled = !enabled;
    if (!enabled) {
        input.placeholder = '読み込み完了後に検索できます';
    } else {
        input.placeholder = '例: label = "cat"  /  score >= 0.9 AND name contains "Alice"  /  (a = "x" OR b = "y") AND c != "z"';
    }
}

function updateLoadMoreButton() {
    const row = document.getElementById('load-more-row');
    const btn = document.getElementById('btn-load-more');
    // hide pagination while the file is still being parsed
    const active = !isLoading && (isSearchMode ? searchHasMore : hasMore);
    const loaded = isSearchMode ? searchLoadedCount : loadedCount;
    const total  = isSearchMode ? searchTotalMatches : totalRows;
    if (active) {
        row.style.display = '';
        document.getElementById('load-more-cell').colSpan = headers.length + 1;
        btn.disabled = false;
        btn.textContent = 'さらに読み込む (' + loaded + ' / ' + total + ')';
    } else {
        row.style.display = 'none';
    }
}

function updateTableCell(origRow, ci, fullValue, isJson) {
    const tbody = document.querySelector('#csv-table tbody');
    const tr = tbody.querySelector('[data-orig-row="' + origRow + '"]');
    if (!tr) return;
    const td = tr.cells[ci + 1];
    if (!td) return;
    td.innerHTML = '';
    const displayedRi = rows.findIndex((_, i) => getOriginalIndex(i) === origRow);
    if (isJson) {
        const badge = document.createElement('span');
        badge.className = 'json-badge';
        badge.textContent = 'JSON';
        badge.onclick = e => { e.stopPropagation(); openModal(displayedRi, ci); };
        td.appendChild(badge);
    } else {
        const span = document.createElement('span');
        span.className = 'cell-preview';
        span.textContent = fullValue;
        td.appendChild(span);
        td.ondblclick = () => openModal(displayedRi, ci);
    }
}

// ── Modal routing ─────────────────────────────────────────────────────────────
function openModal(displayedRi, ci) {
    const origRow = getOriginalIndex(displayedRi);
    editingCell = { row: origRow, col: ci };
    const cell = rows[displayedRi][ci];

    document.getElementById('modal-error').style.display = 'none';
    document.getElementById('modal-title').textContent = headers[ci] + '  (行 ' + (origRow + 1) + ')';
    document.getElementById('modal-overlay').classList.add('open');

    if (cell.lazy && cell.json) {
        enterJsonMode(origRow, ci);
    } else {
        enterTextMode(origRow, ci, cell);
    }
}

function closeModal() {
    document.getElementById('modal-overlay').classList.remove('open');
    pendingScalarEdit = null;
}

document.getElementById('modal-close').onclick = closeModal;
document.getElementById('modal-overlay').onclick = e => {
    if (e.target === document.getElementById('modal-overlay')) closeModal();
};

// ── Text mode ─────────────────────────────────────────────────────────────────
function enterTextMode(origRow, ci, cell) {
    document.getElementById('modal-textarea').style.display = 'block';
    document.getElementById('modal-footer').style.display = 'flex';
    document.getElementById('json-breadcrumb').style.display = 'none';
    document.getElementById('json-tree-view').style.display = 'none';

    const key = origRow + ',' + ci;
    if (cell.lazy && !cellCache.has(key)) {
        const ta = document.getElementById('modal-textarea');
        ta.value = 'Loading...';
        ta.disabled = true;
        document.getElementById('btn-save-cell').disabled = true;
        vscode.postMessage({ type: 'getCellContent', row: origRow, col: ci });
    } else {
        showTextContent(cell.lazy ? cellCache.get(key) : cell.v);
    }
}

function showTextContent(raw) {
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

document.getElementById('btn-cancel').onclick = closeModal;

document.getElementById('btn-save-cell').onclick = () => {
    const { row, col } = editingCell;
    let value = document.getElementById('modal-textarea').value;
    const errEl = document.getElementById('modal-error');
    const key = row + ',' + col;
    const displayedRi = rows.findIndex((_, i) => getOriginalIndex(i) === row);
    const cell = rows[displayedRi]?.[col];
    if (!cell) return;
    const originalRaw = cell.lazy ? (cellCache.get(key) ?? '') : cell.v;

    if (looksLikeJson(originalRaw)) {
        try { value = JSON.stringify(JSON.parse(value)); }
        catch (e) {
            errEl.textContent = 'Invalid JSON: ' + e.message;
            errEl.style.display = 'block';
            return;
        }
    }

    const isJson = looksLikeJson(value);
    if (cell.lazy) {
        cellCache.set(key, value);
        rows[displayedRi][col] = { v: value.slice(0, 80), lazy: true, json: isJson };
    } else {
        rows[displayedRi][col] = { v: value, lazy: false, json: isJson };
    }

    updateTableCell(row, col, value, isJson);
    closeModal();
    vscode.postMessage({ type: 'editCell', row, col, value });
};

// ── Search ────────────────────────────────────────────────────────────────────
function doSearch() {
    const q = document.getElementById('search-input').value.trim();
    document.getElementById('search-error').textContent = '';
    vscode.postMessage({ type: 'search', query: q });
}

document.getElementById('btn-search').onclick = doSearch;
document.getElementById('search-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') doSearch();
    if (e.key === 'Escape') doClearSearch();
});

function doClearSearch() {
    isSearchMode = false;
    document.getElementById('search-input').value = '';
    document.getElementById('btn-clear-search').style.display = 'none';
    document.getElementById('search-error').textContent = '';
    vscode.postMessage({ type: 'clearSearch' });
}

document.getElementById('btn-clear-search').onclick = doClearSearch;

// ── Load more ─────────────────────────────────────────────────────────────────
document.getElementById('btn-load-more').onclick = () => {
    document.getElementById('btn-load-more').disabled = true;
    if (isSearchMode) {
        vscode.postMessage({ type: 'requestSearchPage', start: searchLoadedCount });
    } else {
        vscode.postMessage({ type: 'requestPage', start: loadedCount });
    }
};

// ── JSON tree mode ────────────────────────────────────────────────────────────
function enterJsonMode(origRow, ci) {
    jsonRow = origRow; jsonCol = ci;
    jsonPath = [];
    pendingScalarEdit = null;

    document.getElementById('modal-textarea').style.display = 'none';
    document.getElementById('modal-footer').style.display = 'none';
    document.getElementById('json-breadcrumb').style.display = 'flex';
    document.getElementById('json-tree-view').style.display = 'block';

    renderBreadcrumb();
    setTreeHTML('<span style="color:var(--vscode-descriptionForeground);padding:8px 0;display:block">Loading…</span>');
    vscode.postMessage({ type: 'getCellJson', row: origRow, col: ci });
}

function setTreeHTML(html) { document.getElementById('json-tree-view').innerHTML = html; }

function renderBreadcrumb() {
    const el = document.getElementById('json-breadcrumb');
    el.innerHTML = '';
    const addCrumb = (label, path) => {
        const span = document.createElement('span');
        span.className = 'bc-item';
        span.textContent = label;
        span.onclick = () => navigateTo(path);
        el.appendChild(span);
    };
    addCrumb('root', []);
    jsonPath.forEach((seg, idx) => {
        const sep = document.createElement('span');
        sep.className = 'bc-sep';
        sep.textContent = ' › ';
        el.appendChild(sep);
        addCrumb(String(seg), jsonPath.slice(0, idx + 1));
    });
}

function navigateTo(path) {
    jsonPath = path;
    renderBreadcrumb();
    setTreeHTML('<span style="color:var(--vscode-descriptionForeground);padding:8px 0;display:block">Loading…</span>');
    vscode.postMessage({ type: 'expandJsonPath', row: jsonRow, col: jsonCol, path });
}

function renderJsonNode(node, appendMode, offset) {
    const container = document.getElementById('json-tree-view');
    if (!appendMode) container.innerHTML = '';

    if (node.kind === 'scalar') { renderScalarRoot(container, node); return; }

    let ul = appendMode ? container.querySelector('.jtree') : null;
    if (!ul) { ul = document.createElement('ul'); ul.className = 'jtree'; container.appendChild(ul); }

    const existingMore = container.querySelector('.jmore-btn');
    if (existingMore) existingMore.remove();

    if (node.kind === 'object') {
        node.entries.forEach(({ key, preview, vtype }) =>
            ul.appendChild(createEntry('"' + key + '"', 'jkey', key, preview, vtype)));
    } else if (node.kind === 'array') {
        node.items.forEach(({ preview, vtype }, idx) =>
            ul.appendChild(createEntry('[' + (offset + idx) + ']', 'jindex', offset + idx, preview, vtype)));
    }

    if (node.shown < node.total) {
        const btn = document.createElement('button');
        btn.className = 'jmore-btn';
        const shown = node.shown;
        btn.textContent = '↓ Load more (' + node.shown + ' / ' + node.total + ' shown)';
        btn.onclick = () => {
            btn.disabled = true; btn.textContent = 'Loading…';
            vscode.postMessage({ type: 'expandJsonPath', row: jsonRow, col: jsonCol, path: jsonPath, offset: shown });
        };
        container.appendChild(btn);
    }
}

function renderScalarRoot(container, node) {
    const div = document.createElement('div');
    div.style.cssText = 'padding:8px 6px;display:flex;align-items:baseline;gap:10px;';
    const valEl = document.createElement('span');
    valEl.className = 'jval-' + node.vtype;
    valEl.textContent = node.display;
    div.appendChild(valEl);
    const editBtn = document.createElement('button');
    editBtn.className = 'jedit-btn';
    editBtn.style.opacity = '1';
    editBtn.textContent = 'Edit';
    editBtn.onclick = () => {
        pendingScalarEdit = { el: valEl, li: div, path: [...jsonPath], vtype: node.vtype };
        vscode.postMessage({ type: 'getJsonScalar', row: jsonRow, col: jsonCol, path: jsonPath });
    };
    div.appendChild(editBtn);
    container.appendChild(div);
}

function createEntry(label, labelClass, keyOrIndex, preview, vtype) {
    const li = document.createElement('li');
    const keyEl = document.createElement('span');
    keyEl.className = labelClass;
    keyEl.textContent = label + ':';
    li.appendChild(keyEl);

    const isNavigable = vtype === 'object' || vtype === 'array';
    const valEl = document.createElement('span');
    valEl.className = isNavigable ? 'jnav' : ('jval-' + vtype);
    valEl.textContent = preview;
    li.appendChild(valEl);

    if (isNavigable) {
        valEl.onclick = () => {
            jsonPath = [...jsonPath, keyOrIndex];
            renderBreadcrumb();
            setTreeHTML('<span style="color:var(--vscode-descriptionForeground);padding:8px 0;display:block">Loading…</span>');
            vscode.postMessage({ type: 'expandJsonPath', row: jsonRow, col: jsonCol, path: jsonPath });
        };
    } else {
        const editBtn = document.createElement('button');
        editBtn.className = 'jedit-btn';
        editBtn.textContent = 'Edit';
        editBtn.onclick = () => {
            pendingScalarEdit = { el: valEl, li, path: [...jsonPath, keyOrIndex], vtype };
            vscode.postMessage({ type: 'getJsonScalar', row: jsonRow, col: jsonCol, path: [...jsonPath, keyOrIndex] });
        };
        li.appendChild(editBtn);
    }
    return li;
}

function startInlineEdit(raw, vtype) {
    if (!pendingScalarEdit) return;
    const { el, li, path } = pendingScalarEdit;
    pendingScalarEdit = null;
    el.style.display = 'none';

    const wrap = document.createElement('div');
    wrap.className = 'jinput-wrap';
    const isLong = raw.length > 60;
    let input;
    if (isLong) { input = document.createElement('textarea'); input.rows = Math.min(Math.ceil(raw.length / 60), 6); input.style.resize = 'vertical'; }
    else { input = document.createElement('input'); input.type = 'text'; }
    input.className = 'jinput';
    input.value = raw;
    wrap.appendChild(input);

    const btnRow = document.createElement('div');
    btnRow.className = 'jinput-btns';
    const saveBtn = document.createElement('button'); saveBtn.className = 'jinput-save'; saveBtn.textContent = isLong ? 'Save (Ctrl+Enter)' : 'Save (Enter)';
    const cancelBtn = document.createElement('button'); cancelBtn.className = 'jinput-cancel'; cancelBtn.textContent = 'Cancel';
    btnRow.appendChild(saveBtn); btnRow.appendChild(cancelBtn);
    wrap.appendChild(btnRow);
    li.appendChild(wrap);
    input.focus();

    const cleanup = () => { wrap.remove(); el.style.display = ''; };

    const save = () => {
        const newRaw = input.value;
        let newValue;
        if (vtype === 'string') newValue = newRaw;
        else { try { newValue = JSON.parse(newRaw); } catch { newValue = newRaw; } }
        cleanup();
        const newVtype = newValue === null ? 'null' : typeof newValue;
        el.className = 'jval-' + newVtype;
        el.textContent = typeof newValue === 'string' ? JSON.stringify(newValue) : String(newValue);
        const note = document.createElement('span'); note.className = 'jsaved-note'; note.textContent = '✓ Saved';
        li.appendChild(note); setTimeout(() => note.remove(), 1500);
        vscode.postMessage({ type: 'saveJsonPath', row: jsonRow, col: jsonCol, path, value: newValue });
    };

    saveBtn.onclick = save;
    cancelBtn.onclick = cleanup;
    input.addEventListener('keydown', e => {
        if (e.key === 'Escape') cleanup();
        if (e.key === 'Enter' && (e.ctrlKey || input.tagName !== 'TEXTAREA')) save();
    });
}

// ── Messages from extension ───────────────────────────────────────────────────
window.addEventListener('message', ({ data }) => {
    switch (data.type) {

        case 'load': {
            isSearchMode = false;
            isLoading = !!data.isLoading;
            loadBytesRead = 0;
            loadTotalBytes = 0;
            headers = data.headers;
            rows = [];   // always empty; streamRows fills it
            rowOriginalIndices = [];
            totalRows = 0;
            hasMore = false;
            loadedCount = 0;
            cellCache.clear();
            buildHeaderRow();
            document.querySelector('#csv-table tbody').innerHTML = '';
            // Keep #loading visible during streaming; hide it only on loadComplete.
            // Set it up as a progress screen (title + bar). Table renders behind it.
            if (isLoading) {
                document.getElementById('loading').style.display = 'flex';
                document.getElementById('loading-title').textContent = 'CSV を読み込み中...';
            } else {
                document.getElementById('loading').style.display = 'none';
            }
            document.getElementById('toolbar').style.display = 'flex';
            document.getElementById('search-bar').style.display = 'flex';
            document.getElementById('table-container').style.display = 'block';
            document.getElementById('btn-clear-search').style.display = 'none';
            setSearchEnabled(!isLoading);
            updateStatus(); updateLoadMoreButton(); updateLoadingProgress();
            break;
        }

        case 'streamRows': {
            const startDisplay = rows.length;
            rows = rows.concat(data.rows);
            rowOriginalIndices = rowOriginalIndices.concat(data.rows.map((_, i) => startDisplay + i));
            loadedCount = rows.length;
            appendRowsToTable(data.rows, startDisplay, null);
            updateStatus();
            updateLoadingProgress();
            break;
        }

        case 'loadComplete': {
            isLoading = false;
            totalRows = data.totalRows;
            hasMore = data.hasMore;
            document.getElementById('loading').style.display = 'none';
            setSearchEnabled(true);
            updateStatus(); updateLoadMoreButton();
            break;
        }

        case 'appendRows': {
            const startDisplay = rows.length;
            rows = rows.concat(data.rows);
            rowOriginalIndices = rowOriginalIndices.concat(data.rows.map((_, i) => startDisplay + i));
            hasMore = data.hasMore;
            loadedCount = rows.length;
            appendRowsToTable(data.rows, startDisplay, null);
            updateStatus(); updateLoadMoreButton();
            break;
        }

        case 'searchResults': {
            isSearchMode = true;
            searchTotalMatches = data.totalMatches;
            searchHasMore = data.hasMore;
            document.getElementById('search-error').textContent = '';
            document.getElementById('btn-clear-search').style.display = '';

            if (data.pageStart === 0) {
                rows = [];
                rowOriginalIndices = [];
                searchLoadedCount = 0;
                document.querySelector('#csv-table tbody').innerHTML = '';
            }

            const startDisplay = rows.length;
            rows = rows.concat(data.rows);
            rowOriginalIndices = rowOriginalIndices.concat(data.originalIndices);
            searchLoadedCount = rows.length;

            appendRowsToTable(data.rows, startDisplay, data.originalIndices);
            updateStatus(); updateLoadMoreButton();
            break;
        }

        case 'searchError':
            document.getElementById('search-error').textContent = '⚠ ' + data.message;
            break;

        case 'cellContent': {
            const key = data.row + ',' + data.col;
            cellCache.set(key, data.text);
            if (editingCell.row === data.row && editingCell.col === data.col) showTextContent(data.text);
            break;
        }

        case 'cellJsonNode': {
            if (data.row !== jsonRow || data.col !== jsonCol) break;
            if (JSON.stringify(data.path) !== JSON.stringify(jsonPath)) break;
            renderJsonNode(data.node, data.offset > 0, data.offset);
            break;
        }

        case 'jsonScalar': {
            if (data.row !== jsonRow || data.col !== jsonCol) break;
            startInlineEdit(data.raw, data.vtype);
            break;
        }

        case 'progress': {
            loadBytesRead = data.bytesRead;
            loadTotalBytes = data.totalBytes;
            updateLoadingProgress();
            break;
        }

        case 'cellPreviewUpdated': {
            const displayedRi = rowOriginalIndices.indexOf(data.row);
            if (displayedRi >= 0 && rows[displayedRi]) {
                rows[displayedRi] = rows[displayedRi].map((cell, ci) =>
                    ci === data.col ? { ...cell, v: data.preview } : cell);
            }
            break;
        }
    }
});

// Notify the extension that the webview JS is ready to receive messages.
// loadFile() waits for this before starting to stream rows.
vscode.postMessage({ type: 'ready' });
</script>
</body>
</html>`;
}
