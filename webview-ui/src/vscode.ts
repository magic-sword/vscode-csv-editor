declare function acquireVsCodeApi(): { postMessage: (msg: unknown) => void };

// Must be called exactly once per webview lifetime.
export const vscode = acquireVsCodeApi();
