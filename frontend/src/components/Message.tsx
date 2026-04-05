import Markdown from "react-markdown";
import type { Message as MessageType } from "../types/index.ts";
import SourceCard from "./SourceCard.tsx";

interface MessageProps {
  message: MessageType;
}

interface ParsedQuote {
  quote: string;
  speaker?: string;
  source?: string;
  timestamp?: string;
}

function parseContent(content: string): {
  text: string;
  quotes: ParsedQuote[];
} {
  const lines = content.split("\n");
  const textLines: string[] = [];
  const quotes: ParsedQuote[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith(">")) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].startsWith(">")) {
        quoteLines.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      const raw = quoteLines.join(" ").trim();

      const match = raw.match(
        /^["„"](.+?)[""\u201D]\s*[—–-]\s*(.+)$/s
      );
      if (match) {
        const quoteText = match[1].trim();
        const meta = match[2].trim();
        const parts = meta.split(",").map((s) => s.trim());

        const speaker = parts[0] || undefined;
        const source =
          parts.length > 2 ? parts.slice(1, -1).join(", ") : parts[1];
        const timestampCandidate = parts[parts.length - 1];
        const timestamp = /^\d+:\d{2}$/.test(timestampCandidate ?? "")
          ? timestampCandidate
          : undefined;
        const actualSource = timestamp
          ? source
          : parts.slice(1).join(", ") || undefined;

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
      i++;
    }
  }

  return { text: textLines.join("\n").trim(), quotes };
}

export default function Message({ message }: MessageProps) {
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <div className="bg-surface-container-high/80 backdrop-blur-sm p-5 rounded-l-xl rounded-br-xl self-end max-w-[90%] md:max-w-[80%] text-white text-sm shadow-lg animate-fade-in-up">
        {message.content}
      </div>
    );
  }

  const { text, quotes } = parseContent(message.content);
  const hasQuotes = quotes.length > 0;

  return (
    <div
      className={`self-start max-w-[95%] md:max-w-[85%] animate-fade-in-up bg-[#111111]/80 backdrop-blur-sm border-l-4 border-accent shadow-xl overflow-hidden ${
        hasQuotes ? "rounded-r-xl rounded-bl-xl" : "rounded-r-xl rounded-bl-xl"
      }`}
    >
      {text && (
        <div className="p-5 text-white leading-relaxed text-sm">
          <Markdown
            components={{
              a: ({ href, children }) => (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent hover:text-accent-hover underline"
                >
                  {children}
                </a>
              ),
              p: ({ children }) => (
                <p className="mb-2 last:mb-0">{children}</p>
              ),
              strong: ({ children }) => (
                <strong className="font-semibold text-white">{children}</strong>
              ),
              ul: ({ children }) => (
                <ul className="list-disc pl-4 mb-2">{children}</ul>
              ),
              ol: ({ children }) => (
                <ol className="list-decimal pl-4 mb-2">{children}</ol>
              ),
              li: ({ children }) => <li className="mb-1">{children}</li>,
              hr: () => <hr className="border-border my-3" />,
            }}
          >
            {text}
          </Markdown>
        </div>
      )}
      {quotes.map((q, i) => (
        <div key={i} className="px-4 pb-4 first:pt-4">
          <SourceCard {...q} />
        </div>
      ))}
    </div>
  );
}
