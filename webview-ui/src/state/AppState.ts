import { CellData, ExtMsg } from '../types';

export type AppState = {
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

// Modal-only messages that bypass the reducer.
type ModalOnlyMsg = { type: 'cellContent' | 'cellJsonNode' | 'jsonScalar' };

// All ExtMsg that flow into the reducer, plus the webview-local updateCell action.
export type AppAction =
    | Exclude<ExtMsg, ModalOnlyMsg>
    | { type: 'updateCell'; displayedRi: number; col: number; cell: CellData };
