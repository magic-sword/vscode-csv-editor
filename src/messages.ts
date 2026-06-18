import { JsonPath } from './jsonTree';

export type { JsonPath };

// Messages sent from the webview to the extension.
export type WebviewMsg =
    | { type: 'ready' }
    | { type: 'getCellContent'; row: number; col: number }
    | { type: 'editCell';       row: number; col: number; value: string }
    | { type: 'search';         query: string }
    | { type: 'clearSearch' }
    | { type: 'requestPage';       start: number }
    | { type: 'requestSearchPage'; start: number }
    | { type: 'getCellJson';    row: number; col: number }
    | { type: 'expandJsonPath'; row: number; col: number; path: JsonPath; offset?: number }
    | { type: 'getJsonScalar';  row: number; col: number; path: JsonPath }
    | { type: 'saveJsonPath';   row: number; col: number; path: JsonPath; value: unknown }
    | { type: 'save' };
