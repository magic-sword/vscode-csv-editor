import { useReducer, useRef, useCallback, useLayoutEffect, useState } from 'react';
import { vscode } from './vscode';
import { CellData } from './types';
import { initialState, reducer } from './state/reducer';
import { useExtensionMessages } from './hooks/useExtensionMessages';
import TableView from './components/TableView';
import Toolbar from './components/Toolbar';
import SearchBar from './components/SearchBar';
import LoadingOverlay from './components/LoadingOverlay';
import CellModal, { CellModalHandle } from './components/modal/CellModal';
import { useEffect } from 'react';

export default function App() {
    const [state, dispatch] = useReducer(reducer, initialState);
    const [searchQuery, setSearchQuery] = useState('');
    const [modal, setModal] = useState<{ displayedRi: number; ci: number } | null>(null);

    const modalRef = useRef<CellModalHandle>(null);

    const rowsRef    = useRef(state.rows);
    const indicesRef = useRef(state.rowOriginalIndices);
    useLayoutEffect(() => {
        rowsRef.current    = state.rows;
        indicesRef.current = state.rowOriginalIndices;
    });

    useEffect(() => { vscode.postMessage({ type: 'ready' }); }, []);

    useExtensionMessages(dispatch, modalRef);

    const getRows          = useCallback(() => rowsRef.current, []);
    const getOriginalIndex = useCallback((i: number) => indicesRef.current[i] ?? i, []);
    const updateCell       = useCallback((displayedRi: number, col: number, cell: CellData) =>
        dispatch({ type: 'updateCell', displayedRi, col, cell }), []);
    const openModal        = useCallback((displayedRi: number, ci: number) =>
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

    // ── Derived display values ─────────────────────────────────────────────────

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

    const progressPct = state.loadTotalBytes > 0
        ? Math.min(100, Math.round(state.loadBytesRead / state.loadTotalBytes * 100))
        : null;

    const progressStats = state.loadTotalBytes > 0
        ? `${(state.loadBytesRead / 1024 / 1024).toFixed(0)} MB / ${(state.loadTotalBytes / 1024 / 1024).toFixed(0)} MB  (${progressPct}%)  —  ${state.loadedCount} 行`
        : state.loadedCount > 0 ? `${state.loadedCount} 行読み込み済み...` : '';

    const showLoadMore = !state.isLoading && (state.isSearchMode ? state.searchHasMore : state.hasMore);
    const loadMoreLabel = (() => {
        const loaded = state.isSearchMode ? state.searchLoadedCount : state.loadedCount;
        const total  = state.isSearchMode ? state.searchTotalMatches : state.totalRows;
        return `さらに読み込む (${loaded} / ${total})`;
    })();

    return (
        <>
            {state.showLoading && (
                <LoadingOverlay
                    isLoading={state.isLoading}
                    progressPct={progressPct}
                    progressStats={progressStats}
                />
            )}

            {state.headers.length > 0 && (
                <>
                    <Toolbar statusText={statusText} isLoading={state.isLoading} />

                    <SearchBar
                        query={searchQuery}
                        enabled={!state.isLoading}
                        isSearchMode={state.isSearchMode}
                        searchError={state.searchError}
                        onChange={setSearchQuery}
                        onSearch={doSearch}
                        onClear={doClearSearch}
                    />

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
