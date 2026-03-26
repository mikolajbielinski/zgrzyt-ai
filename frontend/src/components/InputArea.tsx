import { useRef, useCallback } from "react";
import { Send } from "lucide-react";

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
    [handleSubmit]
  );

  return (
    <div className="sticky bottom-0 bg-gradient-to-t from-bg from-80% to-transparent pt-6 pb-4 px-4">
      <div className="max-w-3xl mx-auto flex items-end gap-3">
        <textarea
          ref={textareaRef}
          rows={1}
          placeholder="O czym chcesz pogadać?"
          disabled={disabled}
          onInput={handleInput}
          onKeyDown={handleKeyDown}
          autoFocus
          className="flex-1 resize-none bg-bg-input border border-border rounded-lg px-4 py-3 text-sm text-text placeholder:text-text-dim focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/30 transition-colors disabled:opacity-50"
        />
        <button
          onClick={handleSubmit}
          disabled={disabled}
          className="shrink-0 w-10 h-10 flex items-center justify-center rounded-lg bg-accent text-white hover:bg-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          <Send size={18} />
        </button>
      </div>
    </div>
  );
}
