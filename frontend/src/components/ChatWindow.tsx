import { useEffect, useRef } from "react";
import type { Message as MessageType } from "../types/index.ts";
import Message from "./Message.tsx";
import TypingIndicator from "./TypingIndicator.tsx";

interface ChatWindowProps {
  messages: MessageType[];
  isTyping: boolean;
}

export default function ChatWindow({ messages, isTyping }: ChatWindowProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6">
      <div className="max-w-3xl mx-auto flex flex-col gap-4">
        {messages.map((msg, i) => (
          <Message key={i} message={msg} />
        ))}
        {isTyping && <TypingIndicator />}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
