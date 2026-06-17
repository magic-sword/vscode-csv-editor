import * as vscode from 'vscode';
import { getWebviewContent } from './webview';

const LAZY_THRESHOLD = 500;
const PAGE_SIZE = 500;
const YIELD_EVERY = 50_000;
const TREE_PAGE = 50; // keys/items per page in tree view

// ── JSON tree node types ───────────────────────────────────────────────────────
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
        return {
            kind: 'array',
            items: page.map(item => ({ preview: previewValue(item), vtype: valueType(item) })),
            total: v.length,
            shown: offset + page.length,
        };
    }
    const keys = Object.keys(v as object);
    const page = keys.slice(offset, offset + TREE_PAGE);
    return {
        kind: 'object',
        entries: page.map(k => ({
            key: k,
            preview: previewValue((v as Record<string, unknown>)[k]),
            vtype: valueType((v as Record<string, unknown>)[k]),
        })),
        total: keys.length,
        shown: offset + page.length,
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
    for (let i = 0; i < path.length - 1; i++) {
        cur = cur[path[i]] as Record<string | number, unknown>;
    }
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
    for (let i = 0; i < s.length; i++) {
        if (s.charCodeAt(i) > 32) return true;
    }
    return false;
}

async function parseCsvAsync(text: string): Promise<string[][]> {
    const results: string[][] = [];
    let row: string[] = [];
    let i = 0;
    const n = text.length;
    let nextYield = YIELD_EVERY;

    const endRow = () => {
        if (row.some(hasContent)) results.push(row);
        row = [];
    };

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
                    if (i + 1 < n && text[i + 1] === '"') {
                        parts.push(text.slice(start, i), '"');
                        i += 2;
                        start = i;
                    } else {
                        if (i > start) parts.push(text.slice(start, i));
                        i++;
                        break;
                    }
                } else {
                    i++;
                }
            }
            field = parts.length === 0 ? '' : parts.length === 1 ? parts[0] : parts.join('');
        } else {
            const start = i;
            while (i < n && text[i] !== ',' && text[i] !== '\n' && text[i] !== '\r') i++;
            field = text.slice(start, i);
        }

        row.push(field);

        if (i >= n) {
            // EOF
        } else if (text[i] === ',') {
            i++;
        } else if (text[i] === '\r' && text[i + 1] === '\n') {
            endRow(); i += 2;
        } else if (text[i] === '\n') {
            endRow(); i++;
        }
    }

    if (row.length > 0) endRow();
    return results;
}

function stringifyCsv(data: string[][]): string {
    return data.map(row =>
        row.map(cell => {
            if (cell.includes(',') || cell.includes('"') || cell.includes('\n') || cell.includes('\r')) {
                return '"' + cell.replace(/"/g, '""') + '"';
            }
            return cell;
        }).join(',')
    ).join('\n');
}

function makeWebviewRows(rows: string[][], start: number, count: number) {
    return rows.slice(start, start + count).map(row =>
        row.map(cell => {
            const lazy = cell.length > LAZY_THRESHOLD;
            const isJson = looksLikeJson(cell);
            return { v: lazy ? cell.slice(0, 80) : cell, lazy, json: isJson };
        })
    );
}

// ── Main export ────────────────────────────────────────────────────────────────
export async function openCsvEditor(context: vscode.ExtensionContext, uri?: vscode.Uri): Promise<void> {
    const targetUri = uri ?? vscode.window.activeTextEditor?.document.uri;
    if (!targetUri) {
        vscode.window.showErrorMessage('CSVファイルを選択してください。');
        return;
    }

    const fileName = targetUri.path.split('/').pop() ?? 'CSV Editor';

    const panel = vscode.window.createWebviewPanel(
        'csvEditor',
        fileName,
        vscode.ViewColumn.Active,
        { enableScripts: true, localResourceRoots: [], retainContextWhenHidden: true }
    );

    panel.webview.html = getWebviewContent();

    let rows: string[][] = [];
    let headers: string[] = [];

    // Single-entry cache: holds the parsed JSON of the currently-open cell.
    let jsonCacheKey = '';
    let jsonCacheParsed: unknown = null;

    const loadFile = async () => {
        const bytes = await vscode.workspace.fs.readFile(targetUri);
        const text = Buffer.from(bytes).toString('utf8');
        const parsed = await parseCsvAsync(text);
        if (parsed.length === 0) return;
        headers = parsed[0];
        rows = parsed.slice(1);
        panel.webview.postMessage({
            type: 'load',
            headers,
            rows: makeWebviewRows(rows, 0, PAGE_SIZE),
            totalRows: rows.length,
            hasMore: rows.length > PAGE_SIZE,
            pageSize: PAGE_SIZE,
        });
    };

    const saveFile = async () => {
        const text = stringifyCsv([headers, ...rows]);
        const bytes = Buffer.from(text, 'utf8');
        await vscode.workspace.fs.writeFile(targetUri, bytes);
    };

    panel.webview.onDidReceiveMessage(async (msg) => {
        switch (msg.type) {

            // ── Regular text cell ──────────────────────────────────────────
            case 'getCellContent':
                panel.webview.postMessage({
                    type: 'cellContent',
                    row: msg.row, col: msg.col,
                    text: rows[msg.row]?.[msg.col] ?? '',
                });
                break;

            case 'editCell':
                if (rows[msg.row]) {
                    rows[msg.row][msg.col] = msg.value;
                    await saveFile();
                }
                break;

            // ── JSON tree ──────────────────────────────────────────────────
            case 'getCellJson': {
                const cacheKey = `${msg.row},${msg.col}`;
                const raw = rows[msg.row]?.[msg.col] ?? '';
                let parsed: unknown;
                if (jsonCacheKey === cacheKey) {
                    parsed = jsonCacheParsed;
                } else {
                    try {
                        parsed = JSON.parse(raw);
                        jsonCacheKey = cacheKey;
                        jsonCacheParsed = parsed;
                    } catch {
                        // Malformed JSON – fall back to raw text modal.
                        panel.webview.postMessage({ type: 'cellContent', row: msg.row, col: msg.col, text: raw });
                        break;
                    }
                }
                panel.webview.postMessage({
                    type: 'cellJsonNode',
                    row: msg.row, col: msg.col,
                    path: [], offset: 0,
                    node: summarizeNode(parsed, 0),
                });
                break;
            }

            case 'expandJsonPath': {
                const cacheKey = `${msg.row},${msg.col}`;
                if (jsonCacheKey !== cacheKey) break;
                const value = getAtPath(jsonCacheParsed, msg.path ?? []);
                panel.webview.postMessage({
                    type: 'cellJsonNode',
                    row: msg.row, col: msg.col,
                    path: msg.path, offset: msg.offset ?? 0,
                    node: summarizeNode(value, msg.offset ?? 0),
                });
                break;
            }

            case 'getJsonScalar': {
                const cacheKey = `${msg.row},${msg.col}`;
                if (jsonCacheKey !== cacheKey) break;
                const value = getAtPath(jsonCacheParsed, msg.path ?? []);
                const vtype = valueType(value);
                // raw: raw editable string (string values unquoted, others JSON-encoded)
                const raw = typeof value === 'string' ? value : JSON.stringify(value);
                panel.webview.postMessage({
                    type: 'jsonScalar',
                    row: msg.row, col: msg.col,
                    path: msg.path,
                    raw, vtype,
                });
                break;
            }

            case 'saveJsonPath': {
                const cacheKey = `${msg.row},${msg.col}`;
                if (jsonCacheKey !== cacheKey) break;
                if ((msg.path as (string | number)[]).length === 0) {
                    jsonCacheParsed = msg.value;
                } else {
                    setAtPath(jsonCacheParsed, msg.path, msg.value);
                }
                const newRaw = JSON.stringify(jsonCacheParsed);
                rows[msg.row][msg.col] = newRaw;
                await saveFile();
                // Tell webview the new preview for the table cell.
                panel.webview.postMessage({
                    type: 'cellPreviewUpdated',
                    row: msg.row, col: msg.col,
                    preview: newRaw.slice(0, 80),
                });
                break;
            }

            // ── Pagination ─────────────────────────────────────────────────
            case 'requestPage': {
                const start: number = msg.start ?? 0;
                panel.webview.postMessage({
                    type: 'appendRows',
                    rows: makeWebviewRows(rows, start, PAGE_SIZE),
                    start,
                    hasMore: start + PAGE_SIZE < rows.length,
                });
                break;
            }

            case 'save':
                await saveFile();
                break;
        }
    }, undefined, context.subscriptions);

    await loadFile();
}
