import { useReducer, useEffect, useRef, useCallback, useLayoutEffect, useState } from 'react';
import { vscode } from './vscode';
import { CellData, ExtMsg, JsonNode, JsonPath } from './types';
import TableView from './components/TableView';
import CellModal, { CellModalHandle } from './components/CellModal';

// ── State & Reducer ────────────────────────────────────────────────────────────

type AppState = {
    headers: string[];
    rows: CellData[][];
    rowOriginalIndices: number[];
    totalRows: number;
    loadedCount: number;
    hasMore: boolean;
    isLoading: boolean;
    loadBytesRead: number;
    loadTotalBytes: number;
    isSearchMode: boolean;
    searchTotalMatches: number;
    searchLoadedCount: number;
    searchHasMore: boolean;
    searchError: string;
    showLoading: boolean;
};

type AppAction =
    | { type: 'load'; headers: string[]; isLoading: boolean; rows?: CellData[][]; totalRows?: number; hasMore?: boolean }
    | { type: 'streamRows'; rows: CellData[][] }
    | { type: 'loadComplete'; totalRows: number; hasMore: boolean }
    | { type: 'appendRows'; rows: CellData[][]; hasMore: boolean }
    | { type: 'searchResults'; totalMatches: number; rows: CellData[][]; originalIndices: number[]; hasMore: boolean; pageStart: number }
    | { type: 'searchError'; message: string }
    | { type: 'progress'; bytesRead: number; totalBytes: number }
    | { type: 'cellPreviewUpdated'; row: number; col: number; preview: string }
    | { type: 'updateCell'; displayedRi: number; col: number; cell: CellData };

const initialState: AppState = {
    headers: [], rows: [], rowOriginalIndices: [],
    totalRows: 0, loadedCount: 0, hasMore: false,
    isLoading: false, loadBytesRead: 0, loadTotalBytes: 0,
    isSearchMode: false, searchTotalMatches: 0, searchLoadedCount: 0, searchHasMore: false,
    searchError: '', showLoading: true,
};

function reducer(state: AppState, action: AppAction): AppState {
    switch (action.type) {
        case 'load': {
            const rows = action.rows ?? [];
            return {
                ...initialState,
                showLoading: !!action.isLoading,
                isLoading: !!action.isLoading,
                headers: action.headers,
                rows,
                rowOriginalIndices: rows.map((_, i) => i),
                totalRows: action.totalRows ?? 0,
                hasMore: action.hasMore ?? false,
                loadedCount: rows.length,
            };
        }
        case 'streamRows': {
            const start = state.rows.length;
            return {
                ...state,
                rows: [...state.rows, ...action.rows],
                rowOriginalIndices: [...state.rowOriginalIndices, ...action.rows.map((_, i) => start + i)],
                loadedCount: state.rows.length + action.rows.length,
            };
        }
        case 'loadComplete':
            return { ...state, isLoading: false, showLoading: false, totalRows: action.totalRows, hasMore: action.hasMore };
        case 'appendRows': {
            const start = state.rows.length;
            return {
                ...state,
                rows: [...state.rows, ...action.rows],
                rowOriginalIndices: [...state.rowOriginalIndices, ...action.rows.map((_, i) => start + i)],
                hasMore: action.hasMore,
                loadedCount: state.rows.length + action.rows.length,
            };
        }
        case 'searchResults': {
            const prevRows    = action.pageStart === 0 ? [] : state.rows;
            const prevIndices = action.pageStart === 0 ? [] : state.rowOriginalIndices;
            const newRows     = [...prevRows, ...action.rows];
            const newIndices  = [...prevIndices, ...action.originalIndices];
            return {
                ...state,
                isSearchMode: true,
                searchTotalMatches: action.totalMatches,
                searchHasMore: action.hasMore,
                searchError: '',
                rows: newRows,
                rowOriginalIndices: newIndices,
                searchLoadedCount: newRows.length,
            };
        }
        case 'searchError':
            return { ...state, searchError: action.message };
        case 'progress':
            return { ...state, loadBytesRead: action.bytesRead, loadTotalBytes: action.totalBytes };
        case 'cellPreviewUpdated': {
            const displayedRi = state.rowOriginalIndices.indexOf(action.row);
            if (displayedRi < 0) return state;
            const newRows = [...state.rows];
            newRows[displayedRi] = state.rows[displayedRi].map((cell, ci) =>
                ci === action.col ? { ...cell, v: action.preview } : cell);
            return { ...state, rows: newRows };
        }
        case 'updateCell': {
            const newRows = [...state.rows];
            newRows[action.displayedRi] = [...state.rows[action.displayedRi]];
            newRows[action.displayedRi][action.col] = action.cell;
            return { ...state, rows: newRows };
        }
    }
}

// ── App ────────────────────────────────────────────────────────────────────────

export default function App() {
    const [state, dispatch] = useReducer(reducer, initialState);
    const [searchQuery, setSearchQuery] = useState('');
    const [modal, setModal] = useState<{ displayedRi: number; ci: number } | null>(null);

    const modalRef = useRef<CellModalHandle>(null);

    // Keep always-current refs so modal callbacks never go stale.
    const rowsRef    = useRef(state.rows);
    const indicesRef = useRef(state.rowOriginalIndices);
    useLayoutEffect(() => {
        rowsRef.current    = state.rows;
        indicesRef.current = state.rowOriginalIndices;
    });

    // Send 'ready' once on mount so the extension starts loading the file.
    useEffect(() => { vscode.postMessage({ type: 'ready' }); }, []);

    // Route all extension messages to the reducer or modal handle.
    useEffect(() => {
        const handler = (event: MessageEvent<ExtMsg>) => {
            const data = event.data;
            switch (data.type) {
                case 'load':
                    dispatch(data);
                    modalRef.current?.clearCache();
                    break;
                case 'streamRows':
                case 'loadComplete':
                case 'appendRows':
                case 'searchResults':
                case 'searchError':
                case 'progress':
                case 'cellPreviewUpdated':
                    dispatch(data as AppAction);
                    break;
                case 'cellContent':  modalRef.current?.handleCellContent(data);  break;
                case 'cellJsonNode': modalRef.current?.handleJsonNode(data);      break;
                case 'jsonScalar':   modalRef.current?.handleJsonScalar(data);    break;
            }
        };
        window.addEventListener('message', handler as EventListener);
        return () => window.removeEventListener('message', handler as EventListener);
    }, []);

    const getRows         = useCallback(() => rowsRef.current, []);
    const getOriginalIndex = useCallback((i: number) => indicesRef.current[i] ?? i, []);
    const updateCell      = useCallback((displayedRi: number, col: number, cell: CellData) =>
        dispatch({ type: 'updateCell', displayedRi, col, cell }), []);

    const openModal = useCallback((displayedRi: number, ci: number) =>
        setModal({ displayedRi, ci }), []);

    const doSearch = () => {
        dispatch({ type: 'searchError', message: '' });
        vscode.postMessage({ type: 'search', query: searchQuery.trim() });
    };

    const doClearSearch = () => {
        setSearchQuery('');
        vscode.postMessage({ type: 'clearSearch' });
    };

    const doLoadMore = () => {
        if (state.isSearchMode) {
            vscode.postMessage({ type: 'requestSearchPage', start: state.searchLoadedCount });
        } else {
            vscode.postMessage({ type: 'requestPage', start: state.loadedCount });
        }
    };

    // ── Status text ──
    const statusText = (() => {
        if (state.isSearchMode) {
            const shown = state.searchHasMore
                ? `${state.searchLoadedCount} / ${state.searchTotalMatches}`
                : String(state.searchTotalMatches);
            return `${shown} 件ヒット (全 ${state.totalRows} 行, ${state.headers.length} 列)`;
        }
        if (state.isLoading) return `${state.loadedCount} 行表示中`;
        const shown = state.hasMore ? `${state.loadedCount} / ${state.totalRows}` : String(state.totalRows);
        return `${shown} 行, ${state.headers.length} 列`;
    })();

    // ── Loading progress ──
    const progressPct = state.loadTotalBytes > 0
        ? Math.min(100, Math.round(state.loadBytesRead / state.loadTotalBytes * 100))
        : null;
    const progressStats = state.loadTotalBytes > 0
        ? `${(state.loadBytesRead / 1024 / 1024).toFixed(0)} MB / ${(state.loadTotalBytes / 1024 / 1024).toFixed(0)} MB  (${progressPct}%)  —  ${state.loadedCount} 行`
        : state.loadedCount > 0 ? `${state.loadedCount} 行読み込み済み...` : '';

    // ── Load-more button ──
    const showLoadMore = !state.isLoading && (state.isSearchMode ? state.searchHasMore : state.hasMore);
    const loadMoreLabel = (() => {
        const loaded = state.isSearchMode ? state.searchLoadedCount : state.loadedCount;
        const total  = state.isSearchMode ? state.searchTotalMatches : state.totalRows;
        return `さらに読み込む (${loaded} / ${total})`;
    })();

    const searchEnabled = !state.isLoading;

    return (
        <>
            {/* Loading overlay — shown until loadComplete */}
            {state.showLoading && (
                <div className="loading-overlay">
                    <div className="loading-content">
                        <div className="loading-title">
                            {state.isLoading ? 'CSV を読み込み中...' : 'Loading CSV...'}
                        </div>
                        <div className="loading-progress-track">
                            <div
                                className={`loading-progress-fill${progressPct !== null ? ' determinate' : ''}`}
                                style={progressPct !== null ? { '--pct': `${progressPct}%` } as React.CSSProperties : undefined}
                            />
                        </div>
                        <div className="loading-stats">{progressStats}</div>
                    </div>
                </div>
            )}

            {/* Main UI — rendered even during loading so rows stream in behind overlay */}
            {state.headers.length > 0 && (
                <>
                    <div id="toolbar">
                        <span id="status">
                            {statusText}
                            {state.isLoading && <span className="loading-indicator"> 読み込み中...</span>}
                        </span>
                    </div>

                    <div id="search-bar">
                        <input
                            id="search-input"
                            type="text"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            onKeyDown={e => {
                                if (e.key === 'Enter') doSearch();
                                if (e.key === 'Escape') doClearSearch();
                            }}
                            disabled={!searchEnabled}
                            placeholder={searchEnabled
                                ? '例: label = "cat"  /  score >= 0.9 AND name contains "Alice"  /  (a = "x" OR b = "y") AND c != "z"'
                                : '読み込み完了後に検索できます'}
                        />
                        <button className="search-btn primary" onClick={doSearch} disabled={!searchEnabled}>検索</button>
                        {state.isSearchMode && (
                            <button className="search-btn" onClick={doClearSearch}>✕ クリア</button>
                        )}
                        {state.searchError && <span className="search-error">{state.searchError}</span>}
                    </div>

                    <TableView
                        headers={state.headers}
                        rows={state.rows}
                        rowOriginalIndices={state.rowOriginalIndices}
                        onOpenModal={openModal}
                        showLoadMore={showLoadMore}
                        loadMoreLabel={loadMoreLabel}
                        colCount={state.headers.length}
                        onLoadMore={doLoadMore}
                    />
                </>
            )}

            {/* Cell editing modal */}
            {modal !== null && (
                <CellModal
                    ref={modalRef}
                    displayedRi={modal.displayedRi}
                    ci={modal.ci}
                    headers={state.headers}
                    getRows={getRows}
                    getOriginalIndex={getOriginalIndex}
                    onClose={() => setModal(null)}
                    onUpdateCell={updateCell}
                />
            )}
        </>
    );
}
