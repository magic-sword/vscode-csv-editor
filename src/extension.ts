import * as vscode from 'vscode';
import { openCsvEditor } from './csvEditorProvider';

export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.commands.registerCommand('csvEditor.openTable', (uri?: vscode.Uri) => {
            openCsvEditor(context, uri);
        })
    );
}

export function deactivate() {}
