import { useEffect, useState } from "react";
import Markdown from "react-markdown";
import { parseContent } from "../lib/messageContent.ts";
import type { Message as MessageType } from "../types/index.ts";
import SourceCard from "./SourceCard.tsx";

interface MessageProps {
  message: MessageType;
  animate?: boolean;
}

function useTypewriter(text: string, enabled: boolean) {
  const parts = text.split(/(\s+)/);
  const [visibleParts, setVisibleParts] = useState(0);

  useEffect(() => {
    if (!enabled) return;

    const interval = setInterval(() => {
      setVisibleParts((current) => {
        const next = Math.min(current + 1, parts.length);
        if (next === parts.length) clearInterval(interval);
        return next;
      });
    }, 30);

    return () => clearInterval(interval);
  }, [enabled, parts.length]);

  return {
    displayed: enabled ? parts.slice(0, visibleParts).join("") : text,
    done: !enabled || visibleParts >= parts.length,
  };
}

export default function Message({ message, animate = false }: MessageProps) {
  const isUser = message.role === "user";
  const { text, quotes } = parseContent(message.content);
  const { displayed, done } = useTypewriter(text, animate && !isUser);

  if (isUser) {
    return (
      <div className="bg-surface-container-high/80 backdrop-blur-sm p-5 rounded-l-xl rounded-br-xl self-end max-w-[90%] md:max-w-[80%] text-white text-sm shadow-lg animate-fade-in-up">
        {message.content}
      </div>
    );
  }

  const hasQuotes = quotes.length > 0;

  return (
    <div
      className={`self-start max-w-[95%] md:max-w-[85%] animate-fade-in-up bg-[#111111]/80 backdrop-blur-sm border-l-4 border-accent shadow-xl overflow-hidden ${
        hasQuotes ? "rounded-r-xl rounded-bl-xl" : "rounded-r-xl rounded-bl-xl"
      }`}
    >
      {displayed && (
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
              p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
              strong: ({ children }) => (
                <strong className="font-semibold text-white">{children}</strong>
              ),
              ul: ({ children }) => <ul className="list-disc pl-4 mb-2">{children}</ul>,
              ol: ({ children }) => <ol className="list-decimal pl-4 mb-2">{children}</ol>,
              li: ({ children }) => <li className="mb-1">{children}</li>,
              hr: () => <hr className="border-border my-3" />,
            }}
          >
            {displayed}
          </Markdown>
          {!done && (
            <span className="inline-block w-0.5 h-4 bg-accent animate-pulse ml-0.5 align-text-bottom" />
          )}
        </div>
      )}
      {done &&
        quotes.map((q, i) => (
          <div key={i} className="px-4 pb-4 first:pt-4 animate-fade-in-up">
            <SourceCard {...q} />
          </div>
        ))}
    </div>
  );
}
