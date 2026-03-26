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
        {message.content}
      </div>
    </div>
  );
}
