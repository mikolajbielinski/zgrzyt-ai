import { useRef, useCallback } from "react";

interface InputAreaProps {
  onSend: (text: string) => void;
  disabled: boolean;
}

export default function InputArea({ onSend, disabled }: InputAreaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const resetHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
    }
  }, []);

  const handleInput = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 128)}px`;
    }
  }, []);

  const handleSubmit = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const text = textarea.value.trim();
    if (!text || disabled) return;
    onSend(text);
    textarea.value = "";
    resetHeight();
  }, [onSend, disabled, resetHeight]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  return (
    <div className="fixed bottom-[-2px] right-0 left-0 backdrop-blur-md p-6 z-40">
      <div className="max-w-[800px] mx-auto flex items-center gap-3">
        <div className="flex-1 relative group">
          <textarea
            ref={textareaRef}
            rows={1}
            placeholder="O czym chcesz pogadać?"
            disabled={disabled}
            onInput={handleInput}
            onKeyDown={handleKeyDown}
            autoFocus
            className="w-full bg-surface-container-high/50 border-none focus:ring-0 focus:outline-none text-white placeholder-on-surface-variant rounded-xl px-5 py-4 resize-none transition-all hover:bg-surface-container-highest/60 disabled:opacity-50"
          />
          <div className="input-underline" />
        </div>
        <button
          onClick={handleSubmit}
          disabled={disabled}
          className="shrink-0 w-12 h-12 rounded-full bg-accent flex items-center justify-center text-white neon-glow hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          <span
            className="material-symbols-outlined text-2xl"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            send
          </span>
        </button>
      </div>
    </div>
  );
}
