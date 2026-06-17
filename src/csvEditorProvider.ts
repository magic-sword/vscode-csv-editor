import * as vscode from 'vscode';
import { getWebviewContent } from './webview';

export class CsvEditorProvider implements vscode.CustomTextEditorProvider {

    public static register(context: vscode.ExtensionContext): vscode.Disposable {
        const provider = new CsvEditorProvider(context);
        return vscode.window.registerCustomEditorProvider('csvEditor.editor', provider, {
            webviewOptions: { retainContextWhenHidden: true }
        });
    }

    constructor(private readonly context: vscode.ExtensionContext) {}

    public async resolveCustomTextEditor(
        document: vscode.TextDocument,
        webviewPanel: vscode.WebviewPanel
    ): Promise<void> {
        webviewPanel.webview.options = { enableScripts: true };
        webviewPanel.webview.html = getWebviewContent();

        const sendContent = () => {
            webviewPanel.webview.postMessage({
                type: 'load',
                text: document.getText()
            });
        };

        webviewPanel.webview.onDidReceiveMessage(async (msg) => {
            if (msg.type === 'save') {
                const edit = new vscode.WorkspaceEdit();
                edit.replace(
                    document.uri,
                    new vscode.Range(0, 0, document.lineCount, 0),
                    msg.text
                );
                await vscode.workspace.applyEdit(edit);
            }
        });

        const changeSubscription = vscode.workspace.onDidChangeTextDocument(e => {
            if (e.document.uri.toString() === document.uri.toString()) {
                sendContent();
            }
        });

        webviewPanel.onDidDispose(() => changeSubscription.dispose());

        sendContent();
    }
}
