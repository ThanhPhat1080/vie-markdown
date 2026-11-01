import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import { dotenvKey, parseDotenv } from "./dotenv";
import { Logger, createOutputLogger } from "./log";
import { Notification, NotificationAction, describeForLog, describeOutcome } from "./messages";
import { translateDocument } from "./pipeline";
import { buildPrompt } from "./prompt";
import { MAX_CHUNK_CHARS } from "./splitter";
import { DEFAULT_GROQ_MODEL, translateChunkGroq } from "./groq";
import { buildProviderChoices, pickApiKey, providerName } from "./providers";
import { Provider, translateChunk } from "./translator";

const SECRET_KEY: Record<Provider, string> = { gemini: "vieMarkdown.geminiKey", groq: "vieMarkdown.groqKey" };
const KEY_SETTING: Record<Provider, string> = { gemini: "geminiApiKey", groq: "groqApiKey" };
const KEY_URL: Record<Provider, string> = {
  gemini: "https://aistudio.google.com/apikey",
  groq: "https://console.groq.com/keys",
};
const LAST_PROVIDER_STATE = "vieMarkdown.lastProvider";

const ACTION_LABEL: Record<NotificationAction, string> = {
  enterKey: "Nhập key mới",
  enterGroqKey: "Nhập key Groq mới",
  openGroqModelSetting: "Mở cài đặt model Groq",
  openModelSetting: "Mở cài đặt model",
  openLog: "Xem chi tiết",
};

const settings = () => vscode.workspace.getConfiguration("vieMarkdown");

/** Keys from <extension>/.env, only when launched from source (F5), so a published build never reads it. */
function devEnvKey(context: vscode.ExtensionContext, provider: Provider): string | undefined {
  if (context.extensionMode !== vscode.ExtensionMode.Development) return undefined;
  try {
    const text = fs.readFileSync(path.join(context.extensionPath, ".env"), "utf8");
    return dotenvKey(provider, parseDotenv(text));
  } catch {
    return undefined;
  }
}

async function storedKey(context: vscode.ExtensionContext, provider: Provider): Promise<string | undefined> {
  return pickApiKey(
    settings().get<string>(KEY_SETTING[provider]),
    await context.secrets.get(SECRET_KEY[provider]),
    devEnvKey(context, provider),
  );
}

/** Ask for a key and save it to the user's settings. */
async function askApiKey(provider: Provider): Promise<string | undefined> {
  const name = providerName(provider);
  const key = await vscode.window.showInputBox({
    title: `vie-markdown: API key ${name}`,
    prompt: `Dán API key ${name} của bạn. Lấy key miễn phí tại ${KEY_URL[provider]}`,
    password: true,
    ignoreFocusOut: true,
  });
  const trimmed = key?.trim();
  if (!trimmed) return undefined;
  await settings().update(KEY_SETTING[provider], trimmed, vscode.ConfigurationTarget.Global);
  return trimmed;
}

function currentModels(): Record<Provider, string> {
  return {
    gemini: settings().get<string>("model", "gemini-3.5-flash-lite"),
    groq: settings().get<string>("groqModel", DEFAULT_GROQ_MODEL),
  };
}

async function chooseProvider(context: vscode.ExtensionContext): Promise<Provider | undefined> {
  const hasKey = {
    gemini: (await storedKey(context, "gemini")) !== undefined,
    groq: (await storedKey(context, "groq")) !== undefined,
  };
  const choices = buildProviderChoices({
    models: currentModels(),
    hasKey,
    last: context.globalState.get<Provider>(LAST_PROVIDER_STATE),
  });
  const picked = await vscode.window.showQuickPick(
    choices.map((c) => ({ label: c.label, description: c.description, provider: c.provider })),
    { title: "vie-markdown: chọn model để dịch", placeHolder: "Chọn model rồi nhấn Enter" },
  );
  if (!picked) return undefined;
  await context.globalState.update(LAST_PROVIDER_STATE, picked.provider);
  return picked.provider;
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
    const model = /models\/([^:/]+)/.exec(String(input))?.[1] ?? (String(input).includes("groq.com") ? "Groq" : "?");
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
    if (await askApiKey("gemini")) {
      vscode.window.showInformationMessage("vie-markdown: đã lưu API key mới. Bấm VIE để dịch lại.");
    }
  } else if (action === "enterGroqKey") {
    if (await askApiKey("groq")) {
      vscode.window.showInformationMessage("vie-markdown: đã lưu API key Groq mới. Bấm VIE để dịch lại.");
    }
  } else if (action === "openGroqModelSetting") {
    await vscode.commands.executeCommand("workbench.action.openSettings", "vieMarkdown.groqModel");
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

  const provider = await chooseProvider(context);
  if (!provider) return;
  const name = providerName(provider);
  const apiKey = (await storedKey(context, provider)) ?? (await askApiKey(provider));
  if (!apiKey) {
    logger.info(`Người dùng đóng ô nhập API key ${name}, hủy dịch.`);
    vscode.window.showInformationMessage(
      `vie-markdown: chưa nhập API key ${name} nên chưa thể dịch. Lấy key miễn phí tại ${KEY_URL[provider]}`,
    );
    return;
  }

  const models = currentModels();
  const model = models[provider];
  const systemPrompt = buildPrompt(settings().get<string[]>("keepTerms", []));
  const fetchFn = loggingFetch(logger);
  const translateOne = provider === "groq" ? translateChunkGroq : translateChunk;
  if (devEnvKey(context, provider) === apiKey) logger.info("Dùng API key đọc từ .env (chế độ phát triển).");
  logger.info(`Bắt đầu dịch ${document.fileName} (${source.length} ký tự) bằng ${name}, model ${model}.`);

  const result = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "vie-markdown: đang dịch",
      cancellable: true,
    },
    (progress, token) => {
      progress.report({ message: `đang gửi tới ${name}…` });
      const controller = new AbortController();
      token.onCancellationRequested(() => controller.abort());
      return translateDocument(source, {
        maxChars: MAX_CHUNK_CHARS,
        isCancelled: () => token.isCancellationRequested,
        onProgress: (done, total) => progress.report({ message: `đã dịch ${done}/${total} phần` }),
        translate: (chunk) =>
          translateOne(chunk, { apiKey, model, systemPrompt, fetchFn, signal: controller.signal }),
      });
    },
  );

  for (const line of describeForLog(result)) logger.info(line);

  if (result.text !== "") {
    const doc = await vscode.workspace.openTextDocument({ language: "markdown", content: result.text });
    await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.Beside, preview: false });
  }

  for (const n of describeOutcome(result, { model: models.gemini, groqModel: models.groq })) void showNotification(n, context, logger);
}

export function activate(context: vscode.ExtensionContext): void {
  const logger = createOutputLogger();
  context.subscriptions.push(
    { dispose: () => logger.dispose() },
    vscode.commands.registerCommand("vieMarkdown.translate", (uri?: vscode.Uri) =>
      translateMarkdown(context, logger, uri),
    ),
    vscode.commands.registerCommand("vieMarkdown.setApiKey", async () => {
      if (await askApiKey("gemini")) vscode.window.showInformationMessage("vie-markdown: đã lưu API key Gemini.");
    }),
    vscode.commands.registerCommand("vieMarkdown.setGroqApiKey", async () => {
      if (await askApiKey("groq")) vscode.window.showInformationMessage("vie-markdown: đã lưu API key Groq.");
    }),
  );
}

export function deactivate(): void {}
