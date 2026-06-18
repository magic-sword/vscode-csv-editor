export type CellData = { v: string; lazy: boolean; json: boolean };

export type JsonPath = (string | number)[];

export type JsonNode =
    | { kind: 'scalar'; vtype: string; display: string; raw: string }
    | { kind: 'object'; entries: { key: string; preview: string; vtype: string }[]; total: number; shown: number }
    | { kind: 'array';  items:   { preview: string; vtype: string }[];              total: number; shown: number };

// Messages from extension → webview
export type ExtMsg =
    | { type: 'load'; headers: string[]; isLoading: boolean; rows?: CellData[][]; totalRows?: number; hasMore?: boolean }
    | { type: 'streamRows'; rows: CellData[][] }
    | { type: 'loadComplete'; totalRows: number; hasMore: boolean }
    | { type: 'appendRows'; rows: CellData[][]; hasMore: boolean }
    | { type: 'searchResults'; totalMatches: number; rows: CellData[][]; originalIndices: number[]; hasMore: boolean; pageStart: number }
    | { type: 'searchError'; message: string }
    | { type: 'cellContent'; row: number; col: number; text: string }
    | { type: 'cellJsonNode'; row: number; col: number; path: JsonPath; offset: number; node: JsonNode }
    | { type: 'jsonScalar'; row: number; col: number; path: JsonPath; raw: string; vtype: string }
    | { type: 'progress'; bytesRead: number; totalBytes: number }
    | { type: 'cellPreviewUpdated'; row: number; col: number; preview: string };
