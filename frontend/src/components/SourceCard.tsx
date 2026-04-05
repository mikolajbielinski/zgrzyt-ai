interface SourceCardProps {
  text: string;
  timestamp: string;
  youtube_url: string;
}

export default function SourceCard({
  text,
  timestamp,
  youtube_url,
}: SourceCardProps) {
  return (
    <a
      href={youtube_url}
      target="_blank"
      rel="noopener noreferrer"
      className="block bg-surface-container-low/60 backdrop-blur-sm rounded-xl p-4 flex flex-col gap-3 hover:bg-surface-container-low/80 transition-all duration-200 group cursor-pointer no-underline"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-accent text-sm">
            play_circle
          </span>
          <span className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
            Źródło
          </span>
        </div>
        <span className="text-accent font-mono text-xs group-hover:underline transition-all">
          {timestamp}
        </span>
      </div>
      <p className="text-on-surface-variant text-xs leading-relaxed line-clamp-3">
        {text}
      </p>
    </a>
  );
}
