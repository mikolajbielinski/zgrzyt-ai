import Markdown from "react-markdown";
import type { Message as MessageType } from "../types/index.ts";

interface MessageProps {
  message: MessageType;
}

export default function Message({ message }: MessageProps) {
  const isUser = message.role === "user";

  return (
    <div
      className={`flex items-start gap-3 animate-fade-in-up ${
        isUser ? "flex-row-reverse" : ""
      }`}
    >
      {!isUser && (
        <div className="shrink-0 w-8 h-8 rounded-md bg-accent/20 flex items-center justify-center text-sm font-bold text-accent">
          Z
        </div>
      )}
      <div
        className={`max-w-[80%] rounded-lg px-4 py-3 text-sm leading-relaxed ${
          isUser
            ? "bg-bg-lighter text-text rounded-tr-none"
            : "bg-bg-light text-text-muted rounded-tl-none"
        }`}
      >
        {isUser ? (
          message.content
        ) : (
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
                <strong className="font-semibold text-text">{children}</strong>
              ),
              blockquote: ({ children }) => (
                <blockquote className="border-l-2 border-accent/50 pl-3 my-2 italic">
                  {children}
                </blockquote>
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
            {message.content}
          </Markdown>
        )}
      </div>
    </div>
  );
}
