import { splitMarkdown } from "./splitter";
import { Provider, TranslationError, TranslationErrorKind } from "./translator";
import { findUntranslatedParagraphs } from "./untranslated";
import { validateTranslation } from "./validator";

export interface PipelineDeps {
  translate: (chunk: string) => Promise<string>;
  maxChars: number;
  onProgress?: (done: number, total: number) => void;
  isCancelled?: () => boolean;
}

export interface PipelineResult {
  text: string;
  warnings: string[];
  completed: boolean;
  error?: string;
  errorKind?: TranslationErrorKind;
  errorDetail?: string;
  /** Service that raised the error. */
  errorProvider?: Provider;
  httpStatus?: number;
  /** 1-based index of the chunk that failed. */
  failedChunk?: number;
  translatedChunks: number;
  totalChunks: number;
  /** English prose lines still present unchanged in a completed translation. */
  untranslated: string[];
}

export async function translateDocument(
  source: string,
  deps: PipelineDeps,
): Promise<PipelineResult> {
  if (source.trim() === "") {
    return {
      text: "",
      warnings: [],
      completed: false,
      error: "File trống",
      translatedChunks: 0,
      totalChunks: 0,
      untranslated: [],
    };
  }

  const chunks = splitMarkdown(source, deps.maxChars);
  const translated: string[] = [];
  const progress = () => ({
    text: translated.join("\n\n"),
    translatedChunks: translated.length,
    totalChunks: chunks.length,
  });

  for (const chunk of chunks) {
    if (deps.isCancelled?.()) break;
    try {
      translated.push((await deps.translate(chunk)).trimEnd());
    } catch (e) {
      if (deps.isCancelled?.()) {
        return { ...progress(), warnings: [], completed: false, untranslated: [] };
      }
      const typed = e instanceof TranslationError ? e : undefined;
      return {
        ...progress(),
        warnings: [],
        completed: false,
        untranslated: [],
        error: e instanceof Error ? e.message : String(e),
        errorKind: typed?.kind,
        errorDetail: typed?.detail,
        errorProvider: typed?.provider,
        httpStatus: typed?.httpStatus,
        failedChunk: translated.length + 1,
      };
    }
    deps.onProgress?.(translated.length, chunks.length);
  }

  const completed = translated.length === chunks.length;
  const text = translated.join("\n\n");
  return {
    ...progress(),
    warnings: completed ? validateTranslation(source, text) : [],
    completed,
    untranslated: completed ? findUntranslatedParagraphs(source, text) : [],
  };
}
