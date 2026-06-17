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
  .json-badge { background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); border-radius: 3px; padding: 1px 5px; font-size: 10px; cursor: pointer; }
  .cell-preview { max-width: 280px; overflow: hidden; text-overflow: ellipsis; display: inline-block; vertical-align: middle; }

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
  .jmore-btn { background: none; border: none; display: block; color: var(--vscode-textLink-foreground); cursor: pointer; font-size: 11px; padding: 6px 6px; text-align: left; }
  .jmore-btn:hover { text-decoration: underline; }
  .jmore-btn:disabled { opacity: 0.5; cursor: default; text-decoration: none; }

  /* Inline scalar editor */
  .jinput-wrap { display: flex; flex-direction: column; gap: 4px; flex: 1; }
  .jinput { background: var(--vscode-input-background); border: 1px solid var(--vscode-focusBorder); color: var(--vscode-input-foreground); font-family: inherit; font-size: inherit; padding: 2px 6px; border-radius: 2px; width: 100%; }
  .jinput-btns { display: flex; gap: 6px; }
  .jinput-save { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 2px 10px; border-radius: 2px; cursor: pointer; font-size: 11px; }
  .jinput-cancel { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); border: none; padding: 2px 10px; border-radius: 2px; cursor: pointer; font-size: 11px; }
  .jsaved-note { font-size: 10px; color: var(--vscode-descriptionForeground); padding: 2px 6px; }

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

    <!-- text mode -->
    <textarea id="modal-textarea" spellcheck="false" style="display:none"></textarea>
    <div id="modal-error"></div>
    <div id="modal-footer" style="display:none">
      <button id="btn-cancel">Cancel</button>
      <button id="btn-save-cell">Save Cell</button>
    </div>

    <!-- JSON tree mode -->
    <div id="json-breadcrumb"></div>
    <div id="json-tree-view"></div>
  </div>
</div>

<script>
const vscode = acquireVsCodeApi();

// ── State ─────────────────────────────────────────────────────────────────────
let rows = [];
let headers = [];
let totalRows = 0;
let loadedCount = 0;
let hasMore = false;

// Text modal
let editingCell = { row: -1, col: -1 };
const cellCache = new Map(); // "row,col" -> full text

// JSON tree modal
let jsonRow = -1, jsonCol = -1;
let jsonPath = []; // current navigation path (array of string|number)
let pendingScalarEdit = null; // { el, li, path, vtype } - waiting for getJsonScalar response

// ── Utilities ─────────────────────────────────────────────────────────────────
function looksLikeJson(s) {
    const t = s.trim();
    return (t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'));
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

function makeDataRow(rowData, rowIndex) {
    const tr = document.createElement('tr');
    tr.appendChild(Object.assign(document.createElement('td'), { textContent: rowIndex + 1 }));
    rowData.forEach((cell, ci) => {
        const td = document.createElement('td');
        if (cell.json) {
            const badge = document.createElement('span');
            badge.className = 'json-badge';
            badge.textContent = 'JSON';
            badge.onclick = e => { e.stopPropagation(); openModal(rowIndex, ci); };
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
    newRows.forEach((rowData, i) => frag.appendChild(makeDataRow(rowData, startIndex + i)));
    tbody.appendChild(frag);
}

function updateStatus() {
    const shown = hasMore ? loadedCount + ' / ' + totalRows : String(totalRows);
    document.getElementById('status').textContent = shown + ' rows, ' + headers.length + ' columns';
}

function updateLoadMoreButton() {
    const row = document.getElementById('load-more-row');
    const btn = document.getElementById('btn-load-more');
    if (hasMore) {
        row.style.display = '';
        document.getElementById('load-more-cell').colSpan = headers.length + 1;
        btn.disabled = false;
        btn.textContent = 'さらに読み込む (' + loadedCount + ' / ' + totalRows + ')';
    } else {
        row.style.display = 'none';
    }
}

// ── Modal routing ─────────────────────────────────────────────────────────────
function openModal(ri, ci) {
    editingCell = { row: ri, col: ci };
    const cell = rows[ri][ci];
    document.getElementById('modal-error').style.display = 'none';
    document.getElementById('modal-title').textContent = headers[ci] + '  (row ' + (ri + 1) + ')';
    document.getElementById('modal-overlay').classList.add('open');

    if (cell.lazy && cell.json) {
        enterJsonMode(ri, ci);
    } else {
        enterTextMode(ri, ci, cell);
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
function enterTextMode(ri, ci, cell) {
    document.getElementById('modal-textarea').style.display = 'block';
    document.getElementById('modal-footer').style.display = 'flex';
    document.getElementById('json-breadcrumb').style.display = 'none';
    document.getElementById('json-tree-view').style.display = 'none';

    const key = ri + ',' + ci;
    if (cell.lazy && !cellCache.has(key)) {
        const ta = document.getElementById('modal-textarea');
        ta.value = 'Loading...';
        ta.disabled = true;
        document.getElementById('btn-save-cell').disabled = true;
        vscode.postMessage({ type: 'getCellContent', row: ri, col: ci });
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
    const cell = rows[row][col];
    const key = row + ',' + col;
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
        rows[row][col] = { v: value.slice(0, 80), lazy: true, json: isJson };
    } else {
        rows[row][col] = { v: value, lazy: false, json: isJson };
    }

    updateTableCell(row, col, value, isJson);
    closeModal();
    vscode.postMessage({ type: 'editCell', row, col, value });
};

function updateTableCell(ri, ci, fullValue, isJson) {
    const tbody = document.querySelector('#csv-table tbody');
    const tr = tbody.rows[ri];
    if (!tr) return;
    const td = tr.cells[ci + 1];
    if (!td) return;
    td.innerHTML = '';
    if (isJson) {
        const badge = document.createElement('span');
        badge.className = 'json-badge';
        badge.textContent = 'JSON';
        badge.onclick = e => { e.stopPropagation(); openModal(ri, ci); };
        td.appendChild(badge);
    } else {
        const span = document.createElement('span');
        span.className = 'cell-preview';
        span.textContent = fullValue;
        td.appendChild(span);
        td.ondblclick = () => openModal(ri, ci);
    }
}

// ── JSON tree mode ────────────────────────────────────────────────────────────
function enterJsonMode(ri, ci) {
    jsonRow = ri;
    jsonCol = ci;
    jsonPath = [];
    pendingScalarEdit = null;

    document.getElementById('modal-textarea').style.display = 'none';
    document.getElementById('modal-footer').style.display = 'none';
    document.getElementById('json-breadcrumb').style.display = 'flex';
    document.getElementById('json-tree-view').style.display = 'block';

    renderBreadcrumb();
    setTreeHTML('<span style="color:var(--vscode-descriptionForeground);padding:8px 0;display:block">Loading…</span>');
    vscode.postMessage({ type: 'getCellJson', row: ri, col: ci });
}

function setTreeHTML(html) {
    document.getElementById('json-tree-view').innerHTML = html;
}

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

// Render a JsonNode into #json-tree-view.
// appendMode = true → append more items to existing list (Load more)
function renderJsonNode(node, appendMode, offset) {
    const container = document.getElementById('json-tree-view');
    if (!appendMode) container.innerHTML = '';

    if (node.kind === 'scalar') {
        renderScalarRoot(container, node);
        return;
    }

    let ul = appendMode ? container.querySelector('.jtree') : null;
    if (!ul) {
        ul = document.createElement('ul');
        ul.className = 'jtree';
        container.appendChild(ul);
    }

    // Remove existing "load more" button before appending
    const existingMore = container.querySelector('.jmore-btn');
    if (existingMore) existingMore.remove();

    if (node.kind === 'object') {
        node.entries.forEach(({ key, preview, vtype }) => {
            ul.appendChild(createEntry('"' + key + '"', 'jkey', key, preview, vtype));
        });
    } else if (node.kind === 'array') {
        node.items.forEach(({ preview, vtype }, idx) => {
            ul.appendChild(createEntry('[' + (offset + idx) + ']', 'jindex', offset + idx, preview, vtype));
        });
    }

    if (node.shown < node.total) {
        const btn = document.createElement('button');
        btn.className = 'jmore-btn';
        btn.textContent = '↓ Load more (' + node.shown + ' / ' + node.total + ' shown)';
        const capturedShown = node.shown;
        btn.onclick = () => {
            btn.disabled = true;
            btn.textContent = 'Loading…';
            vscode.postMessage({ type: 'expandJsonPath', row: jsonRow, col: jsonCol, path: jsonPath, offset: capturedShown });
        };
        container.appendChild(btn);
    }
}

function renderScalarRoot(container, node) {
    const div = document.createElement('div');
    div.style.padding = '8px 6px';
    div.style.display = 'flex';
    div.style.alignItems = 'baseline';
    div.style.gap = '10px';

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
            const path = [...jsonPath, keyOrIndex];
            pendingScalarEdit = { el: valEl, li, path, vtype };
            vscode.postMessage({ type: 'getJsonScalar', row: jsonRow, col: jsonCol, path });
        };
        li.appendChild(editBtn);
    }

    return li;
}

// Called when extension sends back the raw scalar value for inline editing.
function startInlineEdit(raw, vtype) {
    if (!pendingScalarEdit) return;
    const { el, li, path } = pendingScalarEdit;
    const savedEdit = pendingScalarEdit;
    pendingScalarEdit = null;

    el.style.display = 'none';

    const wrap = document.createElement('div');
    wrap.className = 'jinput-wrap';

    const isLong = raw.length > 60;
    let input;
    if (isLong) {
        input = document.createElement('textarea');
        input.rows = Math.min(Math.ceil(raw.length / 60), 6);
        input.style.resize = 'vertical';
    } else {
        input = document.createElement('input');
        input.type = 'text';
    }
    input.className = 'jinput';
    input.value = raw;
    wrap.appendChild(input);

    const btnRow = document.createElement('div');
    btnRow.className = 'jinput-btns';

    const saveBtn = document.createElement('button');
    saveBtn.className = 'jinput-save';
    saveBtn.textContent = isLong ? 'Save (Ctrl+Enter)' : 'Save (Enter)';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'jinput-cancel';
    cancelBtn.textContent = 'Cancel';

    btnRow.appendChild(saveBtn);
    btnRow.appendChild(cancelBtn);
    wrap.appendChild(btnRow);
    li.appendChild(wrap);
    input.focus();

    const cleanup = () => {
        wrap.remove();
        el.style.display = '';
    };

    const save = () => {
        const newRaw = input.value;
        let newValue;
        if (vtype === 'string') {
            newValue = newRaw;
        } else {
            try { newValue = JSON.parse(newRaw); } catch { newValue = newRaw; }
        }
        cleanup();

        // Update the displayed value.
        const newVtype = newValue === null ? 'null' : typeof newValue;
        el.className = 'jval-' + newVtype;
        el.textContent = typeof newValue === 'string' ? JSON.stringify(newValue) : String(newValue);

        // Show a transient "Saved" note.
        const note = document.createElement('span');
        note.className = 'jsaved-note';
        note.textContent = '✓ Saved';
        li.appendChild(note);
        setTimeout(() => note.remove(), 1500);

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

        // Table data (initial load)
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

        // Pagination: append more rows
        case 'appendRows': {
            const newRows = data.rows;
            hasMore = data.hasMore;
            rows = rows.concat(newRows);
            loadedCount = rows.length;
            appendRowsToTable(newRows, data.start);
            updateStatus();
            updateLoadMoreButton();
            break;
        }

        // Text modal: full cell content received
        case 'cellContent': {
            const key = data.row + ',' + data.col;
            cellCache.set(key, data.text);
            if (editingCell.row === data.row && editingCell.col === data.col) {
                showTextContent(data.text);
            }
            break;
        }

        // JSON tree: node data received from extension
        case 'cellJsonNode': {
            if (data.row !== jsonRow || data.col !== jsonCol) break;
            // Check if current path matches what the extension sent.
            const isSamePath = JSON.stringify(data.path) === JSON.stringify(jsonPath);
            if (!isSamePath) break;
            renderJsonNode(data.node, data.offset > 0, data.offset);
            break;
        }

        // JSON tree: scalar raw value ready for inline edit
        case 'jsonScalar': {
            if (data.row !== jsonRow || data.col !== jsonCol) break;
            startInlineEdit(data.raw, data.vtype);
            break;
        }

        // JSON tree: cell updated after saveJsonPath
        case 'cellPreviewUpdated': {
            const ri = data.row, ci = data.col;
            if (ri < rows.length && ci < rows[ri].length) {
                rows[ri][ci] = { ...rows[ri][ci], v: data.preview };
            }
            // Update preview in table (JSON badge stays, tooltip would show new value)
            break;
        }
    }
});

// Load more button
document.getElementById('btn-load-more').onclick = () => {
    document.getElementById('btn-load-more').disabled = true;
    vscode.postMessage({ type: 'requestPage', start: loadedCount });
};
</script>
</body>
</html>`;
}
