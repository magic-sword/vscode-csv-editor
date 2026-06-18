import * as fs from 'fs';

export const STORED_CELL_MAX = 5000;  // cells longer than this are stored truncated; full content read on demand
export const LAZY_THRESHOLD  = 500;   // cells longer than this are shown as a badge with a preview
export const YIELD_EVERY     = 50_000;

export function looksLikeJson(s: string): boolean {
    let lo = 0;
    while (lo < s.length && s.charCodeAt(lo) <= 32) lo++;
    if (lo >= s.length) return false;
    // Check only the first non-whitespace char: truncated cells may not have a closing bracket.
    return s[lo] === '{' || s[lo] === '[';
}

export function hasContent(s: string): boolean {
    for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) > 32) return true;
    return false;
}

export function makeWebviewCells(row: string[]): { v: string; lazy: boolean; json: boolean }[] {
    return row.map(cell => {
        const lazy = cell.length > LAZY_THRESHOLD;
        return { v: lazy ? cell.slice(0, 80) : cell, lazy, json: looksLikeJson(cell) };
    });
}

export function makeWebviewRows(rows: string[][], start: number, count: number) {
    return rows.slice(start, start + count).map(row => makeWebviewCells(row));
}

export function stringifyCsv(data: string[][]): string {
    return data.map(row =>
        row.map(cell => {
            if (cell.includes(',') || cell.includes('"') || cell.includes('\n') || cell.includes('\r'))
                return '"' + cell.replace(/"/g, '""') + '"';
            return cell;
        }).join(',')
    ).join('\n');
}

// Async generator that yields one CSV row at a time from a string.
// Yields to the event loop every YIELD_EVERY chars so the host stays responsive.
export async function* parseCsvRows(text: string): AsyncGenerator<string[]> {
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
                if (i >= nextYield) { nextYield = i + YIELD_EVERY; await new Promise<void>(resolve => setImmediate(resolve)); }
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
// Uses indexOf() instead of char-by-char scanning for large JSON cells.
// Yields to the macrotask queue (setImmediate) after each chunk so VS Code IPC stays live.
//
// maxCellChars: max characters stored per quoted cell. Content beyond the limit is scanned
// (keeping parse state correct) but not accumulated — peak memory stays O(maxCellChars).
// Pass Infinity to store everything (used when reading specific rows on demand).
export async function* parseCsvRowsFromFile(
    filePath: string,
    onChunk?: (bytesRead: number, totalBytes: number) => void,
    maxCellChars = Infinity,
): AsyncGenerator<string[]> {
    const totalBytes = (() => { try { return fs.statSync(filePath).size; } catch { return 0; } })();
    let bytesRead = 0;
    const nodeStream = fs.createReadStream(filePath, { encoding: 'utf8', highWaterMark: 1024 * 1024 });

    let currentRow: string[] = [];
    let fieldParts: string[] = [];
    let inQuote = false;
    let pendingCR = false;
    let pendingQuote = false;
    let fieldSize = 0;

    const addToField = (s: string) => {
        if (fieldSize >= maxCellChars) return;
        const rem = maxCellChars - fieldSize;
        if (s.length <= rem) { fieldParts.push(s); fieldSize += s.length; }
        else                 { fieldParts.push(s.slice(0, rem)); fieldSize = maxCellChars; }
    };

    const endField = () => {
        const v = fieldParts.length === 0 ? '' : fieldParts.length === 1 ? fieldParts[0] : fieldParts.join('');
        currentRow.push(v);
        fieldParts = [];
        fieldSize = 0;
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

        if (pendingCR) {
            pendingCR = false;
            if (chunk[0] === '\n') { const r = endRow(); if (r) yield r; i = 1; }
            else                   { const r = endRow(); if (r) yield r; }
        }
        if (pendingQuote) {
            pendingQuote = false;
            if (i < chunk.length && chunk[i] === '"') { addToField('"'); i++; }
            else                                      { inQuote = false; fieldSize = 0; }
        }

        while (i < chunk.length) {
            if (inQuote) {
                const qi = chunk.indexOf('"', i);
                if (qi === -1) {
                    addToField(chunk.slice(i));
                    i = chunk.length;
                } else {
                    if (qi > i) addToField(chunk.slice(i, qi));
                    if (qi + 1 < chunk.length) {
                        if (chunk[qi + 1] === '"') { addToField('"'); i = qi + 2; }
                        else                       { inQuote = false; fieldSize = 0; i = qi + 1; }
                    } else {
                        pendingQuote = true; i = chunk.length;
                    }
                }
            } else {
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
                } else {
                    if (fieldParts.length === 0) { inQuote = true; }
                    else                         { fieldParts.push('"'); }
                    i++;
                }
            }
        }

        bytesRead += chunk.length;
        onChunk?.(bytesRead, totalBytes);
        await new Promise<void>(resolve => setImmediate(resolve));
    }

    if (pendingQuote) { inQuote = false; fieldSize = 0; }
    if (fieldParts.length > 0 || currentRow.length > 0) {
        const r = endRow(); if (r) yield r;
    }
}

// Re-reads specific rows from a CSV file without loading everything into memory.
// Used for on-demand retrieval of cells stored truncated during initial load.
export async function readRowsFromFile(filePath: string, rowIndices: number[]): Promise<Map<number, string[]>> {
    const target = new Set(rowIndices);
    const result = new Map<number, string[]>();
    if (target.size === 0) return result;
    const maxRow = Math.max(...rowIndices);
    let isHeader = true;
    let dataRowIdx = 0;
    for await (const row of parseCsvRowsFromFile(filePath)) {
        if (isHeader) { isHeader = false; continue; }
        if (target.has(dataRowIdx)) {
            result.set(dataRowIdx, row);
            if (result.size === target.size) break;
        }
        if (dataRowIdx >= maxRow) break;
        dataRowIdx++;
    }
    return result;
}
