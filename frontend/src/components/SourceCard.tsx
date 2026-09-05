interface SourceCardProps {
  quote: string;
  speaker?: string;
  source?: string;
  timestamp?: string;
}

export default function SourceCard({ quote, speaker, source, timestamp }: SourceCardProps) {
  return (
    <div className="bg-surface-container-low/60 backdrop-blur-sm rounded-xl p-4 flex flex-col gap-3">
      {(source || timestamp) && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-accent text-sm">history_edu</span>
            {source && (
              <span className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
                {source}
              </span>
            )}
          </div>
          {timestamp && (
            <span className="text-accent font-mono text-xs hover:underline transition-all cursor-pointer">
              {timestamp}
            </span>
          )}
        </div>
      )}
      <blockquote className="border-l-2 border-accent/40 pl-4 py-1">
        <p className="text-on-surface-variant italic text-xs leading-normal">{quote}</p>
      </blockquote>
      {speaker && (
        <div className="flex items-center gap-1.5 self-end">
          <div className="w-1.5 h-1.5 rounded-full bg-accent" />
          <span className="text-[9px] font-black uppercase text-accent tracking-widest">
            {speaker}
          </span>
        </div>
      )}
    </div>
  );
}
