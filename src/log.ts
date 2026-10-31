import * as vscode from "vscode";

export interface Logger {
  info(message: string): void;
  show(): void;
  dispose(): void;
}

/** Output channel "vie-markdown". Never log API keys here. */
export function createOutputLogger(): Logger {
  const channel = vscode.window.createOutputChannel("vie-markdown");
  const stamp = () => new Date().toISOString().slice(11, 19);
  return {
    info: (message) => channel.appendLine(`[${stamp()}] ${message}`),
    show: () => channel.show(true),
    dispose: () => channel.dispose(),
  };
}
