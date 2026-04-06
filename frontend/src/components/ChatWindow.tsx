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
  const prevCountRef = useRef(messages.length);

  const justAdded = messages.length > prevCountRef.current;
  useEffect(() => {
    prevCountRef.current = messages.length;
  }, [messages.length]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  const lastBotIdx = messages.reduce(
    (acc, msg, i) => (msg.role === "bot" ? i : acc),
    -1
  );

  return (
    <div className="flex flex-col gap-6">
      {messages.map((msg, i) => (
        <Message
          key={i}
          message={msg}
          animate={justAdded && i === lastBotIdx}
        />
      ))}
      {isTyping && <TypingIndicator />}
      <div ref={bottomRef} />
    </div>
  );
}
