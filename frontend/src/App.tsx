import { useState, useCallback, useEffect } from "react";
import ChatWindow from "./components/ChatWindow.tsx";
import InputArea from "./components/InputArea.tsx";
import type { Message } from "./types/index.ts";

const API_URL = "/api";
const STORAGE_KEY = "zgrzyt-chat-history";

const SUGGESTION_PROMPTS = ["Czym jest efekt spadochroniarza?", "Kim jest Bilon?"];

type Limits = { remaining_user: number };

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

export default function App() {
  const [messages, setMessages] = useState<Message[]>(loadMessages);
  const [isTyping, setIsTyping] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [limits, setLimits] = useState<Limits | null>(null);

  const fetchLimits = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/limits`);
      if (res.ok) setLimits(await res.json());
    } catch {
      return;
    }
  }, []);

  useEffect(() => {
    fetchLimits();
  }, [fetchLimits]);

  const handleSend = useCallback(
    async (text: string) => {
      const userMsg: Message = { role: "user", content: text };

      setMessages((prev) => {
        const next = [...prev, userMsg];
        saveMessages(next);
        return next;
      });
      setIsTyping(true);

      try {
        const res = await fetch(`${API_URL}/ask`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: text }),
        });

        if (!res.ok) {
          const error = await res.json().catch(() => null);
          const detail = error?.detail || "Wystąpił błąd. Spróbuj ponownie.";
          const suggestReset = detail.includes("sesję");
          const content = suggestReset
            ? `${detail}\n\nKliknij przycisk **Resetuj Sesję** w górnym menu, aby rozpocząć nową rozmowę.`
            : detail;

          setMessages((prev) => {
            const next = [...prev, { role: "bot" as const, content }];
            saveMessages(next);
            return next;
          });
          return;
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
        fetchLimits();
      }
    },
    [fetchLimits],
  );

  const handleReset = useCallback(() => {
    setMessages([]);
    saveMessages([]);
    setShowResetConfirm(false);
  }, []);

  const isEmpty = messages.length === 0 && !isTyping;

  return (
    <div className="flex flex-col h-dvh overflow-hidden">
      {/* Glass Navigation */}
      <header className="fixed top-0 right-0 left-0 z-40 glass-nav">
        <div className="flex justify-between items-center w-full px-8 py-5 max-w-[1200px] mx-auto">
          <div className="flex items-center gap-0">
            <span className="text-2xl font-black tracking-tighter text-white uppercase font-sans logo-white-glow">
              ZGRZYT
            </span>
            <span className="text-2xl font-black tracking-tighter text-[#7B2FFE] uppercase font-sans logo-purple-glow">
              OPEDIA
            </span>
          </div>
          <div className="flex items-center gap-4">
            {limits && (
              <div className="hidden sm:flex items-center text-xs text-white/40 font-medium">
                <span>
                  Twoje: <span className="text-white/70">{limits.remaining_user}</span>
                </span>
              </div>
            )}
            <button
              onClick={() => setShowResetConfirm(true)}
              className="group flex items-center gap-3 px-5 py-2.5 bg-black/40 border border-[#7B2FFE]/30 rounded-xl hover:border-[#7B2FFE] hover:bg-[#7B2FFE]/5 transition-all active:scale-95 duration-200 relative overflow-hidden cursor-pointer"
            >
              <div className="absolute inset-0 bg-[#7B2FFE]/5 opacity-0 group-hover:opacity-100 transition-opacity" />
              <span className="material-symbols-outlined text-lg text-[#7B2FFE]">refresh</span>
              <span className="text-xs font-bold tracking-[0.2em] uppercase text-white/90 hidden sm:inline">
                Resetuj Sesję
              </span>
            </button>
          </div>
        </div>
      </header>

      {/* Reset Confirmation Modal */}
      {showResetConfirm && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-6 transition-opacity duration-300">
          <div className="bg-surface-container p-8 rounded-2xl max-w-sm w-full border border-white/5 space-y-6">
            <h3 className="text-xl font-black uppercase tracking-tighter text-white">
              Na pewno chcesz zresetować czat?
            </h3>
            <div className="flex gap-4">
              <button
                onClick={() => setShowResetConfirm(false)}
                className="flex-1 py-3 text-xs font-black uppercase tracking-widest text-on-surface-variant border border-white/10 rounded-lg hover:bg-white/5 transition-all cursor-pointer"
              >
                Anuluj
              </button>
              <button
                onClick={handleReset}
                className="flex-1 py-3 text-xs font-black uppercase tracking-widest text-on-primary bg-accent rounded-lg neon-glow transition-all cursor-pointer"
              >
                Resetuj
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main
        className="h-screen pt-28 pb-32 overflow-y-auto relative"
        style={{
          backgroundImage:
            "radial-gradient(circle at 0% 0%, rgba(123, 47, 254, 0.08) 0%, transparent 40%), radial-gradient(circle at 100% 100%, rgba(123, 47, 254, 0.08) 0%, transparent 40%), radial-gradient(circle at 50% 50%, rgba(123, 47, 254, 0.03) 0%, transparent 60%)",
          backgroundAttachment: "fixed",
        }}
      >
        <div className="max-w-[800px] mx-auto px-6 py-8 flex flex-col gap-12">
          {isEmpty ? (
            <div className="flex flex-col items-center text-center py-12 space-y-6">
              <div className="w-20 h-20 bg-surface-container-highest/50 rounded-3xl flex items-center justify-center neon-glow relative overflow-hidden group">
                <div className="absolute inset-0 bg-gradient-to-tr from-accent/20 to-transparent" />
                <span
                  className="material-symbols-outlined text-5xl text-accent relative z-10"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  bolt
                </span>
              </div>
              <div className="space-y-2">
                <h2 className="text-3xl font-black tracking-tighter uppercase text-white">
                  Zapytaj o cokolwiek z podcastu ZGRZYT
                </h2>
                <p className="text-on-surface-variant font-medium">
                  Znam treść wszystkich odcinków Gimpera i Revo
                </p>
              </div>
              <div className="flex flex-wrap justify-center gap-3 mt-8">
                {SUGGESTION_PROMPTS.map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => handleSend(prompt)}
                    disabled={isTyping}
                    className="px-4 py-2 bg-surface-container-highest/40 rounded-lg text-sm text-on-surface-variant hover:text-white hover:bg-surface-container-highest border border-transparent hover:border-accent/50 transition-all duration-300 backdrop-blur-sm cursor-pointer disabled:opacity-50"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <ChatWindow messages={messages} isTyping={isTyping} />
          )}
        </div>
      </main>

      {/* Bottom Input Bar */}
      <InputArea onSend={handleSend} disabled={isTyping} />
    </div>
  );
}
