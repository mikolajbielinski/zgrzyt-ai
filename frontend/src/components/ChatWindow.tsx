import { useEffect, useRef, useState } from "react";
import type { Message as MessageType } from "../types/index.ts";
import Message from "./Message.tsx";
import TypingIndicator from "./TypingIndicator.tsx";

interface ChatWindowProps {
  messages: MessageType[];
  isTyping: boolean;
}

export default function ChatWindow({ messages, isTyping }: ChatWindowProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [initialMessageCount] = useState(() => messages.length);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  return (
    <div className="flex flex-col gap-6">
      {messages.map((msg, i) => (
        <Message
          key={i}
          message={msg}
          animate={i >= initialMessageCount && i === messages.length - 1 && msg.role === "bot"}
        />
      ))}
      {isTyping && <TypingIndicator />}
      <div ref={bottomRef} />
    </div>
  );
}
