export interface ParsedQuote {
  quote: string;
  speaker?: string;
  source?: string;
  timestamp?: string;
}

export function parseContent(content: string): {
  text: string;
  quotes: ParsedQuote[];
} {
  const lines = content.split("\n");
  const textLines: string[] = [];
  const quotes: ParsedQuote[] = [];

  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (line.startsWith(">")) {
      const quoteLines: string[] = [];
      while (index < lines.length && lines[index].startsWith(">")) {
        quoteLines.push(lines[index].replace(/^>\s?/, ""));
        index++;
      }
      const raw = quoteLines.join(" ").trim();

      const match = raw.match(/^["„"](.+?)[""\u201D]\s*[—–-]\s*(.+)$/s);
      if (match) {
        const quoteText = match[1].trim();
        const meta = match[2].trim();
        const parts = meta.split(",").map((part) => part.trim());

        const speaker = parts[0] || undefined;
        const source = parts.length > 2 ? parts.slice(1, -1).join(", ") : parts[1];
        const timestampCandidate = parts[parts.length - 1];
        const timestamp = /^\d+:\d{2}$/.test(timestampCandidate ?? "")
          ? timestampCandidate
          : undefined;
        const actualSource = timestamp ? source : parts.slice(1).join(", ") || undefined;

        quotes.push({
          quote: `"${quoteText}"`,
          speaker,
          source: actualSource ? `ŹRÓDŁO: ${actualSource}` : undefined,
          timestamp,
        });
      } else {
        quotes.push({ quote: raw });
      }
    } else {
      textLines.push(line);
      index++;
    }
  }

  return { text: textLines.join("\n").trim(), quotes };
}
