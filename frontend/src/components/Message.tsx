import { useState, useEffect, useRef } from "react";
import Markdown from "react-markdown";
import type { Message as MessageType } from "../types/index.ts";
import SourceCard from "./SourceCard.tsx";

interface MessageProps {
  message: MessageType;
  animate?: boolean;
}

function useTypewriter(text: string, enabled: boolean) {
  const [displayed, setDisplayed] = useState(enabled ? "" : text);
  const [done, setDone] = useState(!enabled);
  const idx = useRef(0);

  useEffect(() => {
    if (!enabled) {
      setDisplayed(text);
      setDone(true);
      return;
    }

    idx.current = 0;
    setDisplayed("");
    setDone(false);

    const words = text.split(/(\s+)/);
    let current = "";

    const interval = setInterval(() => {
      if (idx.current >= words.length) {
        clearInterval(interval);
        setDone(true);
        return;
      }
      current += words[idx.current];
      idx.current++;
      setDisplayed(current);
    }, 30);

    return () => clearInterval(interval);
  }, [text, enabled]);

  return { displayed, done };
}

export default function Message({ message, animate = false }: MessageProps) {
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <div className="bg-surface-container-high/80 backdrop-blur-sm p-5 rounded-l-xl rounded-br-xl self-end max-w-[90%] md:max-w-[80%] text-white text-sm shadow-lg animate-fade-in-up">
        {message.content}
      </div>
    );
  }

  const sources = message.sources ?? [];
  const { displayed, done } = useTypewriter(message.content, animate);

  return (
    <div className="self-start max-w-[95%] md:max-w-[85%] animate-fade-in-up bg-[#111111]/80 backdrop-blur-sm border-l-4 border-accent shadow-xl overflow-hidden rounded-r-xl rounded-bl-xl">
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
            {displayed}
          </Markdown>
          {!done && (
            <span className="inline-block w-0.5 h-4 bg-accent animate-pulse ml-0.5 align-text-bottom" />
          )}
        </div>
      )}
      {done && sources.length > 0 && (
        <div className="px-4 pb-4 flex flex-col gap-2 animate-fade-in-up">
          <span className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant px-1">
            Źródła
          </span>
          {sources.map((s, i) => (
            <SourceCard key={i} {...s} />
          ))}
        </div>
      )}
    </div>
  );
}
