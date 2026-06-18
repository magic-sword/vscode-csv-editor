import {
    forwardRef, useImperativeHandle, useEffect, useRef, useState,
} from 'react';
import { vscode } from '../../vscode';
import { CellData, JsonNode, JsonPath } from '../../types';
import { InlineEdit } from './types';
import JsonTreeView from './JsonTreeView';

// ── Public handle ──────────────────────────────────────────────────────────────

export interface CellModalHandle {
    clearCache: () => void;
    handleCellContent: (data: { row: number; col: number; text: string }) => void;
    handleJsonNode: (data: { row: number; col: number; path: JsonPath; offset: number; node: JsonNode }) => void;
    handleJsonScalar: (data: { row: number; col: number; path: JsonPath; raw: string; vtype: string }) => void;
}

interface Props {
    displayedRi: number;
    ci: number;
    headers: string[];
    getRows: () => CellData[][];
    getOriginalIndex: (i: number) => number;
    onClose: () => void;
    onUpdateCell: (displayedRi: number, col: number, cell: CellData) => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function looksLikeJson(s: string) {
    const t = s.trim();
    return (t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'));
}

function formatForDisplay(raw: string): string {
    if (looksLikeJson(raw)) {
        try { return JSON.stringify(JSON.parse(raw), null, 2); } catch { /* fall through */ }
    }
    return raw;
}

// ── CellModal ──────────────────────────────────────────────────────────────────

const CellModal = forwardRef<CellModalHandle, Props>(function CellModal(
    { displayedRi, ci, headers, getRows, getOriginalIndex, onClose, onUpdateCell },
    ref,
) {
    const origRow = getOriginalIndex(displayedRi);
    const cell    = getRows()[displayedRi]?.[ci];

    const [textContent, setTextContent] = useState('');
    const [textLoading, setTextLoading] = useState(false);
    const [saveError,   setSaveError]   = useState('');
    const [jsonPath,    setJsonPath]    = useState<JsonPath>([]);
    const [jsonNode,    setJsonNode]    = useState<JsonNode | null>(null);
    const [inlineEdit,  setInlineEdit]  = useState<InlineEdit | null>(null);
    const [savedNote,   setSavedNote]   = useState<JsonPath | null>(null);

    // Refs keep modal callbacks free of stale closures.
    const jsonRowRef  = useRef(-1);
    const jsonColRef  = useRef(-1);
    const jsonPathRef = useRef<JsonPath>([]);
    const cellCacheRef = useRef<Map<string, string>>(new Map());

    const mode = cell?.lazy && cell?.json ? 'json' : 'text';

    useEffect(() => {
        setSaveError('');
        setInlineEdit(null);
        if (!cell) return;

        if (mode === 'json') {
            jsonRowRef.current  = origRow;
            jsonColRef.current  = ci;
            jsonPathRef.current = [];
            setJsonPath([]);
            setJsonNode(null);
            vscode.postMessage({ type: 'getCellJson', row: origRow, col: ci });
        } else {
            const key = `${origRow},${ci}`;
            if (cell.lazy && !cellCacheRef.current.has(key)) {
                setTextLoading(true);
                setTextContent('');
                vscode.postMessage({ type: 'getCellContent', row: origRow, col: ci });
            } else {
                const raw = cell.lazy ? cellCacheRef.current.get(key)! : cell.v;
                setTextLoading(false);
                setTextContent(formatForDisplay(raw));
            }
        }
    }, [origRow, ci]); // eslint-disable-line react-hooks/exhaustive-deps

    useImperativeHandle(ref, () => ({
        clearCache: () => cellCacheRef.current.clear(),

        handleCellContent: (data) => {
            cellCacheRef.current.set(`${data.row},${data.col}`, data.text);
            if (data.row === origRow && data.col === ci) {
                setTextLoading(false);
                setTextContent(formatForDisplay(data.text));
            }
        },

        handleJsonNode: (data) => {
            if (data.row !== jsonRowRef.current || data.col !== jsonColRef.current) return;
            if (JSON.stringify(data.path) !== JSON.stringify(jsonPathRef.current)) return;
            setJsonNode(prev => {
                if (data.offset === 0 || !prev) return data.node;
                if (prev.kind === 'array' && data.node.kind === 'array')
                    return { ...prev, items: [...prev.items, ...data.node.items], shown: data.node.shown };
                if (prev.kind === 'object' && data.node.kind === 'object')
                    return { ...prev, entries: [...prev.entries, ...data.node.entries], shown: data.node.shown };
                return data.node;
            });
        },

        handleJsonScalar: (data) => {
            if (data.row !== jsonRowRef.current || data.col !== jsonColRef.current) return;
            setInlineEdit({ path: data.path, raw: data.raw, vtype: data.vtype });
        },
    }), [origRow, ci]);

    // ── Text mode ──────────────────────────────────────────────────────────────

    const handleTextSave = () => {
        const key = `${origRow},${ci}`;
        let value = textContent;
        const originalRaw = cell!.lazy ? (cellCacheRef.current.get(key) ?? '') : cell!.v;
        if (looksLikeJson(originalRaw)) {
            try { value = JSON.stringify(JSON.parse(value)); }
            catch (e) { setSaveError(`Invalid JSON: ${(e as Error).message}`); return; }
        }
        const isJson = looksLikeJson(value);
        if (cell!.lazy) {
            cellCacheRef.current.set(key, value);
            onUpdateCell(displayedRi, ci, { v: value.slice(0, 80), lazy: true, json: isJson });
        } else {
            onUpdateCell(displayedRi, ci, { v: value, lazy: false, json: isJson });
        }
        vscode.postMessage({ type: 'editCell', row: origRow, col: ci, value });
        onClose();
    };

    // ── JSON tree navigation ───────────────────────────────────────────────────

    const navigateTo = (path: JsonPath) => {
        jsonPathRef.current = path;
        setJsonPath(path);
        setJsonNode(null);
        setInlineEdit(null);
        vscode.postMessage({ type: 'expandJsonPath', row: jsonRowRef.current, col: jsonColRef.current, path });
    };

    const requestEdit = (path: JsonPath) => {
        vscode.postMessage({ type: 'getJsonScalar', row: jsonRowRef.current, col: jsonColRef.current, path });
    };

    const saveEdit = (path: JsonPath, value: unknown) => {
        setInlineEdit(null);
        const newVtype = value === null ? 'null' : typeof value;
        setJsonNode(prev => {
            if (!prev || prev.kind === 'scalar') return prev;
            if (prev.kind === 'object') {
                const lastKey = path[path.length - 1] as string;
                return {
                    ...prev,
                    entries: prev.entries.map(e =>
                        e.key === lastKey
                            ? { ...e, vtype: newVtype, preview: typeof value === 'string' ? JSON.stringify(value) : String(value) }
                            : e,
                    ),
                };
            }
            if (prev.kind === 'array') {
                const idx = path[path.length - 1] as number;
                const offset = prev.shown - prev.items.length;
                const localIdx = idx - offset;
                return {
                    ...prev,
                    items: prev.items.map((item, i) =>
                        i === localIdx
                            ? { ...item, vtype: newVtype, preview: typeof value === 'string' ? JSON.stringify(value) : String(value) }
                            : item,
                    ),
                };
            }
            return prev;
        });
        setSavedNote(path);
        setTimeout(() => setSavedNote(null), 1500);
        vscode.postMessage({ type: 'saveJsonPath', row: jsonRowRef.current, col: jsonColRef.current, path, value });
    };

    const loadMore = (shown: number) => {
        vscode.postMessage({ type: 'expandJsonPath', row: jsonRowRef.current, col: jsonColRef.current, path: jsonPathRef.current, offset: shown });
    };

    // ── Render ─────────────────────────────────────────────────────────────────

    return (
        <div className="modal-overlay open" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="modal">
                <div className="modal-header">
                    <span className="modal-title">{headers[ci]}  (行 {origRow + 1})</span>
                    <button className="modal-close" onClick={onClose}>✕</button>
                </div>

                {mode === 'text' ? (
                    <>
                        <textarea
                            className="modal-textarea"
                            value={textLoading ? 'Loading...' : textContent}
                            onChange={e => { setSaveError(''); setTextContent(e.target.value); }}
                            disabled={textLoading}
                            spellCheck={false}
                            autoFocus={!textLoading}
                        />
                        {saveError && <div className="modal-error">{saveError}</div>}
                        <div className="modal-footer">
                            <button className="btn-cancel" onClick={onClose}>Cancel</button>
                            <button className="btn-save" onClick={handleTextSave} disabled={textLoading}>Save Cell</button>
                        </div>
                    </>
                ) : (
                    <>
                        <div className="json-breadcrumb">
                            <span className="bc-item" onClick={() => navigateTo([])}>root</span>
                            {jsonPath.map((seg, idx) => (
                                <span key={idx}>
                                    <span className="bc-sep"> › </span>
                                    <span className="bc-item" onClick={() => navigateTo(jsonPath.slice(0, idx + 1))}>
                                        {String(seg)}
                                    </span>
                                </span>
                            ))}
                        </div>
                        <div className="json-tree-view">
                            {jsonNode === null ? (
                                <span style={{ color: 'var(--vscode-descriptionForeground)', padding: '8px 0', display: 'block' }}>
                                    Loading…
                                </span>
                            ) : (
                                <>
                                    <JsonTreeView
                                        node={jsonNode}
                                        path={jsonPath}
                                        inlineEdit={inlineEdit}
                                        onNavigate={navigateTo}
                                        onRequestEdit={requestEdit}
                                        onSaveEdit={saveEdit}
                                        onCancelEdit={() => setInlineEdit(null)}
                                        onLoadMore={loadMore}
                                    />
                                    {savedNote !== null && (
                                        <span className="jsaved-note">✓ Saved</span>
                                    )}
                                </>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
});

export default CellModal;
