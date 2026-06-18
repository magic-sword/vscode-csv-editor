import * as vscode from 'vscode';
import { getWebviewContent } from './webview';
import { STORED_CELL_MAX, makeWebviewCells, makeWebviewRows, parseCsvRows, parseCsvRowsFromFile, readRowsFromFile, stringifyCsv } from './csvParser';
import { parseQuery, evalExpr } from './queryFilter';
import { summarizeNode, getAtPath, setAtPath, valueType } from './jsonTree';

const PAGE_SIZE        = 500;
const STREAM_BATCH     = 50;
const FLUSH_INTERVAL_MS = 50;

class CsvEditorPanel {
    private readonly panel: vscode.WebviewPanel;
    private rows: string[][] = [];
    private headers: string[] = [];
    private truncatedCells = new Set<string>();
    private jsonCacheKey = '';
    private jsonCacheParsed: unknown = null;
    private searchResultIndices: number[] | null = null;
    private searchSeq = 0;
    // true when Node's fs module can access targetUri.fsPath directly (local or WSL remote).
    private readonly canUseNativeFs: boolean;

    constructor(
        context: vscode.ExtensionContext,
        private readonly targetUri: vscode.Uri,
    ) {
        this.canUseNativeFs = targetUri.scheme === 'file' || targetUri.scheme === 'vscode-remote';
        const fileName = targetUri.path.split('/').pop() ?? 'CSV Editor';
        this.panel = vscode.window.createWebviewPanel(
            'csvEditor', fileName, vscode.ViewColumn.Active,
            { enableScripts: true, localResourceRoots: [], retainContextWhenHidden: true },
        );
        this.panel.webview.html = getWebviewContent();
        this.panel.webview.onDidReceiveMessage(
            (msg) => this.handleMessage(msg as Record<string, unknown>),
            undefined,
            context.subscriptions,
        );
    }

    private post(msg: object): void {
        this.panel.webview.postMessage(msg);
    }

    // Returns the full cell content, re-reading from file if the cell was stored truncated.
    private async getFullCell(row: number, col: number): Promise<string> {
        const key = `${row},${col}`;
        if (this.truncatedCells.has(key) && this.canUseNativeFs) {
            const fileRows = await readRowsFromFile(this.targetUri.fsPath, [row]);
            return fileRows.get(row)?.[col] ?? this.rows[row]?.[col] ?? '';
        }
        return this.rows[row]?.[col] ?? '';
    }

    private async loadFile(): Promise<void> {
        this.rows = [];
        this.headers = [];
        this.truncatedCells.clear();

        let lastProgressTime = 0;
        const sendProgress = (bytesRead: number, totalBytes: number) => {
            const now = Date.now();
            if (now - lastProgressTime < 100) return;
            lastProgressTime = now;
            this.post({ type: 'progress', bytesRead, totalBytes });
        };

        // Local and WSL-remote files: stream 1 MB chunks via Node's fs (fsPath is a native path).
        // Other remote URIs (e.g. vscode-vfs): fall back to reading the whole file via VS Code API.
        const targetUri = this.targetUri;
        const iter = this.canUseNativeFs
            ? parseCsvRowsFromFile(targetUri.fsPath, sendProgress, STORED_CELL_MAX)
            : (async function* () {
                const bytes = await vscode.workspace.fs.readFile(targetUri);
                const text = Buffer.from(bytes).toString('utf8');
                yield* parseCsvRows(text);
              })();

        const headerResult = await iter.next();
        if (headerResult.done || !headerResult.value) return;
        this.headers = headerResult.value;

        this.post({ type: 'load', headers: this.headers, rows: [], totalRows: 0, isLoading: true, hasMore: false, pageSize: PAGE_SIZE });
        await new Promise<void>(resolve => setImmediate(resolve));

        let batch: string[][] = [];
        let sentToWebview = 0;
        let lastFlushTime = Date.now();
        let firstRowFlushed = false;

        const flushBatch = async () => {
            if (batch.length === 0) { await new Promise<void>(resolve => setImmediate(resolve)); return; }
            const startIndex = this.rows.length;
            for (let bi = 0; bi < batch.length; bi++) {
                const rowIdx = startIndex + bi;
                batch[bi].forEach((cell, ci) => {
                    if (cell.length >= STORED_CELL_MAX) this.truncatedCells.add(`${rowIdx},${ci}`);
                });
                this.rows.push(batch[bi]);
            }
            if (sentToWebview < PAGE_SIZE) {
                const toSend = batch.slice(0, PAGE_SIZE - sentToWebview);
                this.post({ type: 'streamRows', rows: toSend.map(r => makeWebviewCells(r)), startIndex });
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
        await flushBatch();
        this.post({ type: 'loadComplete', totalRows: this.rows.length, hasMore: this.rows.length > PAGE_SIZE });
    }

    private async saveFile(): Promise<void> {
        if (this.truncatedCells.size === 0) {
            const text = stringifyCsv([this.headers, ...this.rows]);
            await vscode.workspace.fs.writeFile(this.targetUri, Buffer.from(text, 'utf8'));
            return;
        }
        // Some cells are stored truncated — re-read those rows from file to get original full content.
        const truncatedRowSet = new Set<number>();
        for (const key of this.truncatedCells) truncatedRowSet.add(parseInt(key.split(',')[0]));
        const fileRows = await readRowsFromFile(this.targetUri.fsPath, Array.from(truncatedRowSet));
        const fullRows = this.rows.map((row, r) => {
            if (!truncatedRowSet.has(r)) return row;
            const fileRow = fileRows.get(r) ?? row;
            return row.map((cell, c) => this.truncatedCells.has(`${r},${c}`) ? (fileRow[c] ?? cell) : cell);
        });
        const text = stringifyCsv([this.headers, ...fullRows]);
        await vscode.workspace.fs.writeFile(this.targetUri, Buffer.from(text, 'utf8'));
    }

    private async handleMessage(msg: Record<string, unknown>): Promise<void> {
        switch (msg.type) {

            case 'ready':
                await this.loadFile();
                break;

            // ── Text cell ──────────────────────────────────────────────────────
            case 'getCellContent': {
                const row = msg.row as number, col = msg.col as number;
                this.post({ type: 'cellContent', row, col, text: await this.getFullCell(row, col) });
                break;
            }

            case 'editCell': {
                const row = msg.row as number, col = msg.col as number;
                if (this.rows[row]) { this.rows[row][col] = msg.value as string; await this.saveFile(); }
                break;
            }

            // ── Search ─────────────────────────────────────────────────────────
            case 'search': {
                const seq = ++this.searchSeq;
                const query = (msg.query as string).trim();
                if (!query) {
                    this.searchResultIndices = null;
                    this.post({ type: 'load', headers: this.headers, rows: makeWebviewRows(this.rows, 0, PAGE_SIZE), totalRows: this.rows.length, hasMore: this.rows.length > PAGE_SIZE, pageSize: PAGE_SIZE });
                    break;
                }
                let expr;
                try { expr = parseQuery(query); }
                catch (e) { this.post({ type: 'searchError', message: (e as Error).message }); break; }

                const matched: number[] = [];
                let ny = 10_000;
                for (let i = 0; i < this.rows.length; i++) {
                    if (i >= ny) { ny = i + 10_000; await new Promise<void>(resolve => setImmediate(resolve)); }
                    if (seq !== this.searchSeq) return;
                    if (evalExpr(expr, this.rows[i], this.headers)) matched.push(i);
                }
                this.searchResultIndices = matched;
                this.post({
                    type: 'searchResults',
                    totalMatches: matched.length,
                    rows: matched.slice(0, PAGE_SIZE).map(i => makeWebviewCells(this.rows[i])),
                    originalIndices: matched.slice(0, PAGE_SIZE),
                    hasMore: matched.length > PAGE_SIZE,
                    pageStart: 0,
                });
                break;
            }

            case 'requestSearchPage': {
                if (!this.searchResultIndices) break;
                const start = (msg.start as number) ?? 0;
                const pageIdx = this.searchResultIndices.slice(start, start + PAGE_SIZE);
                this.post({
                    type: 'searchResults',
                    totalMatches: this.searchResultIndices.length,
                    rows: pageIdx.map(i => makeWebviewCells(this.rows[i])),
                    originalIndices: pageIdx,
                    hasMore: start + PAGE_SIZE < this.searchResultIndices.length,
                    pageStart: start,
                });
                break;
            }

            case 'clearSearch':
                this.searchResultIndices = null;
                this.post({ type: 'load', headers: this.headers, rows: makeWebviewRows(this.rows, 0, PAGE_SIZE), totalRows: this.rows.length, hasMore: this.rows.length > PAGE_SIZE, pageSize: PAGE_SIZE });
                break;

            // ── Pagination ─────────────────────────────────────────────────────
            case 'requestPage': {
                const start = (msg.start as number) ?? 0;
                this.post({ type: 'appendRows', rows: makeWebviewRows(this.rows, start, PAGE_SIZE), start, hasMore: start + PAGE_SIZE < this.rows.length });
                break;
            }

            // ── JSON tree ──────────────────────────────────────────────────────
            case 'getCellJson': {
                const row = msg.row as number, col = msg.col as number;
                const cacheKey = `${row},${col}`;
                if (this.jsonCacheKey === cacheKey) {
                    this.post({ type: 'cellJsonNode', row, col, path: [], offset: 0, node: summarizeNode(this.jsonCacheParsed, 0) });
                    break;
                }
                const raw = await this.getFullCell(row, col);
                let parsed: unknown;
                try { parsed = JSON.parse(raw); this.jsonCacheKey = cacheKey; this.jsonCacheParsed = parsed; }
                catch { this.post({ type: 'cellContent', row, col, text: raw }); break; }
                this.post({ type: 'cellJsonNode', row, col, path: [], offset: 0, node: summarizeNode(parsed, 0) });
                break;
            }

            case 'expandJsonPath': {
                const row = msg.row as number, col = msg.col as number;
                if (this.jsonCacheKey !== `${row},${col}`) break;
                const path = (msg.path as (string | number)[]) ?? [];
                const offset = (msg.offset as number) ?? 0;
                this.post({ type: 'cellJsonNode', row, col, path, offset, node: summarizeNode(getAtPath(this.jsonCacheParsed, path), offset) });
                break;
            }

            case 'getJsonScalar': {
                const row = msg.row as number, col = msg.col as number;
                if (this.jsonCacheKey !== `${row},${col}`) break;
                const path = (msg.path as (string | number)[]) ?? [];
                const value = getAtPath(this.jsonCacheParsed, path);
                this.post({ type: 'jsonScalar', row, col, path, raw: typeof value === 'string' ? value : JSON.stringify(value), vtype: valueType(value) });
                break;
            }

            case 'saveJsonPath': {
                const row = msg.row as number, col = msg.col as number;
                if (this.jsonCacheKey !== `${row},${col}`) break;
                const path = msg.path as (string | number)[];
                if (path.length === 0) this.jsonCacheParsed = msg.value;
                else setAtPath(this.jsonCacheParsed, path, msg.value);
                const newRaw = JSON.stringify(this.jsonCacheParsed);
                this.rows[row][col] = newRaw;
                this.truncatedCells.delete(`${row},${col}`);
                await this.saveFile();
                this.post({ type: 'cellPreviewUpdated', row, col, preview: newRaw.slice(0, 80) });
                break;
            }

            case 'save':
                await this.saveFile();
                break;
        }
    }
}

export async function openCsvEditor(context: vscode.ExtensionContext, uri?: vscode.Uri): Promise<void> {
    const targetUri = uri ?? vscode.window.activeTextEditor?.document.uri;
    if (!targetUri) { vscode.window.showErrorMessage('CSVファイルを選択してください。'); return; }
    new CsvEditorPanel(context, targetUri);
}
