const FENCE_LINE = /^ {0,3}(`{3,}|~{3,})(.*)$/;

/**
 * Tracks fenced code blocks line by line, following CommonMark: a fence closes only on
 * the same character, at least as many characters as the opener, and no info string.
 */
export class FenceTracker {
  private marker: string | null = null;

  get inFence(): boolean {
    return this.marker !== null;
  }

  /** Feed one line; returns true when the line opens or closes a fence. */
  feed(rawLine: string): boolean {
    const m = FENCE_LINE.exec(rawLine.replace(/\r?\n$/, ""));
    if (this.marker === null) {
      if (!m || (m[1][0] === "`" && m[2].includes("`"))) return false;
      this.marker = m[1];
      return true;
    }
    if (m && m[1][0] === this.marker[0] && m[1].length >= this.marker.length && m[2].trim() === "") {
      this.marker = null;
      return true;
    }
    return false;
  }
}
