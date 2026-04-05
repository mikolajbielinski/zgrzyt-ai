import Markdown from "react-markdown";
import type { Message as MessageType } from "../types/index.ts";

interface MessageProps {
  message: MessageType;
}

export default function Message({ message }: MessageProps) {
  const isUser = message.role === "user";

  if (isUser) {
    return (
      <div className="bg-surface-container-high/80 backdrop-blur-sm p-5 rounded-l-xl rounded-br-xl self-end max-w-[80%] text-white text-sm shadow-lg animate-fade-in-up">
        {message.content}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 self-start max-w-[85%] animate-fade-in-up">
      <div className="bg-[#111111]/80 backdrop-blur-sm p-5 rounded-r-xl rounded-bl-xl border-l-4 border-accent text-white leading-relaxed text-sm shadow-xl">
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
            blockquote: ({ children }) => (
              <blockquote className="border-l-2 border-accent/40 pl-4 py-1 my-2">
                <div className="text-on-surface-variant italic text-xs leading-normal">
                  {children}
                </div>
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
      </div>
    </div>
  );
}
