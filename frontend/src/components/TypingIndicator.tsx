export default function TypingIndicator() {
  return (
    <div className="flex items-start gap-3 animate-fade-in-up">
      <div className="shrink-0 w-8 h-8 rounded-md bg-accent/20 flex items-center justify-center text-sm font-bold text-accent">
        Z
      </div>
      <div className="bg-bg-light rounded-lg rounded-tl-none px-4 py-3">
        <div className="flex items-center gap-1.5">
          <span className="typing-dot block w-2 h-2 rounded-full bg-accent" />
          <span className="typing-dot block w-2 h-2 rounded-full bg-accent" />
          <span className="typing-dot block w-2 h-2 rounded-full bg-accent" />
        </div>
      </div>
    </div>
  );
}
