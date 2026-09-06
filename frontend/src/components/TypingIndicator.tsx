export default function TypingIndicator() {
  return (
    <div className="flex flex-col gap-4 self-start animate-fade-in-up">
      <div className="flex items-center gap-2 px-4 py-3 bg-[#111111]/80 backdrop-blur-sm rounded-full border-l-2 border-accent">
        <div className="flex gap-1.5 items-center">
          <span className="typing-dot block w-2 h-2 rounded-full bg-accent" />
          <span className="typing-dot block w-2 h-2 rounded-full bg-accent" />
          <span className="typing-dot block w-2 h-2 rounded-full bg-accent" />
        </div>
        <span className="text-[10px] font-black uppercase tracking-widest text-accent ml-2">
          Przetwarzanie...
        </span>
      </div>
    </div>
  );
}
