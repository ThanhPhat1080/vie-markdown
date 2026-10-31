import * as vscode from "vscode";
import { translateDocument } from "./pipeline";
import { buildPrompt } from "./prompt";
import { MAX_CHUNK_CHARS } from "./splitter";
import { TranslationError, translateChunk } from "./translator";

const KEY_SECRET = "vieMarkdown.geminiKey";
const API_KEY_URL = "https://aistudio.google.com/apikey";

async function askApiKey(context: vscode.ExtensionContext): Promise<string | undefined> {
  const key = await vscode.window.showInputBox({
    title: "vie-markdown: API key Gemini",
    prompt: `Dán API key Gemini của bạn. Lấy key miễn phí tại ${API_KEY_URL}`,
    password: true,
    ignoreFocusOut: true,
  });
  const trimmed = key?.trim();
  if (!trimmed) return undefined;
  await context.secrets.store(KEY_SECRET, trimmed);
  return trimmed;
}

async function getApiKey(context: vscode.ExtensionContext): Promise<string | undefined> {
  return (await context.secrets.get(KEY_SECRET)) ?? askApiKey(context);
}

async function translateActiveMarkdown(context: vscode.ExtensionContext): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== "markdown") {
    vscode.window.showErrorMessage("vie-markdown: hãy mở một file Markdown (.md) trước.");
    return;
  }
  const source = editor.document.getText();
  if (source.trim() === "") {
    vscode.window.showWarningMessage("vie-markdown: file trống, không có gì để dịch.");
    return;
  }

  const apiKey = await getApiKey(context);
  if (!apiKey) return;

  const config = vscode.workspace.getConfiguration("vieMarkdown");
  const model = config.get<string>("model", "gemini-2.5-flash");
  const systemPrompt = buildPrompt(config.get<string[]>("keepTerms", []));

  let authFailed = false;
  const result = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "vie-markdown: đang dịch",
      cancellable: true,
    },
    (progress, token) =>
      translateDocument(source, {
        maxChars: MAX_CHUNK_CHARS,
        isCancelled: () => token.isCancellationRequested,
        onProgress: (done, total) => progress.report({ message: `phần ${done}/${total}` }),
        translate: async (chunk) => {
          try {
            return await translateChunk(chunk, { apiKey, model, systemPrompt });
          } catch (e) {
            if (e instanceof TranslationError && e.kind === "auth") authFailed = true;
            throw e;
          }
        },
      }),
  );

  if (authFailed) await context.secrets.delete(KEY_SECRET);

  if (result.text !== "") {
    const doc = await vscode.workspace.openTextDocument({
      language: "markdown",
      content: result.text,
    });
    await vscode.window.showTextDocument(doc, {
      viewColumn: vscode.ViewColumn.Beside,
      preview: false,
    });
  }

  if (result.error) {
    const partial = result.text !== "" ? " Phần đã dịch nằm trong tab mới." : "";
    vscode.window.showErrorMessage(`vie-markdown: ${result.error}${partial}`);
  } else if (!result.completed) {
    vscode.window.showInformationMessage("vie-markdown: đã hủy. Phần đã dịch (nếu có) nằm trong tab mới.");
  } else if (result.warnings.length > 0) {
    vscode.window.showWarningMessage(
      `vie-markdown: bản dịch có thể lệch định dạng. ${result.warnings.join(" ")}`,
    );
  }
}

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("vieMarkdown.translate", () => translateActiveMarkdown(context)),
    vscode.commands.registerCommand("vieMarkdown.setApiKey", () => askApiKey(context)),
  );
}

export function deactivate(): void {}
