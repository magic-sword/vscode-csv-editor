import { AppState, AppAction } from './AppState';

export const initialState: AppState = {
    headers: [], rows: [], rowOriginalIndices: [],
    totalRows: 0, loadedCount: 0, hasMore: false,
    isLoading: false, loadBytesRead: 0, loadTotalBytes: 0,
    isSearchMode: false, searchTotalMatches: 0, searchLoadedCount: 0, searchHasMore: false,
    searchError: '', showLoading: true,
};

export function reducer(state: AppState, action: AppAction): AppState {
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
