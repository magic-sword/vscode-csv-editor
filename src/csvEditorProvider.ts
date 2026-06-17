import * as vscode from 'vscode';
import * as fs from 'fs';
import { getWebviewContent } from './webview';

const LAZY_THRESHOLD = 500;
const PAGE_SIZE = 500;
const STREAM_BATCH = 50;    // max rows per streaming message
const FLUSH_INTERVAL_MS = 50; // flush at most every 50ms (or when batch is full)
const YIELD_EVERY = 50_000;
const TREE_PAGE = 50;

// ── Query parser ───────────────────────────────────────────────────────────────

type Token =
    | { t: 'ident'; v: string }
    | { t: 'str';   v: string }
    | { t: 'num';   v: number }
    | { t: 'op';    v: string }
    | { t: 'and' | 'or' | 'lparen' | 'rparen' };

type Expr =
    | { e: 'cond'; col: string; op: string; val: string | number }
    | { e: 'and'; l: Expr; r: Expr }
    | { e: 'or';  l: Expr; r: Expr };

function tokenize(input: string): Token[] {
    const tokens: Token[] = [];
    let i = 0;
    while (i < input.length) {
        while (i < input.length && input.charCodeAt(i) <= 32) i++;
        if (i >= input.length) break;
        const ch = input[i];

        // Quoted string (single, double, or backtick for column names)
        if (ch === '"' || ch === "'" || ch === '`') {
            const q = ch; i++;
            let s = '';
            while (i < input.length && input[i] !== q) s += input[i++];
            if (i < input.length) i++; // closing quote
            tokens.push({ t: 'str', v: s });
            continue;
        }

        // Multi-char operators first
        if (input.startsWith('>=', i)) { tokens.push({ t: 'op', v: '>=' }); i += 2; continue; }
        if (input.startsWith('<=', i)) { tokens.push({ t: 'op', v: '<=' }); i += 2; continue; }
        if (input.startsWith('!=', i)) { tokens.push({ t: 'op', v: '!=' }); i += 2; continue; }
        if (ch === '=' || ch === '>' || ch === '<') { tokens.push({ t: 'op', v: ch }); i++; continue; }
        if (ch === '(') { tokens.push({ t: 'lparen' }); i++; continue; }
        if (ch === ')') { tokens.push({ t: 'rparen' }); i++; continue; }

        // Word: keyword, identifier, or bare value
        let w = '';
        while (i < input.length && input.charCodeAt(i) > 32 && !'=!<>()"\'`'.includes(input[i])) {
            w += input[i++];
        }
        if (!w) { i++; continue; }

        const up = w.toUpperCase();
        if (up === 'AND')        { tokens.push({ t: 'and' }); continue; }
        if (up === 'OR')         { tokens.push({ t: 'or'  }); continue; }
        if (up === 'CONTAINS')   { tokens.push({ t: 'op', v: 'contains'   }); continue; }
        if (up === 'STARTSWITH') { tokens.push({ t: 'op', v: 'startswith' }); continue; }
        if (up === 'ENDSWITH')   { tokens.push({ t: 'op', v: 'endswith'   }); continue; }
        if (/^-?\d+(\.\d+)?$/.test(w)) { tokens.push({ t: 'num', v: Number(w) }); continue; }
        tokens.push({ t: 'ident', v: w });
    }
    return tokens;
}

function parseQuery(input: string): Expr {
    const toks = tokenize(input.trim());
    let pos = 0;

    const peek  = () => toks[pos];
    const next  = () => toks[pos++];

    function parseOr(): Expr {
        let l = parseAnd();
        while (peek()?.t === 'or') { next(); l = { e: 'or', l, r: parseAnd() }; }
        return l;
    }

    function parseAnd(): Expr {
        let l = parsePrimary();
        while (peek()?.t === 'and') { next(); l = { e: 'and', l, r: parsePrimary() }; }
        return l;
    }

    function parsePrimary(): Expr {
        if (peek()?.t === 'lparen') {
            next();
            const e = parseOr();
            if (peek()?.t !== 'rparen') throw new Error("対応する ')' がありません");
            next();
            return e;
        }

        const colTok = next();
        if (!colTok) throw new Error('列名が必要です');
        let col: string;
        if (colTok.t === 'ident' || colTok.t === 'str') col = (colTok as { t: string; v: string }).v;
        else throw new Error(`列名が見つかりません: ${JSON.stringify(colTok)}`);

        const opTok = next();
        if (!opTok || opTok.t !== 'op') throw new Error(`"${col}" の後に演算子が必要です`);
        const op = (opTok as { t: 'op'; v: string }).v;

        const valTok = next();
        if (!valTok) throw new Error('値が必要です');
        let val: string | number;
        if (valTok.t === 'str')   val = (valTok as { t: 'str'; v: string }).v;
        else if (valTok.t === 'num')   val = (valTok as { t: 'num'; v: number }).v;
        else if (valTok.t === 'ident') val = (valTok as { t: 'ident'; v: string }).v;
        else throw new Error('値が必要です');

        return { e: 'cond', col, op, val };
    }

    const result = parseOr();
    if (pos < toks.length) throw new Error(`予期しないトークン: "${(toks[pos] as { v?: string }).v ?? toks[pos].t}"`);
    return result;
}

function evalExpr(expr: Expr, row: string[], headers: string[]): boolean {
    if (expr.e === 'and') return evalExpr(expr.l, row, headers) && evalExpr(expr.r, row, headers);
    if (expr.e === 'or')  return evalExpr(expr.l, row, headers) || evalExpr(expr.r, row, headers);

    const colLower = expr.col.toLowerCase();
    const ci = headers.findIndex(h => h.toLowerCase() === colLower);
    if (ci === -1) return false;

    const cell = row[ci] ?? '';
    const val  = expr.val;

    switch (expr.op) {
        case '=':          return cell === String(val);
        case '!=':         return cell !== String(val);
        case 'contains':   return cell.toLowerCase().includes(String(val).toLowerCase());
        case 'startswith': return cell.toLowerCase().startsWith(String(val).toLowerCase());
        case 'endswith':   return cell.toLowerCase().endsWith(String(val).toLowerCase());
        case '>':  { const n = Number(cell); return !isNaN(n) && n >  Number(val); }
        case '<':  { const n = Number(cell); return !isNaN(n) && n <  Number(val); }
        case '>=': { const n = Number(cell); return !isNaN(n) && n >= Number(val); }
        case '<=': { const n = Number(cell); return !isNaN(n) && n <= Number(val); }
    }
    return false;
}

// ── JSON tree helpers ──────────────────────────────────────────────────────────

type ScalarNode = { kind: 'scalar'; vtype: string; display: string; raw: string };
type ObjectNode = { kind: 'object'; entries: { key: string; preview: string; vtype: string }[]; total: number; shown: number };
type ArrayNode  = { kind: 'array';  items:   { preview: string; vtype: string }[];              total: number; shown: number };
type JsonNode = ScalarNode | ObjectNode | ArrayNode;

function valueType(v: unknown): string {
    if (v === null) return 'null';
    if (Array.isArray(v)) return 'array';
    return typeof v;
}

function previewValue(v: unknown): string {
    if (v === null) return 'null';
    if (typeof v === 'boolean' || typeof v === 'number') return String(v);
    if (typeof v === 'string') {
        const s = v.length > 60 ? v.slice(0, 60) + '…' : v;
        return JSON.stringify(s);
    }
    if (Array.isArray(v)) return `[…${v.length} item${v.length !== 1 ? 's' : ''}]`;
    if (typeof v === 'object') {
        const n = Object.keys(v as object).length;
        return `{…${n} key${n !== 1 ? 's' : ''}}`;
    }
    return String(v);
}

function summarizeNode(v: unknown, offset = 0): JsonNode {
    if (v === null)           return { kind: 'scalar', vtype: 'null',    display: 'null',    raw: 'null' };
    if (typeof v === 'boolean') { const s = String(v); return { kind: 'scalar', vtype: 'boolean', display: s, raw: s }; }
    if (typeof v === 'number')  { const s = String(v); return { kind: 'scalar', vtype: 'number',  display: s, raw: s }; }
    if (typeof v === 'string') {
        const display = v.length > 200 ? JSON.stringify(v.slice(0, 200) + '…') : JSON.stringify(v);
        return { kind: 'scalar', vtype: 'string', display, raw: v };
    }
    if (Array.isArray(v)) {
        const page = v.slice(offset, offset + TREE_PAGE);
        return { kind: 'array', items: page.map(item => ({ preview: previewValue(item), vtype: valueType(item) })), total: v.length, shown: offset + page.length };
    }
    const keys = Object.keys(v as object);
    const page = keys.slice(offset, offset + TREE_PAGE);
    return {
        kind: 'object',
        entries: page.map(k => ({ key: k, preview: previewValue((v as Record<string, unknown>)[k]), vtype: valueType((v as Record<string, unknown>)[k]) })),
        total: keys.length, shown: offset + page.length,
    };
}

function getAtPath(root: unknown, path: (string | number)[]): unknown {
    let cur = root;
    for (const key of path) {
        if (cur === null || typeof cur !== 'object') return undefined;
        cur = (cur as Record<string | number, unknown>)[key];
    }
    return cur;
}

function setAtPath(root: unknown, path: (string | number)[], newVal: unknown): void {
    if (path.length === 0) return;
    let cur = root as Record<string | number, unknown>;
    for (let i = 0; i < path.length - 1; i++) cur = cur[path[i]] as Record<string | number, unknown>;
    cur[path[path.length - 1]] = newVal;
}

// ── CSV helpers ────────────────────────────────────────────────────────────────

function looksLikeJson(s: string): boolean {
    let lo = 0, hi = s.length - 1;
    while (lo <= hi && s.charCodeAt(lo) <= 32) lo++;
    while (hi >= lo && s.charCodeAt(hi) <= 32) hi--;
    if (lo > hi) return false;
    return (s[lo] === '{' && s[hi] === '}') || (s[lo] === '[' && s[hi] === ']');
}

function hasContent(s: string): boolean {
    for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) > 32) return true;
    return false;
}

function makeWebviewCells(row: string[]) {
    return row.map(cell => {
        const lazy = cell.length > LAZY_THRESHOLD;
        const isJson = looksLikeJson(cell);
        return { v: lazy ? cell.slice(0, 80) : cell, lazy, json: isJson };
    });
}

function makeWebviewRows(rows: string[][], start: number, count: number) {
    return rows.slice(start, start + count).map(row => makeWebviewCells(row));
}

// Async generator that yields one CSV row at a time.
// Yields to the event loop every YIELD_EVERY chars so the host stays responsive.
async function* parseCsvRows(text: string): AsyncGenerator<string[]> {
    let row: string[] = [];
    let i = 0;
    const n = text.length;
    let nextYield = YIELD_EVERY;

    while (i < n) {
        if (i >= nextYield) {
            nextYield = i + YIELD_EVERY;
            await new Promise<void>(resolve => setImmediate(resolve));
        }

        let field: string;
        if (text[i] === '"') {
            i++;
            const parts: string[] = [];
            let start = i;
            while (i < n) {
                if (i >= nextYield) {
                    nextYield = i + YIELD_EVERY;
                    await new Promise<void>(resolve => setImmediate(resolve));
                }
                if (text[i] === '"') {
                    if (i + 1 < n && text[i + 1] === '"') { parts.push(text.slice(start, i), '"'); i += 2; start = i; }
                    else { if (i > start) parts.push(text.slice(start, i)); i++; break; }
                } else { i++; }
            }
            field = parts.length === 0 ? '' : parts.length === 1 ? parts[0] : parts.join('');
        } else {
            const start = i;
            while (i < n && text[i] !== ',' && text[i] !== '\n' && text[i] !== '\r') i++;
            field = text.slice(start, i);
        }

        row.push(field);

        let endOfRow = false;
        if      (i >= n)                                   { endOfRow = true; }
        else if (text[i] === ',')                          { i++; }
        else if (text[i] === '\r' && text[i + 1] === '\n') { endOfRow = true; i += 2; }
        else if (text[i] === '\n')                         { endOfRow = true; i++; }

        if (endOfRow) {
            if (row.some(hasContent)) yield row;
            row = [];
        }
    }
    if (row.length > 0 && row.some(hasContent)) yield row;
}

// Streaming CSV parser: reads the file in 1 MB chunks via createReadStream.
// Uses indexOf() instead of char-by-char scanning — 10–100× faster for large JSON cells.
// Yields to the macrotask queue (setImmediate) after each chunk so VS Code IPC stays live.
async function* parseCsvRowsFromFile(
    filePath: string,
    onChunk?: (bytesRead: number, totalBytes: number) => void,
): AsyncGenerator<string[]> {
    const totalBytes = (() => { try { return fs.statSync(filePath).size; } catch { return 0; } })();
    let bytesRead = 0;
    const nodeStream = fs.createReadStream(filePath, { encoding: 'utf8', highWaterMark: 1024 * 1024 });

    let currentRow: string[] = [];
    let fieldParts: string[] = [];
    let inQuote = false;
    let pendingCR = false;
    let pendingQuote = false;

    const endField = () => {
        const v = fieldParts.length === 0 ? '' : fieldParts.length === 1 ? fieldParts[0] : fieldParts.join('');
        currentRow.push(v);
        fieldParts = [];
    };

    const endRow = (): string[] | null => {
        endField();
        const r = currentRow;
        currentRow = [];
        return r.some(hasContent) ? r : null;
    };

    for await (const rawChunk of nodeStream) {
        const chunk = rawChunk as string;
        let i = 0;

        // Resolve state that was ambiguous at the end of the previous chunk
        if (pendingCR) {
            pendingCR = false;
            if (chunk[0] === '\n') { const r = endRow(); if (r) yield r; i = 1; }
            else                   { const r = endRow(); if (r) yield r; }
        }
        if (pendingQuote) {
            pendingQuote = false;
            if (i < chunk.length && chunk[i] === '"') { fieldParts.push('"'); i++; }
            else                                      { inQuote = false; }
        }

        while (i < chunk.length) {
            if (inQuote) {
                // ── Fast path: jump to next '"' with indexOf (avoids char-by-char scan) ──
                const qi = chunk.indexOf('"', i);
                if (qi === -1) {
                    // No '"' in remainder of chunk — whole slice is field content
                    fieldParts.push(chunk.slice(i));
                    i = chunk.length;
                } else {
                    if (qi > i) fieldParts.push(chunk.slice(i, qi));
                    if (qi + 1 < chunk.length) {
                        if (chunk[qi + 1] === '"') { fieldParts.push('"'); i = qi + 2; } // "" escape
                        else                       { inQuote = false;      i = qi + 1; } // closing quote
                    } else {
                        pendingQuote = true; i = chunk.length; // '"' at chunk boundary
                    }
                }
            } else {
                // ── Fast path: find the nearest separator in one pass ──
                let ns = chunk.length;
                let ci: number;
                ci = chunk.indexOf(',',  i); if (ci !== -1 && ci < ns) ns = ci;
                ci = chunk.indexOf('\n', i); if (ci !== -1 && ci < ns) ns = ci;
                ci = chunk.indexOf('\r', i); if (ci !== -1 && ci < ns) ns = ci;
                ci = chunk.indexOf('"',  i); if (ci !== -1 && ci < ns) ns = ci;

                if (ns > i) fieldParts.push(chunk.slice(i, ns));
                i = ns;
                if (i >= chunk.length) break;

                const ch = chunk[i];
                if (ch === ',') {
                    endField(); i++;
                } else if (ch === '\n') {
                    const r = endRow(); if (r) yield r; i++;
                } else if (ch === '\r') {
                    if (i + 1 < chunk.length) {
                        const r = endRow(); if (r) yield r;
                        i += chunk[i + 1] === '\n' ? 2 : 1;
                    } else {
                        pendingCR = true; i++;
                    }
                } else { // '"'
                    if (fieldParts.length === 0) { inQuote = true; } // start of quoted field
                    else                         { fieldParts.push('"'); } // literal '"' mid-field
                    i++;
                }
            }
        }

        bytesRead += chunk.length; // chars ≈ bytes for ASCII-heavy CSV content
        onChunk?.(bytesRead, totalBytes);
        // Yield to the macrotask queue so VS Code can deliver IPC messages between chunks.
        // Without this, cached files are processed as a microtask chain, blocking message delivery.
        await new Promise<void>(resolve => setImmediate(resolve));
    }

    if (pendingQuote) inQuote = false;
    if (fieldParts.length > 0 || currentRow.length > 0) {
        const r = endRow(); if (r) yield r;
    }
}

function stringifyCsv(data: string[][]): string {
    return data.map(row =>
        row.map(cell => {
            if (cell.includes(',') || cell.includes('"') || cell.includes('\n') || cell.includes('\r'))
                return '"' + cell.replace(/"/g, '""') + '"';
            return cell;
        }).join(',')
    ).join('\n');
}

// ── Main export ────────────────────────────────────────────────────────────────
export async function openCsvEditor(context: vscode.ExtensionContext, uri?: vscode.Uri): Promise<void> {
    const targetUri = uri ?? vscode.window.activeTextEditor?.document.uri;
    if (!targetUri) { vscode.window.showErrorMessage('CSVファイルを選択してください。'); return; }

    const fileName = targetUri.path.split('/').pop() ?? 'CSV Editor';
    const panel = vscode.window.createWebviewPanel('csvEditor', fileName, vscode.ViewColumn.Active,
        { enableScripts: true, localResourceRoots: [], retainContextWhenHidden: true });

    panel.webview.html = getWebviewContent();

    let rows: string[][] = [];
    let headers: string[] = [];
    let jsonCacheKey = '';
    let jsonCacheParsed: unknown = null;

    // Search state
    let searchResultIndices: number[] | null = null;
    let searchSeq = 0;

    const loadFile = async () => {
        rows = [];
        headers = [];

        // Throttled progress callback — sends at most one message per 100ms
        let lastProgressTime = 0;
        const sendProgress = (bytesRead: number, totalBytes: number) => {
            const now = Date.now();
            if (now - lastProgressTime < 100) return;
            lastProgressTime = now;
            panel.webview.postMessage({ type: 'progress', bytesRead, totalBytes });
        };

        // Local files: stream 1 MB chunks directly — no full-file toString blocking.
        // Remote URIs: fall back to reading the whole file first.
        const iter = targetUri.scheme === 'file'
            ? parseCsvRowsFromFile(targetUri.fsPath, sendProgress)
            : (async function* () {
                const bytes = await vscode.workspace.fs.readFile(targetUri);
                const text = Buffer.from(bytes).toString('utf8');
                yield* parseCsvRows(text);
              })();

        // Read header → show the table immediately (empty rows)
        const headerResult = await iter.next();
        if (headerResult.done || !headerResult.value) return;
        headers = headerResult.value;

        panel.webview.postMessage({
            type: 'load', headers, rows: [], totalRows: 0,
            isLoading: true, hasMore: false, pageSize: PAGE_SIZE,
        });
        // Ensure the load message is processed before first streamRows arrives
        await new Promise<void>(resolve => setImmediate(resolve));

        // Stream data rows in small batches.
        // Flushes when batch is full OR FLUSH_INTERVAL_MS have elapsed,
        // so large-JSON-cell rows appear immediately even before batch fills.
        let batch: string[][] = [];
        let sentToWebview = 0; // rows already sent to webview DOM (capped at PAGE_SIZE)
        let lastFlushTime = Date.now();
        let firstRowFlushed = false;

        const flushBatch = async () => {
            if (batch.length === 0) {
                await new Promise<void>(resolve => setImmediate(resolve));
                return;
            }
            const startIndex = rows.length;
            for (const r of batch) rows.push(r);

            // Only send up to PAGE_SIZE rows to DOM; the rest stay in extension memory
            if (sentToWebview < PAGE_SIZE) {
                const toSend = batch.slice(0, PAGE_SIZE - sentToWebview);
                panel.webview.postMessage({
                    type: 'streamRows',
                    rows: toSend.map(r => makeWebviewCells(r)),
                    startIndex,
                });
                sentToWebview += toSend.length;
            }
            batch = [];
            lastFlushTime = Date.now();
            await new Promise<void>(resolve => setImmediate(resolve));
        };

        for await (const row of iter) {
            batch.push(row);
            if (!firstRowFlushed || batch.length >= STREAM_BATCH || Date.now() - lastFlushTime >= FLUSH_INTERVAL_MS) {
                await flushBatch();
                firstRowFlushed = true;
            }
        }
        await flushBatch(); // final flush

        panel.webview.postMessage({
            type: 'loadComplete',
            totalRows: rows.length,
            hasMore: rows.length > PAGE_SIZE,
        });
    };

    const saveFile = async () => {
        const text = stringifyCsv([headers, ...rows]);
        await vscode.workspace.fs.writeFile(targetUri, Buffer.from(text, 'utf8'));
    };

    panel.webview.onDidReceiveMessage(async (msg) => {
        switch (msg.type) {

            // Webview JS has finished initializing — safe to start streaming
            case 'ready':
                await loadFile();
                break;

            // ── Text cell ──────────────────────────────────────────────────
            case 'getCellContent':
                panel.webview.postMessage({ type: 'cellContent', row: msg.row, col: msg.col, text: rows[msg.row]?.[msg.col] ?? '' });
                break;

            case 'editCell':
                if (rows[msg.row]) { rows[msg.row][msg.col] = msg.value; await saveFile(); }
                break;

            // ── Search ─────────────────────────────────────────────────────
            case 'search': {
                const seq = ++searchSeq;
                const query = (msg.query as string).trim();

                if (!query) {
                    searchResultIndices = null;
                    panel.webview.postMessage({ type: 'load', headers, rows: makeWebviewRows(rows, 0, PAGE_SIZE), totalRows: rows.length, hasMore: rows.length > PAGE_SIZE, pageSize: PAGE_SIZE });
                    break;
                }

                let expr: Expr;
                try { expr = parseQuery(query); }
                catch (e) { panel.webview.postMessage({ type: 'searchError', message: (e as Error).message }); break; }

                // Async filter with yields for large datasets
                const matched: number[] = [];
                let ny = 10_000;
                for (let i = 0; i < rows.length; i++) {
                    if (i >= ny) { ny = i + 10_000; await new Promise<void>(resolve => setImmediate(resolve)); }
                    if (seq !== searchSeq) return; // cancelled by newer search
                    if (evalExpr(expr, rows[i], headers)) matched.push(i);
                }

                searchResultIndices = matched;
                const pageRows = matched.slice(0, PAGE_SIZE).map(i => makeWebviewCells(rows[i]));
                panel.webview.postMessage({
                    type: 'searchResults',
                    totalMatches: matched.length,
                    rows: pageRows,
                    originalIndices: matched.slice(0, PAGE_SIZE),
                    hasMore: matched.length > PAGE_SIZE,
                    pageStart: 0,
                });
                break;
            }

            case 'requestSearchPage': {
                if (!searchResultIndices) break;
                const start: number = msg.start ?? 0;
                const pageIdx = searchResultIndices.slice(start, start + PAGE_SIZE);
                panel.webview.postMessage({
                    type: 'searchResults',
                    totalMatches: searchResultIndices.length,
                    rows: pageIdx.map(i => makeWebviewCells(rows[i])),
                    originalIndices: pageIdx,
                    hasMore: start + PAGE_SIZE < searchResultIndices.length,
                    pageStart: start,
                });
                break;
            }

            case 'clearSearch':
                searchResultIndices = null;
                panel.webview.postMessage({ type: 'load', headers, rows: makeWebviewRows(rows, 0, PAGE_SIZE), totalRows: rows.length, hasMore: rows.length > PAGE_SIZE, pageSize: PAGE_SIZE });
                break;

            // ── Pagination ─────────────────────────────────────────────────
            case 'requestPage': {
                const start: number = msg.start ?? 0;
                panel.webview.postMessage({ type: 'appendRows', rows: makeWebviewRows(rows, start, PAGE_SIZE), start, hasMore: start + PAGE_SIZE < rows.length });
                break;
            }

            // ── JSON tree ──────────────────────────────────────────────────
            case 'getCellJson': {
                const cacheKey = `${msg.row},${msg.col}`;
                const raw = rows[msg.row]?.[msg.col] ?? '';
                let parsed: unknown;
                if (jsonCacheKey === cacheKey) { parsed = jsonCacheParsed; }
                else {
                    try { parsed = JSON.parse(raw); jsonCacheKey = cacheKey; jsonCacheParsed = parsed; }
                    catch { panel.webview.postMessage({ type: 'cellContent', row: msg.row, col: msg.col, text: raw }); break; }
                }
                panel.webview.postMessage({ type: 'cellJsonNode', row: msg.row, col: msg.col, path: [], offset: 0, node: summarizeNode(parsed, 0) });
                break;
            }

            case 'expandJsonPath': {
                if (jsonCacheKey !== `${msg.row},${msg.col}`) break;
                const value = getAtPath(jsonCacheParsed, msg.path ?? []);
                panel.webview.postMessage({ type: 'cellJsonNode', row: msg.row, col: msg.col, path: msg.path, offset: msg.offset ?? 0, node: summarizeNode(value, msg.offset ?? 0) });
                break;
            }

            case 'getJsonScalar': {
                if (jsonCacheKey !== `${msg.row},${msg.col}`) break;
                const value = getAtPath(jsonCacheParsed, msg.path ?? []);
                const vtype = valueType(value);
                const raw = typeof value === 'string' ? value : JSON.stringify(value);
                panel.webview.postMessage({ type: 'jsonScalar', row: msg.row, col: msg.col, path: msg.path, raw, vtype });
                break;
            }

            case 'saveJsonPath': {
                if (jsonCacheKey !== `${msg.row},${msg.col}`) break;
                if ((msg.path as (string | number)[]).length === 0) jsonCacheParsed = msg.value;
                else setAtPath(jsonCacheParsed, msg.path, msg.value);
                const newRaw = JSON.stringify(jsonCacheParsed);
                rows[msg.row][msg.col] = newRaw;
                await saveFile();
                panel.webview.postMessage({ type: 'cellPreviewUpdated', row: msg.row, col: msg.col, preview: newRaw.slice(0, 80) });
                break;
            }

            case 'save':
                await saveFile();
                break;
        }
    }, undefined, context.subscriptions);
}
