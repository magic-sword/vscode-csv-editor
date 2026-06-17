import * as vscode from 'vscode';
import { getWebviewContent } from './webview';

const LAZY_THRESHOLD = 500;
const PAGE_SIZE = 500;
const YIELD_EVERY = 50_000;

// Avoid trim() on large strings — just check first/last non-whitespace char.
function looksLikeJson(s: string): boolean {
    let lo = 0, hi = s.length - 1;
    while (lo <= hi && s.charCodeAt(lo) <= 32) lo++;
    while (hi >= lo && s.charCodeAt(hi) <= 32) hi--;
    if (lo > hi) return false;
    return (s[lo] === '{' && s[hi] === '}') || (s[lo] === '[' && s[hi] === ']');
}

// Whether a string contains any non-whitespace — avoids trim() allocation.
function hasContent(s: string): boolean {
    for (let i = 0; i < s.length; i++) {
        if (s.charCodeAt(i) > 32) return true;
    }
    return false;
}

// CSV parser using slice-based field extraction to avoid O(n²) string
// concatenation when cells contain large JSON blobs.
// Yields to the event loop every YIELD_EVERY chars so the extension host
// stays responsive even with multi-MB cells.
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
        // Yield to macrotask queue so the extension host stays alive.
        if (i >= nextYield) {
            nextYield = i + YIELD_EVERY;
            await new Promise<void>(resolve => setImmediate(resolve));
        }

        let field: string;

        if (text[i] === '"') {
            // Quoted field — scan by index, collect via text.slice() not +=
            i++;
            const parts: string[] = [];
            let start = i;
            while (i < n) {
                // Also yield inside long quoted fields (large JSON cells).
                if (i >= nextYield) {
                    nextYield = i + YIELD_EVERY;
                    await new Promise<void>(resolve => setImmediate(resolve));
                }
                if (text[i] === '"') {
                    if (i + 1 < n && text[i + 1] === '"') {
                        // Escaped double-quote
                        parts.push(text.slice(start, i), '"');
                        i += 2;
                        start = i;
                    } else {
                        // Closing quote
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
            // Unquoted field — jump to delimiter with one slice call.
            const start = i;
            while (i < n && text[i] !== ',' && text[i] !== '\n' && text[i] !== '\r') {
                i++;
            }
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
            // Lazily load ALL large cells, not just JSON ones.
            const lazy = cell.length > LAZY_THRESHOLD;
            const isJson = lazy ? looksLikeJson(cell) : looksLikeJson(cell);
            return { v: lazy ? cell.slice(0, 80) : cell, lazy, json: isJson };
        })
    );
}

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
        {
            enableScripts: true,
            localResourceRoots: [],
            retainContextWhenHidden: true
        }
    );

    panel.webview.html = getWebviewContent();

    let rows: string[][] = [];
    let headers: string[] = [];

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
            case 'getCellContent':
                panel.webview.postMessage({
                    type: 'cellContent',
                    row: msg.row,
                    col: msg.col,
                    text: rows[msg.row]?.[msg.col] ?? ''
                });
                break;
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
            case 'editCell':
                if (rows[msg.row]) {
                    rows[msg.row][msg.col] = msg.value;
                    await saveFile();
                }
                break;
            case 'save':
                await saveFile();
                break;
        }
    }, undefined, context.subscriptions);

    await loadFile();
}
