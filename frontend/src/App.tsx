import { useState, useCallback } from "react";
import { RotateCcw } from "lucide-react";
import ChatWindow from "./components/ChatWindow.tsx";
import InputArea from "./components/InputArea.tsx";
import type { Message } from "./types/index.ts";

const API_URL = "/api";
const STORAGE_KEY = "zgrzyt-chat-history";

function loadMessages(): Message[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveMessages(messages: Message[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
}

function toApiMessages(messages: Message[]) {
  return messages.map((m) => ({
    role: m.role === "bot" ? "assistant" as const : "user" as const,
    content: m.content,
  }));
}

export default function App() {
  const [messages, setMessages] = useState<Message[]>(loadMessages);
  const [isTyping, setIsTyping] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const handleSend = useCallback(async (text: string) => {
    const userMsg: Message = { role: "user", content: text };

    setMessages((prev) => {
      const next = [...prev, userMsg];
      saveMessages(next);
      return next;
    });
    setIsTyping(true);

    try {
      const history = [...loadMessages(), userMsg];

      const res = await fetch(`${API_URL}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: toApiMessages(history) }),
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data: { answer: string } = await res.json();
      const botMsg: Message = { role: "bot", content: data.answer };

      setMessages((prev) => {
        const next = [...prev, botMsg];
        saveMessages(next);
        return next;
      });
    } catch {
      const errorMsg: Message = {
        role: "bot",
        content: "Nie udało się połączyć z serwerem. Spróbuj ponownie.",
      };
      setMessages((prev) => {
        const next = [...prev, errorMsg];
        saveMessages(next);
        return next;
      });
    } finally {
      setIsTyping(false);
    }
  }, []);

  const handleReset = useCallback(() => {
    setMessages([]);
    saveMessages([]);
    setShowResetConfirm(false);
  }, []);

  return (
    <div className="flex flex-col h-dvh">
      {/* Header */}
      <header className="shrink-0 pt-8 pb-4 px-4 text-center relative">
        <h1 className="text-4xl md:text-5xl font-black tracking-tight uppercase">
          ZGRZYT
          <span className="text-accent text-lg md:text-xl font-semibold tracking-normal normal-case ml-3">
            AI Chat
          </span>
        </h1>
        <p className="text-text-dim text-sm mt-1">
          Zapytaj o cokolwiek z podcastu ZGRZYT
        </p>

        {messages.length > 0 && (
          <button
            onClick={() => setShowResetConfirm(true)}
            className="absolute top-8 right-4 p-2 text-text-dim hover:text-accent transition-colors cursor-pointer"
            title="Resetuj chat"
          >
            <RotateCcw size={18} />
          </button>
        )}
      </header>

      {/* Reset confirmation */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-bg-lighter border border-border rounded-lg p-6 max-w-sm mx-4 text-center">
            <p className="text-text mb-4">Na pewno chcesz zresetować chat?</p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => setShowResetConfirm(false)}
                className="px-4 py-2 text-sm rounded-lg border border-border text-text-muted hover:text-text transition-colors cursor-pointer"
              >
                Anuluj
              </button>
              <button
                onClick={handleReset}
                className="px-4 py-2 text-sm rounded-lg bg-accent text-white hover:bg-accent-hover transition-colors cursor-pointer"
              >
                Resetuj
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Chat area */}
      {messages.length === 0 && !isTyping ? (
        <div className="flex-1 flex items-center justify-center px-4">
          <div className="text-center max-w-md">
            <div className="text-6xl mb-4">🎙️</div>
            <p className="text-text-muted text-sm">
              Zadaj pytanie o podcast ZGRZYT prowadzony przez Gimpera i Revo.
              <br />
              <span className="text-text-dim">
                Odcinki, tematy, cytaty — pytaj o co chcesz.
              </span>
            </p>
          </div>
        </div>
      ) : (
        <ChatWindow messages={messages} isTyping={isTyping} />
      )}

      {/* Input */}
      <InputArea onSend={handleSend} disabled={isTyping} />
    </div>
  );
}
