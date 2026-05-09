import * as vscode from 'vscode';
import { EmulatorViewProvider } from './EmulatorPanel';

export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            EmulatorViewProvider.viewId,
            new EmulatorViewProvider(context)
        )
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('cyberfidget.openEmulator', () => {
            vscode.commands.executeCommand('cyberfidget.emulatorView.focus');
        })
    );
}

export function deactivate() {}
