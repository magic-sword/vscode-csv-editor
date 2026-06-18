import {
    forwardRef, useImperativeHandle, useEffect, useRef, useState,
} from 'react';
import { vscode } from '../vscode';
import { CellData, JsonNode, JsonPath } from '../types';

// ── Types ──────────────────────────────────────────────────────────────────────

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

type InlineEdit = { path: JsonPath; raw: string; vtype: string };

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

// ── JsonTreeView ───────────────────────────────────────────────────────────────
// Renders one level of the JSON tree and handles navigation / inline editing.

function JsonTreeView({
    node, path, jsonRow, jsonCol, onNavigate, onRequestEdit, inlineEdit, onSaveEdit, onCancelEdit, onLoadMore,
}: {
    node: JsonNode;
    path: JsonPath;
    jsonRow: number;
    jsonCol: number;
    onNavigate: (path: JsonPath) => void;
    onRequestEdit: (path: JsonPath) => void;
    inlineEdit: InlineEdit | null;
    onSaveEdit: (path: JsonPath, value: unknown) => void;
    onCancelEdit: () => void;
    onLoadMore: (shown: number) => void;
}) {
    if (node.kind === 'scalar') {
        return (
            <div style={{ padding: '8px 6px', display: 'flex', alignItems: 'baseline', gap: 10 }}>
                <span className={`jval-${node.vtype}`}>{node.display}</span>
                {inlineEdit && JSON.stringify(inlineEdit.path) === JSON.stringify(path) ? (
                    <InlineEditor
                        raw={inlineEdit.raw}
                        vtype={inlineEdit.vtype}
                        onSave={v => onSaveEdit(path, v)}
                        onCancel={onCancelEdit}
                    />
                ) : (
                    <button className="jedit-btn jedit-btn-root" onClick={() => onRequestEdit(path)}>Edit</button>
                )}
            </div>
        );
    }

    const entries = node.kind === 'object' ? node.entries : null;
    const items   = node.kind === 'array'  ? node.items   : null;

    return (
        <>
            <ul className="jtree">
                {entries?.map(({ key, preview, vtype }) => {
                    const childPath = [...path, key];
                    const isNav = vtype === 'object' || vtype === 'array';
                    const isEditing = inlineEdit && JSON.stringify(inlineEdit.path) === JSON.stringify(childPath);
                    return (
                        <li key={key}>
                            <span className="jkey">&quot;{key}&quot;:</span>
                            {isEditing ? (
                                <InlineEditor
                                    raw={inlineEdit!.raw}
                                    vtype={inlineEdit!.vtype}
                                    onSave={v => onSaveEdit(childPath, v)}
                                    onCancel={onCancelEdit}
                                />
                            ) : isNav ? (
                                <span className="jnav" onClick={() => onNavigate(childPath)}>{preview}</span>
                            ) : (
                                <>
                                    <span className={`jval-${vtype}`}>{preview}</span>
                                    <button className="jedit-btn" onClick={() => onRequestEdit(childPath)}>Edit</button>
                                </>
                            )}
                        </li>
                    );
                })}
                {items?.map(({ preview, vtype }, idx) => {
                    const offset = node.shown - items.length;
                    const absIdx = offset + idx;
                    const childPath = [...path, absIdx];
                    const isNav = vtype === 'object' || vtype === 'array';
                    const isEditing = inlineEdit && JSON.stringify(inlineEdit.path) === JSON.stringify(childPath);
                    return (
                        <li key={absIdx}>
                            <span className="jindex">[{absIdx}]:</span>
                            {isEditing ? (
                                <InlineEditor
                                    raw={inlineEdit!.raw}
                                    vtype={inlineEdit!.vtype}
                                    onSave={v => onSaveEdit(childPath, v)}
                                    onCancel={onCancelEdit}
                                />
                            ) : isNav ? (
                                <span className="jnav" onClick={() => onNavigate(childPath)}>{preview}</span>
                            ) : (
                                <>
                                    <span className={`jval-${vtype}`}>{preview}</span>
                                    <button className="jedit-btn" onClick={() => onRequestEdit(childPath)}>Edit</button>
                                </>
                            )}
                        </li>
                    );
                })}
            </ul>
            {node.shown < node.total && (
                <button className="jmore-btn" onClick={() => onLoadMore(node.shown)}>
                    ↓ Load more ({node.shown} / {node.total} shown)
                </button>
            )}
        </>
    );

    // Suppress unused-variable warnings for jsonRow/jsonCol — they're only for key stability
    void jsonRow; void jsonCol;
}

// ── InlineEditor ───────────────────────────────────────────────────────────────

function InlineEditor({ raw, vtype, onSave, onCancel }: {
    raw: string; vtype: string;
    onSave: (value: unknown) => void;
    onCancel: () => void;
}) {
    const [value, setValue] = useState(raw);
    const isLong = raw.length > 60;

    const save = () => {
        let parsed: unknown;
        if (vtype === 'string') { parsed = value; }
        else { try { parsed = JSON.parse(value); } catch { parsed = value; } }
        onSave(parsed);
    };

    return (
        <span className="jinput-wrap">
            {isLong ? (
                <textarea
                    className="jinput"
                    rows={Math.min(Math.ceil(raw.length / 60), 6)}
                    style={{ resize: 'vertical' }}
                    value={value}
                    onChange={e => setValue(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Escape') onCancel(); if (e.key === 'Enter' && e.ctrlKey) save(); }}
                    autoFocus
                />
            ) : (
                <input
                    className="jinput"
                    type="text"
                    value={value}
                    onChange={e => setValue(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Escape') onCancel(); if (e.key === 'Enter') save(); }}
                    autoFocus
                />
            )}
            <span className="jinput-btns">
                <button className="jinput-save" onClick={save}>
                    {isLong ? 'Save (Ctrl+Enter)' : 'Save (Enter)'}
                </button>
                <button className="jinput-cancel" onClick={onCancel}>Cancel</button>
            </span>
        </span>
    );
}

// ── CellModal ──────────────────────────────────────────────────────────────────

const CellModal = forwardRef<CellModalHandle, Props>(function CellModal(
    { displayedRi, ci, headers, getRows, getOriginalIndex, onClose, onUpdateCell },
    ref,
) {
    const origRow = getOriginalIndex(displayedRi);
    const cell    = getRows()[displayedRi]?.[ci];

    // Text mode state
    const [textContent, setTextContent] = useState('');
    const [textLoading, setTextLoading] = useState(false);
    const [saveError, setSaveError] = useState('');

    // JSON tree state
    const [jsonPath, setJsonPath] = useState<JsonPath>([]);
    const [jsonNode, setJsonNode] = useState<JsonNode | null>(null);
    const [inlineEdit, setInlineEdit] = useState<InlineEdit | null>(null);
    const [savedNote, setSavedNote] = useState<JsonPath | null>(null);

    // Stable refs for use in imperative handle (avoids stale closures)
    const jsonRowRef  = useRef(-1);
    const jsonColRef  = useRef(-1);
    const jsonPathRef = useRef<JsonPath>([]);

    const cellCacheRef = useRef<Map<string, string>>(new Map());

    const mode = cell?.lazy && cell?.json ? 'json' : 'text';

    // Initialize when cell changes (modal opened for a new cell)
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

    // ── Text mode: save ──
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

    // ── JSON tree: navigation ──
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
        // Update the displayed preview in the node
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

    const title = `${headers[ci]}  (行 ${origRow + 1})`;

    return (
        <div className="modal-overlay open" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="modal">
                <div className="modal-header">
                    <span className="modal-title">{title}</span>
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
                                        jsonRow={jsonRowRef.current}
                                        jsonCol={jsonColRef.current}
                                        onNavigate={navigateTo}
                                        onRequestEdit={requestEdit}
                                        inlineEdit={inlineEdit}
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
