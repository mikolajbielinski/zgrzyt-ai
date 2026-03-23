"use client";

import { useEffect, useState, useRef } from "react";

type SpeakerExample = {
  text: string;
  timestamp: number;
};

type SpeakerInfo = {
  examples: SpeakerExample[];
};

type Progress = {
  done: number;
  total: number;
};

type FileData = {
  id: string;
  speakers: Record<string, SpeakerInfo>;
  progress: Progress;
};

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ---- Login form ----
function LoginForm({ onLogin }: { onLogin: () => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    setLoading(false);
    if (res.ok) {
      onLogin();
    } else {
      setError("Nieprawidłowy login lub hasło");
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm space-y-4 rounded-lg border border-gray-800 bg-gray-900 p-8"
      >
        <h1 className="text-xl font-semibold text-gray-100">Zaloguj się</h1>
        {error && (
          <p className="rounded bg-red-900/50 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        )}
        <div className="space-y-2">
          <input
            type="text"
            placeholder="Login"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none"
            autoFocus
          />
          <input
            type="password"
            placeholder="Hasło"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? "Logowanie..." : "Zaloguj"}
        </button>
      </form>
    </div>
  );
}

// ---- Main labeling UI ----
function LabelingUI() {
  const [fileData, setFileData] = useState<FileData | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [ytTimestamp, setYtTimestamp] = useState(0);
  const [direction, setDirection] = useState<"asc" | "desc">("desc");
  const [visibleCount, setVisibleCount] = useState<Record<string, number>>({});
  const iframeRef = useRef<HTMLIFrameElement>(null);

  async function loadNext(dir?: "asc" | "desc") {
    setLoading(true);
    setError("");
    setMapping({});
    setVisibleCount({});
    const d = dir ?? direction;
    const res = await fetch(`/api/files/next?direction=${d}`);
    setLoading(false);
    if (!res.ok) {
      setError("Błąd ładowania pliku z S3");
      return;
    }
    const data = await res.json();
    if (data.done) {
      setDone(true);
      return;
    }
    setFileData(data);
    // Set initial YT timestamp to first speaker's first example
    const firstTs = Object.values(data.speakers as Record<string, SpeakerInfo>)[0]?.examples[0]?.timestamp ?? 0;
    setYtTimestamp(Math.floor(firstTs));
  }

  useEffect(() => {
    loadNext();
  }, []);

  function setTimestamp(ts: number) {
    setYtTimestamp(Math.floor(ts));
    // Reload iframe with new start time
    if (iframeRef.current) {
      const src = iframeRef.current.src.replace(/[?&]start=\d+/, "");
      const sep = src.includes("?") ? "&" : "?";
      iframeRef.current.src = `${src}${sep}start=${Math.floor(ts)}`;
    }
  }

  function handleSkip() {
    if (!fileData) return;
    const raw = document.cookie
      .split("; ")
      .find((c) => c.startsWith("skipped_files="))
      ?.split("=")[1];
    const skipped: string[] = raw ? JSON.parse(decodeURIComponent(raw)) : [];
    if (!skipped.includes(fileData.id)) skipped.push(fileData.id);
    const expires = new Date(Date.now() + 60 * 60 * 1000).toUTCString();
    document.cookie = `skipped_files=${encodeURIComponent(JSON.stringify(skipped))}; expires=${expires}; path=/`;
    loadNext();
  }

  async function handleSave() {
    if (!fileData) return;
    const allFilled = Object.keys(fileData.speakers).every(
      (s) => mapping[s]?.trim()
    );
    if (!allFilled) {
      setError("Uzupełnij ksywki dla wszystkich speakerów");
      return;
    }
    setSaving(true);
    setError("");
    const res = await fetch(`/api/files/${encodeURIComponent(fileData.id)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mapping }),
    });
    setSaving(false);
    if (!res.ok) {
      setError("Błąd zapisywania na S3");
      return;
    }
    loadNext();
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-gray-400">
        Ładowanie...
      </div>
    );
  }

  if (done) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <p className="text-2xl font-semibold text-green-400">Wszystko uzupełnione!</p>
          <p className="mt-2 text-gray-400">Brak plików wymagających oznaczenia speakerów.</p>
        </div>
      </div>
    );
  }

  if (!fileData) {
    return (
      <div className="flex min-h-screen items-center justify-center text-red-400">
        {error || "Nie udało się załadować pliku"}
      </div>
    );
  }

  const speakerEntries = Object.entries(fileData.speakers).sort(([a], [b]) =>
    a.localeCompare(b)
  );

  const ytSrc = `https://www.youtube.com/embed/${fileData.id}?start=${ytTimestamp}&autoplay=0`;

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Left panel */}
      <div className="flex w-1/2 flex-col overflow-y-auto border-r border-gray-800 p-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold text-gray-100">Speaker Labeler</h1>
            <span className="rounded bg-gray-800 px-2 py-1 text-xs text-gray-400">
              {fileData.progress.done}/{fileData.progress.total} done
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                const next = direction === "desc" ? "asc" : "desc";
                setDirection(next);
                loadNext(next);
              }}
              className="rounded border border-gray-700 px-2 py-1 text-xs text-gray-400 hover:border-gray-500 hover:text-gray-200"
              title={direction === "desc" ? "Od tyłu (kliknij aby od początku)" : "Od początku (kliknij aby od tyłu)"}
            >
              {direction === "desc" ? "↑ od tyłu" : "↓ od początku"}
            </button>
            <span className="rounded bg-gray-800 px-2 py-1 text-xs text-gray-400">
              {fileData.id}
            </span>
          </div>
        </div>

        {error && (
          <p className="mb-4 rounded bg-red-900/50 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        )}

        <div className="space-y-5 flex-1">
          {speakerEntries.map(([speakerId, info]) => (
            <div
              key={speakerId}
              className="rounded-lg border border-gray-800 bg-gray-900 p-4"
            >
              <div className="mb-3">
                <span className="font-mono text-sm font-medium text-blue-400">
                  {speakerId}
                </span>
              </div>
              <div className="mb-3 space-y-2">
                {info.examples.slice(0, visibleCount[speakerId] ?? 3).map((ex, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <button
                      onClick={() => setTimestamp(ex.timestamp)}
                      className="mt-0.5 shrink-0 rounded bg-gray-800 px-2 py-0.5 text-xs text-gray-400 hover:bg-gray-700 hover:text-gray-200"
                      title="Kliknij aby przejść do tego momentu"
                    >
                      {formatTime(ex.timestamp)}
                    </button>
                    <p className="text-sm italic text-gray-400 line-clamp-2">
                      &ldquo;{ex.text}&rdquo;
                    </p>
                  </div>
                ))}
                {info.examples.length > (visibleCount[speakerId] ?? 3) && (
                  <button
                    onClick={() =>
                      setVisibleCount((prev) => ({
                        ...prev,
                        [speakerId]: (prev[speakerId] ?? 3) + 5,
                      }))
                    }
                    className="text-xs text-blue-400 hover:text-blue-300"
                  >
                    + Załaduj 5 więcej ({info.examples.length - (visibleCount[speakerId] ?? 3)} pozostało)
                  </button>
                )}
              </div>
              <input
                type="text"
                placeholder="Wpisz ksywkę..."
                value={mapping[speakerId] ?? ""}
                onChange={(e) =>
                  setMapping((prev) => ({ ...prev, [speakerId]: e.target.value }))
                }
                className="w-full rounded border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:outline-none"
              />
            </div>
          ))}
        </div>

        <div className="mt-6 flex gap-3">
          <button
            onClick={handleSkip}
            disabled={saving}
            className="rounded border border-gray-700 px-4 py-3 font-medium text-gray-400 hover:border-gray-500 hover:text-gray-200 disabled:opacity-50"
          >
            Pomiń (1h)
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 rounded bg-blue-600 px-4 py-3 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Zapisywanie..." : "Zapisz i następny"}
          </button>
        </div>
      </div>

      {/* Right panel — YouTube */}
      <div className="flex w-1/2 flex-col items-center justify-center bg-black p-4">
        <iframe
          ref={iframeRef}
          key={`${fileData.id}-${ytTimestamp}`}
          src={ytSrc}
          className="h-full w-full rounded-lg"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    </div>
  );
}

// ---- Root page ----
export default function Page() {
  const [authState, setAuthState] = useState<"loading" | "login" | "app">(
    "loading"
  );

  useEffect(() => {
    fetch("/api/auth/check")
      .then((r) => r.json())
      .then((data) => {
        setAuthState(data.authenticated ? "app" : "login");
      })
      .catch(() => setAuthState("login"));
  }, []);

  if (authState === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center text-gray-400">
        Ładowanie...
      </div>
    );
  }

  if (authState === "login") {
    return <LoginForm onLogin={() => setAuthState("app")} />;
  }

  return <LabelingUI />;
}
