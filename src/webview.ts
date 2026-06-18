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

function looksLikeJson(s) {
    const t = s.trim();
    return (t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'));
}

// ── TableView ──────────────────────────────────────────────────────────────────
// Responsible for all CSV table DOM operations.
class TableView {
    constructor(onOpenModal) {
        this.onOpenModal = onOpenModal; // (displayedRi, ci) => void
    }

    buildHeader(headers) {
        const thead = document.querySelector('#csv-table thead');
        thead.innerHTML = '';
        const hrow = document.createElement('tr');
        hrow.appendChild(Object.assign(document.createElement('th'), { textContent: '#' }));
        headers.forEach(h => hrow.appendChild(Object.assign(document.createElement('th'), { textContent: h })));
        thead.appendChild(hrow);
    }

    clearBody() {
        document.querySelector('#csv-table tbody').innerHTML = '';
    }

    appendRows(rows, startDisplay, origIndices) {
        const frag = document.createDocumentFragment();
        rows.forEach((rowData, i) => {
            const displayedRi = startDisplay + i;
            const origIdx = origIndices ? origIndices[i] : displayedRi;
            frag.appendChild(this._makeDataRow(rowData, displayedRi, origIdx));
        });
        document.querySelector('#csv-table tbody').appendChild(frag);
    }

    updateCell(origRow, ci, value, isJson, displayedRi) {
        const tr = document.querySelector('#csv-table tbody [data-orig-row="' + origRow + '"]');
        if (!tr) return;
        const td = tr.cells[ci + 1];
        if (!td) return;
        td.innerHTML = '';
        if (isJson) {
            const badge = document.createElement('span');
            badge.className = 'json-badge';
            badge.textContent = 'JSON';
            badge.onclick = e => { e.stopPropagation(); this.onOpenModal(displayedRi, ci); };
            td.appendChild(badge);
        } else {
            const span = Object.assign(document.createElement('span'), { className: 'cell-preview', textContent: value });
            td.appendChild(span);
            td.ondblclick = () => this.onOpenModal(displayedRi, ci);
        }
    }

    _makeDataRow(rowData, displayedRi, origIdx) {
        const tr = document.createElement('tr');
        tr.dataset.origRow = String(origIdx);
        tr.appendChild(Object.assign(document.createElement('td'), { className: 'row-num', textContent: String(origIdx + 1) }));
        rowData.forEach((cell, ci) => {
            const td = document.createElement('td');
            if (cell.json) {
                const badge = document.createElement('span');
                badge.className = 'json-badge';
                badge.textContent = 'JSON';
                badge.onclick = e => { e.stopPropagation(); this.onOpenModal(displayedRi, ci); };
                td.appendChild(badge);
            } else {
                td.appendChild(Object.assign(document.createElement('span'), { className: 'cell-preview', textContent: cell.v }));
                td.ondblclick = () => this.onOpenModal(displayedRi, ci);
            }
            tr.appendChild(td);
        });
        return tr;
    }
}

// ── CellModal ──────────────────────────────────────────────────────────────────
// Responsible for the cell editing modal: text mode and JSON tree mode.
class CellModal {
    constructor(vscode, getRows, getOriginalIndex, onTableCellUpdated) {
        this.vscode = vscode;
        this.getRows = getRows;                     // () => rows[][]
        this.getOriginalIndex = getOriginalIndex;   // (displayedRi) => origIdx
        this.onTableCellUpdated = onTableCellUpdated; // (origRow, ci, value, isJson, displayedRi) => void

        this.editingCell = { row: -1, col: -1 };
        this.cellCache = new Map();  // "origRow,col" -> full text
        this.jsonRow = -1;
        this.jsonCol = -1;
        this.jsonPath = [];
        this.pendingScalarEdit = null;

        this._bindEvents();
    }

    clearCache() { this.cellCache.clear(); }

    open(displayedRi, ci, headers) {
        const origRow = this.getOriginalIndex(displayedRi);
        this.editingCell = { row: origRow, col: ci };
        const cell = this.getRows()[displayedRi][ci];

        document.getElementById('modal-error').style.display = 'none';
        document.getElementById('modal-title').textContent = headers[ci] + '  (行 ' + (origRow + 1) + ')';
        document.getElementById('modal-overlay').classList.add('open');

        if (cell.lazy && cell.json) {
            this._enterJsonMode(origRow, ci);
        } else {
            this._enterTextMode(origRow, ci, cell);
        }
    }

    close() {
        document.getElementById('modal-overlay').classList.remove('open');
        this.pendingScalarEdit = null;
    }

    handleCellContent(data) {
        this.cellCache.set(data.row + ',' + data.col, data.text);
        if (this.editingCell.row === data.row && this.editingCell.col === data.col) {
            this._showTextContent(data.text);
        }
    }

    handleJsonNode(data) {
        if (data.row !== this.jsonRow || data.col !== this.jsonCol) return;
        if (JSON.stringify(data.path) !== JSON.stringify(this.jsonPath)) return;
        this._renderJsonNode(data.node, data.offset > 0, data.offset);
    }

    handleJsonScalar(data) {
        if (data.row !== this.jsonRow || data.col !== this.jsonCol) return;
        this._startInlineEdit(data.raw, data.vtype);
    }

    handlePreviewUpdated(data, rows, rowOriginalIndices) {
        const displayedRi = rowOriginalIndices.indexOf(data.row);
        if (displayedRi >= 0 && rows[displayedRi]) {
            rows[displayedRi] = rows[displayedRi].map((cell, ci) =>
                ci === data.col ? { ...cell, v: data.preview } : cell);
        }
    }

    _bindEvents() {
        document.getElementById('modal-close').onclick = () => this.close();
        document.getElementById('modal-overlay').onclick = e => {
            if (e.target === document.getElementById('modal-overlay')) this.close();
        };
        document.getElementById('btn-cancel').onclick = () => this.close();
        document.getElementById('btn-save-cell').onclick = () => this._handleSave();
    }

    _enterTextMode(origRow, ci, cell) {
        document.getElementById('modal-textarea').style.display = 'block';
        document.getElementById('modal-footer').style.display = 'flex';
        document.getElementById('json-breadcrumb').style.display = 'none';
        document.getElementById('json-tree-view').style.display = 'none';

        const key = origRow + ',' + ci;
        if (cell.lazy && !this.cellCache.has(key)) {
            const ta = document.getElementById('modal-textarea');
            ta.value = 'Loading...';
            ta.disabled = true;
            document.getElementById('btn-save-cell').disabled = true;
            this.vscode.postMessage({ type: 'getCellContent', row: origRow, col: ci });
        } else {
            this._showTextContent(cell.lazy ? this.cellCache.get(key) : cell.v);
        }
    }

    _showTextContent(raw) {
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

    _handleSave() {
        const { row, col } = this.editingCell;
        let value = document.getElementById('modal-textarea').value;
        const errEl = document.getElementById('modal-error');
        const key = row + ',' + col;
        const rows = this.getRows();
        const displayedRi = rows.findIndex((_, i) => this.getOriginalIndex(i) === row);
        const cell = rows[displayedRi]?.[col];
        if (!cell) return;

        const originalRaw = cell.lazy ? (this.cellCache.get(key) ?? '') : cell.v;
        if (looksLikeJson(originalRaw)) {
            try { value = JSON.stringify(JSON.parse(value)); }
            catch (e) { errEl.textContent = 'Invalid JSON: ' + e.message; errEl.style.display = 'block'; return; }
        }

        const isJson = looksLikeJson(value);
        if (cell.lazy) {
            this.cellCache.set(key, value);
            rows[displayedRi][col] = { v: value.slice(0, 80), lazy: true, json: isJson };
        } else {
            rows[displayedRi][col] = { v: value, lazy: false, json: isJson };
        }

        this.onTableCellUpdated(row, col, value, isJson, displayedRi);
        this.close();
        this.vscode.postMessage({ type: 'editCell', row, col, value });
    }

    _enterJsonMode(origRow, ci) {
        this.jsonRow = origRow;
        this.jsonCol = ci;
        this.jsonPath = [];
        this.pendingScalarEdit = null;

        document.getElementById('modal-textarea').style.display = 'none';
        document.getElementById('modal-footer').style.display = 'none';
        document.getElementById('json-breadcrumb').style.display = 'flex';
        document.getElementById('json-tree-view').style.display = 'block';

        this._renderBreadcrumb();
        this._setTreeHTML('<span style="color:var(--vscode-descriptionForeground);padding:8px 0;display:block">Loading…</span>');
        this.vscode.postMessage({ type: 'getCellJson', row: origRow, col: ci });
    }

    _setTreeHTML(html) { document.getElementById('json-tree-view').innerHTML = html; }

    _renderBreadcrumb() {
        const el = document.getElementById('json-breadcrumb');
        el.innerHTML = '';
        const addCrumb = (label, path) => {
            const span = Object.assign(document.createElement('span'), { className: 'bc-item', textContent: label });
            span.onclick = () => this._navigateTo(path);
            el.appendChild(span);
        };
        addCrumb('root', []);
        this.jsonPath.forEach((seg, idx) => {
            el.appendChild(Object.assign(document.createElement('span'), { className: 'bc-sep', textContent: ' › ' }));
            addCrumb(String(seg), this.jsonPath.slice(0, idx + 1));
        });
    }

    _navigateTo(path) {
        this.jsonPath = path;
        this._renderBreadcrumb();
        this._setTreeHTML('<span style="color:var(--vscode-descriptionForeground);padding:8px 0;display:block">Loading…</span>');
        this.vscode.postMessage({ type: 'expandJsonPath', row: this.jsonRow, col: this.jsonCol, path });
    }

    _renderJsonNode(node, appendMode, offset) {
        const container = document.getElementById('json-tree-view');
        if (!appendMode) container.innerHTML = '';

        if (node.kind === 'scalar') { this._renderScalarRoot(container, node); return; }

        let ul = appendMode ? container.querySelector('.jtree') : null;
        if (!ul) { ul = document.createElement('ul'); ul.className = 'jtree'; container.appendChild(ul); }

        const existingMore = container.querySelector('.jmore-btn');
        if (existingMore) existingMore.remove();

        if (node.kind === 'object') {
            node.entries.forEach(({ key, preview, vtype }) =>
                ul.appendChild(this._createEntry('"' + key + '"', 'jkey', key, preview, vtype)));
        } else if (node.kind === 'array') {
            node.items.forEach(({ preview, vtype }, idx) =>
                ul.appendChild(this._createEntry('[' + (offset + idx) + ']', 'jindex', offset + idx, preview, vtype)));
        }

        if (node.shown < node.total) {
            const shown = node.shown;
            const btn = Object.assign(document.createElement('button'), {
                className: 'jmore-btn',
                textContent: '↓ Load more (' + shown + ' / ' + node.total + ' shown)',
            });
            btn.onclick = () => {
                btn.disabled = true; btn.textContent = 'Loading…';
                this.vscode.postMessage({ type: 'expandJsonPath', row: this.jsonRow, col: this.jsonCol, path: this.jsonPath, offset: shown });
            };
            container.appendChild(btn);
        }
    }

    _renderScalarRoot(container, node) {
        const div = document.createElement('div');
        div.style.cssText = 'padding:8px 6px;display:flex;align-items:baseline;gap:10px;';
        const valEl = Object.assign(document.createElement('span'), { className: 'jval-' + node.vtype, textContent: node.display });
        const editBtn = Object.assign(document.createElement('button'), { className: 'jedit-btn', textContent: 'Edit' });
        editBtn.style.opacity = '1';
        editBtn.onclick = () => {
            this.pendingScalarEdit = { el: valEl, li: div, path: [...this.jsonPath], vtype: node.vtype };
            this.vscode.postMessage({ type: 'getJsonScalar', row: this.jsonRow, col: this.jsonCol, path: this.jsonPath });
        };
        div.appendChild(valEl);
        div.appendChild(editBtn);
        container.appendChild(div);
    }

    _createEntry(label, labelClass, keyOrIndex, preview, vtype) {
        const li = document.createElement('li');
        li.appendChild(Object.assign(document.createElement('span'), { className: labelClass, textContent: label + ':' }));

        const isNavigable = vtype === 'object' || vtype === 'array';
        const valEl = Object.assign(document.createElement('span'), {
            className: isNavigable ? 'jnav' : ('jval-' + vtype),
            textContent: preview,
        });
        li.appendChild(valEl);

        if (isNavigable) {
            valEl.onclick = () => {
                this.jsonPath = [...this.jsonPath, keyOrIndex];
                this._renderBreadcrumb();
                this._setTreeHTML('<span style="color:var(--vscode-descriptionForeground);padding:8px 0;display:block">Loading…</span>');
                this.vscode.postMessage({ type: 'expandJsonPath', row: this.jsonRow, col: this.jsonCol, path: this.jsonPath });
            };
        } else {
            const editBtn = Object.assign(document.createElement('button'), { className: 'jedit-btn', textContent: 'Edit' });
            editBtn.onclick = () => {
                this.pendingScalarEdit = { el: valEl, li, path: [...this.jsonPath, keyOrIndex], vtype };
                this.vscode.postMessage({ type: 'getJsonScalar', row: this.jsonRow, col: this.jsonCol, path: [...this.jsonPath, keyOrIndex] });
            };
            li.appendChild(editBtn);
        }
        return li;
    }

    _startInlineEdit(raw, vtype) {
        if (!this.pendingScalarEdit) return;
        const { el, li, path } = this.pendingScalarEdit;
        this.pendingScalarEdit = null;
        el.style.display = 'none';

        const isLong = raw.length > 60;
        const input = isLong
            ? Object.assign(document.createElement('textarea'), { rows: Math.min(Math.ceil(raw.length / 60), 6) })
            : Object.assign(document.createElement('input'), { type: 'text' });
        if (isLong) input.style.resize = 'vertical';
        input.className = 'jinput';
        input.value = raw;

        const saveBtn   = Object.assign(document.createElement('button'), { className: 'jinput-save',   textContent: isLong ? 'Save (Ctrl+Enter)' : 'Save (Enter)' });
        const cancelBtn = Object.assign(document.createElement('button'), { className: 'jinput-cancel', textContent: 'Cancel' });
        const btnRow = Object.assign(document.createElement('div'), { className: 'jinput-btns' });
        btnRow.appendChild(saveBtn); btnRow.appendChild(cancelBtn);

        const wrap = Object.assign(document.createElement('div'), { className: 'jinput-wrap' });
        wrap.appendChild(input); wrap.appendChild(btnRow);
        li.appendChild(wrap);
        input.focus();

        const cleanup = () => { wrap.remove(); el.style.display = ''; };
        const save = () => {
            const newRaw = input.value;
            let newValue;
            if (vtype === 'string') { newValue = newRaw; }
            else { try { newValue = JSON.parse(newRaw); } catch { newValue = newRaw; } }
            cleanup();
            const newVtype = newValue === null ? 'null' : typeof newValue;
            el.className = 'jval-' + newVtype;
            el.textContent = typeof newValue === 'string' ? JSON.stringify(newValue) : String(newValue);
            const note = Object.assign(document.createElement('span'), { className: 'jsaved-note', textContent: '✓ Saved' });
            li.appendChild(note);
            setTimeout(() => note.remove(), 1500);
            this.vscode.postMessage({ type: 'saveJsonPath', row: this.jsonRow, col: this.jsonCol, path, value: newValue });
        };
        saveBtn.onclick = save;
        cancelBtn.onclick = cleanup;
        input.addEventListener('keydown', e => {
            if (e.key === 'Escape') cleanup();
            if (e.key === 'Enter' && (e.ctrlKey || input.tagName !== 'TEXTAREA')) save();
        });
    }
}

// ── CsvApp ─────────────────────────────────────────────────────────────────────
// Main application class. Owns all state, handles extension messages,
// and coordinates TableView and CellModal.
class CsvApp {
    constructor() {
        // Table state
        this.rows = [];
        this.rowOriginalIndices = [];
        this.headers = [];
        this.totalRows = 0;
        this.loadedCount = 0;
        this.hasMore = false;
        this.isLoading = false;
        this.loadBytesRead = 0;
        this.loadTotalBytes = 0;

        // Search state
        this.isSearchMode = false;
        this.searchTotalMatches = 0;
        this.searchLoadedCount = 0;
        this.searchHasMore = false;

        this.tableView = new TableView((ri, ci) => this.modal.open(ri, ci, this.headers));
        this.modal = new CellModal(
            vscode,
            () => this.rows,
            (i) => this._origIndex(i),
            (origRow, ci, value, isJson, displayedRi) =>
                this.tableView.updateCell(origRow, ci, value, isJson, displayedRi),
        );

        this._bindEvents();
        window.addEventListener('message', ({ data }) => this._handleMessage(data));
        vscode.postMessage({ type: 'ready' });
    }

    _origIndex(displayedRi) { return this.rowOriginalIndices[displayedRi] ?? displayedRi; }

    _bindEvents() {
        document.getElementById('btn-search').onclick = () => this._doSearch();
        document.getElementById('btn-clear-search').onclick = () => this._doClearSearch();
        document.getElementById('search-input').addEventListener('keydown', e => {
            if (e.key === 'Enter') this._doSearch();
            if (e.key === 'Escape') this._doClearSearch();
        });
        document.getElementById('btn-load-more').onclick = () => {
            document.getElementById('btn-load-more').disabled = true;
            if (this.isSearchMode) {
                vscode.postMessage({ type: 'requestSearchPage', start: this.searchLoadedCount });
            } else {
                vscode.postMessage({ type: 'requestPage', start: this.loadedCount });
            }
        };
    }

    _doSearch() {
        document.getElementById('search-error').textContent = '';
        vscode.postMessage({ type: 'search', query: document.getElementById('search-input').value.trim() });
    }

    _doClearSearch() {
        this.isSearchMode = false;
        document.getElementById('search-input').value = '';
        document.getElementById('btn-clear-search').style.display = 'none';
        document.getElementById('search-error').textContent = '';
        vscode.postMessage({ type: 'clearSearch' });
    }

    _updateStatus() {
        const el = document.getElementById('status');
        if (this.isSearchMode) {
            const shown = this.searchHasMore ? this.searchLoadedCount + ' / ' + this.searchTotalMatches : String(this.searchTotalMatches);
            el.innerHTML = shown + ' 件ヒット (全 ' + this.totalRows + ' 行, ' + this.headers.length + ' 列)';
        } else if (this.isLoading) {
            el.innerHTML = this.loadedCount + ' 行表示中 <span id="loading-indicator">読み込み中...</span>';
        } else {
            const shown = this.hasMore ? this.loadedCount + ' / ' + this.totalRows : String(this.totalRows);
            el.textContent = shown + ' 行, ' + this.headers.length + ' 列';
        }
    }

    _updateLoadingProgress() {
        const stats = document.getElementById('loading-stats');
        if (!stats) return;
        const fill = document.getElementById('loading-progress-fill');
        if (this.loadTotalBytes > 0) {
            const pct = Math.min(100, Math.round(this.loadBytesRead / this.loadTotalBytes * 100));
            fill.style.setProperty('--pct', pct + '%');
            fill.classList.add('determinate');
            stats.textContent = (this.loadBytesRead / 1024 / 1024).toFixed(0) + ' MB / '
                + (this.loadTotalBytes / 1024 / 1024).toFixed(0) + ' MB  (' + pct + '%)  —  ' + this.loadedCount + ' 行';
        } else {
            stats.textContent = this.loadedCount > 0 ? this.loadedCount + ' 行読み込み済み...' : '';
        }
    }

    _setSearchEnabled(enabled) {
        const input = document.getElementById('search-input');
        const btn = document.getElementById('btn-search');
        input.disabled = !enabled;
        btn.disabled = !enabled;
        input.placeholder = enabled
            ? '例: label = "cat"  /  score >= 0.9 AND name contains "Alice"  /  (a = "x" OR b = "y") AND c != "z"'
            : '読み込み完了後に検索できます';
    }

    _updateLoadMoreButton() {
        const row = document.getElementById('load-more-row');
        const btn = document.getElementById('btn-load-more');
        const active = !this.isLoading && (this.isSearchMode ? this.searchHasMore : this.hasMore);
        if (active) {
            const loaded = this.isSearchMode ? this.searchLoadedCount : this.loadedCount;
            const total  = this.isSearchMode ? this.searchTotalMatches : this.totalRows;
            row.style.display = '';
            document.getElementById('load-more-cell').colSpan = this.headers.length + 1;
            btn.disabled = false;
            btn.textContent = 'さらに読み込む (' + loaded + ' / ' + total + ')';
        } else {
            row.style.display = 'none';
        }
    }

    _handleMessage(data) {
        switch (data.type) {
            case 'load': {
                this.isSearchMode = false;
                this.isLoading = !!data.isLoading;
                this.loadBytesRead = 0; this.loadTotalBytes = 0;
                this.headers = data.headers;
                this.rows = []; this.rowOriginalIndices = [];
                this.totalRows = 0; this.hasMore = false; this.loadedCount = 0;
                this.modal.clearCache();
                this.tableView.buildHeader(this.headers);
                this.tableView.clearBody();
                document.getElementById('loading').style.display = this.isLoading ? 'flex' : 'none';
                if (this.isLoading) document.getElementById('loading-title').textContent = 'CSV を読み込み中...';
                document.getElementById('toolbar').style.display = 'flex';
                document.getElementById('search-bar').style.display = 'flex';
                document.getElementById('table-container').style.display = 'block';
                document.getElementById('btn-clear-search').style.display = 'none';
                this._setSearchEnabled(!this.isLoading);
                this._updateStatus(); this._updateLoadMoreButton(); this._updateLoadingProgress();
                break;
            }

            case 'streamRows': {
                const start = this.rows.length;
                this.rows = this.rows.concat(data.rows);
                this.rowOriginalIndices = this.rowOriginalIndices.concat(data.rows.map((_, i) => start + i));
                this.loadedCount = this.rows.length;
                this.tableView.appendRows(data.rows, start, null);
                this._updateStatus(); this._updateLoadingProgress();
                break;
            }

            case 'loadComplete':
                this.isLoading = false;
                this.totalRows = data.totalRows;
                this.hasMore = data.hasMore;
                document.getElementById('loading').style.display = 'none';
                this._setSearchEnabled(true);
                this._updateStatus(); this._updateLoadMoreButton();
                break;

            case 'appendRows': {
                const start = this.rows.length;
                this.rows = this.rows.concat(data.rows);
                this.rowOriginalIndices = this.rowOriginalIndices.concat(data.rows.map((_, i) => start + i));
                this.hasMore = data.hasMore;
                this.loadedCount = this.rows.length;
                this.tableView.appendRows(data.rows, start, null);
                this._updateStatus(); this._updateLoadMoreButton();
                break;
            }

            case 'searchResults': {
                this.isSearchMode = true;
                this.searchTotalMatches = data.totalMatches;
                this.searchHasMore = data.hasMore;
                document.getElementById('search-error').textContent = '';
                document.getElementById('btn-clear-search').style.display = '';
                if (data.pageStart === 0) {
                    this.rows = []; this.rowOriginalIndices = [];
                    this.searchLoadedCount = 0;
                    this.tableView.clearBody();
                }
                const start = this.rows.length;
                this.rows = this.rows.concat(data.rows);
                this.rowOriginalIndices = this.rowOriginalIndices.concat(data.originalIndices);
                this.searchLoadedCount = this.rows.length;
                this.tableView.appendRows(data.rows, start, data.originalIndices);
                this._updateStatus(); this._updateLoadMoreButton();
                break;
            }

            case 'searchError':
                document.getElementById('search-error').textContent = '⚠ ' + data.message;
                break;

            case 'cellContent':        this.modal.handleCellContent(data);   break;
            case 'cellJsonNode':       this.modal.handleJsonNode(data);       break;
            case 'jsonScalar':         this.modal.handleJsonScalar(data);     break;
            case 'cellPreviewUpdated': this.modal.handlePreviewUpdated(data, this.rows, this.rowOriginalIndices); break;

            case 'progress':
                this.loadBytesRead = data.bytesRead;
                this.loadTotalBytes = data.totalBytes;
                this._updateLoadingProgress();
                break;
        }
    }
}

new CsvApp();
</script>
</body>
</html>`;
}
