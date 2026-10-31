import { splitMarkdown } from "./splitter";
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
}

export async function translateDocument(
  source: string,
  deps: PipelineDeps,
): Promise<PipelineResult> {
  if (source.trim() === "") {
    return { text: "", warnings: [], completed: false, error: "File trống" };
  }

  const chunks = splitMarkdown(source, deps.maxChars);
  const translated: string[] = [];

  for (const chunk of chunks) {
    if (deps.isCancelled?.()) break;
    try {
      translated.push((await deps.translate(chunk)).trimEnd());
    } catch (e) {
      if (deps.isCancelled?.()) {
        return { text: translated.join("\n\n"), warnings: [], completed: false };
      }
      return {
        text: translated.join("\n\n"),
        warnings: [],
        completed: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
    deps.onProgress?.(translated.length, chunks.length);
  }

  const text = translated.join("\n\n");
  const completed = translated.length === chunks.length;
  return {
    text,
    warnings: completed ? validateTranslation(source, text) : [],
    completed,
  };
}
