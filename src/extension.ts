import * as vscode from "vscode";
import { Logger, createOutputLogger } from "./log";
import { Notification, NotificationAction, describeForLog, describeOutcome } from "./messages";
import { translateDocument } from "./pipeline";
import { buildPrompt } from "./prompt";
import { MAX_CHUNK_CHARS } from "./splitter";
import { translateChunk } from "./translator";

const KEY_SECRET = "vieMarkdown.geminiKey";
const API_KEY_URL = "https://aistudio.google.com/apikey";

const ACTION_LABEL: Record<NotificationAction, string> = {
  enterKey: "Nhập key mới",
  openModelSetting: "Mở cài đặt model",
  openLog: "Xem chi tiết",
};

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

async function resolveDocument(uri?: vscode.Uri): Promise<vscode.TextDocument | undefined> {
  if (uri instanceof vscode.Uri) {
    return (
      vscode.workspace.textDocuments.find((d) => d.uri.toString() === uri.toString()) ??
      (await vscode.workspace.openTextDocument(uri))
    );
  }
  return vscode.window.activeTextEditor?.document;
}

/** fetch wrapper that logs request status and timing. The key is only in a header, never logged. */
function loggingFetch(logger: Logger): typeof fetch {
  return async (input, init) => {
    const started = Date.now();
    const model = /models\/([^:/]+)/.exec(String(input))?.[1] ?? "?";
    logger.info(`Gửi yêu cầu tới model ${model}…`);
    try {
      const res = await fetch(input, init);
      logger.info(`→ HTTP ${res.status} (${Date.now() - started} ms)`);
      if (!res.ok) logger.info(`  nội dung lỗi: ${(await res.clone().text()).slice(0, 300)}`);
      return res;
    } catch (e) {
      logger.info(`→ không nhận được phản hồi sau ${Date.now() - started} ms: ${e instanceof Error ? e.message : String(e)}`);
      throw e;
    }
  };
}

async function showNotification(n: Notification, context: vscode.ExtensionContext, logger: Logger): Promise<void> {
  const text = `vie-markdown: ${n.message}`;
  const labels = n.actions.map((a) => ACTION_LABEL[a]);
  const choice =
    n.level === "error"
      ? await vscode.window.showErrorMessage(text, ...labels)
      : n.level === "warning"
        ? await vscode.window.showWarningMessage(text, ...labels)
        : await vscode.window.showInformationMessage(text, ...labels);
  const action = n.actions.find((a) => ACTION_LABEL[a] === choice);
  if (action === "enterKey") {
    if (await askApiKey(context)) {
      vscode.window.showInformationMessage("vie-markdown: đã lưu API key mới. Bấm VIE để dịch lại.");
    }
  } else if (action === "openModelSetting") {
    await vscode.commands.executeCommand("workbench.action.openSettings", "vieMarkdown.model");
  } else if (action === "openLog") {
    logger.show();
  }
}

async function translateMarkdown(context: vscode.ExtensionContext, logger: Logger, uri?: vscode.Uri): Promise<void> {
  const document = await resolveDocument(uri);
  if (!document || document.languageId !== "markdown") {
    vscode.window.showErrorMessage("vie-markdown: hãy mở một file Markdown (.md) trước.");
    return;
  }
  const source = document.getText();
  if (source.trim() === "") {
    vscode.window.showWarningMessage("vie-markdown: file trống, không có gì để dịch.");
    return;
  }

  const apiKey = await getApiKey(context);
  if (!apiKey) {
    logger.info("Người dùng đóng ô nhập API key, hủy dịch.");
    vscode.window.showInformationMessage(
      `vie-markdown: chưa nhập API key nên chưa thể dịch. Lấy key miễn phí tại ${API_KEY_URL}`,
    );
    return;
  }

  const config = vscode.workspace.getConfiguration("vieMarkdown");
  const model = config.get<string>("model", "gemini-3.5-flash-lite");
  const systemPrompt = buildPrompt(config.get<string[]>("keepTerms", []));
  const fetchFn = loggingFetch(logger);
  logger.info(`Bắt đầu dịch ${document.fileName} (${source.length} ký tự) bằng model ${model}.`);

  const result = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "vie-markdown: đang dịch",
      cancellable: true,
    },
    (progress, token) => {
      progress.report({ message: "đang gửi tới Gemini…" });
      const controller = new AbortController();
      token.onCancellationRequested(() => controller.abort());
      return translateDocument(source, {
        maxChars: MAX_CHUNK_CHARS,
        isCancelled: () => token.isCancellationRequested,
        onProgress: (done, total) => progress.report({ message: `đã dịch ${done}/${total} phần` }),
        translate: (chunk) => translateChunk(chunk, { apiKey, model, systemPrompt, fetchFn, signal: controller.signal }),
      });
    },
  );

  for (const line of describeForLog(result)) logger.info(line);
  if (result.errorKind === "auth") await context.secrets.delete(KEY_SECRET);

  if (result.text !== "") {
    const doc = await vscode.workspace.openTextDocument({ language: "markdown", content: result.text });
    await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.Beside, preview: false });
  }

  for (const n of describeOutcome(result, { model })) void showNotification(n, context, logger);
}

export function activate(context: vscode.ExtensionContext): void {
  const logger = createOutputLogger();
  context.subscriptions.push(
    { dispose: () => logger.dispose() },
    vscode.commands.registerCommand("vieMarkdown.translate", (uri?: vscode.Uri) =>
      translateMarkdown(context, logger, uri),
    ),
    vscode.commands.registerCommand("vieMarkdown.setApiKey", async () => {
      if (await askApiKey(context)) vscode.window.showInformationMessage("vie-markdown: đã lưu API key.");
    }),
  );
}

export function deactivate(): void {}
