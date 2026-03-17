"use client";

import { useEffect, useState, useRef } from "react";

type SpeakerInfo = {
  example: string;
  timestamp: number;
};

type FileData = {
  id: string;
  speakers: Record<string, SpeakerInfo>;
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
  const iframeRef = useRef<HTMLIFrameElement>(null);

  async function loadNext() {
    setLoading(true);
    setError("");
    setMapping({});
    const res = await fetch("/api/files/next");
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
    // Set initial YT timestamp to first speaker's timestamp
    const firstTs = Object.values(data.speakers as Record<string, SpeakerInfo>)[0]?.timestamp ?? 0;
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
          <h1 className="text-lg font-semibold text-gray-100">Speaker Labeler</h1>
          <span className="rounded bg-gray-800 px-2 py-1 text-xs text-gray-400">
            {fileData.id}
          </span>
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
              <div className="mb-2 flex items-center justify-between">
                <span className="font-mono text-sm font-medium text-blue-400">
                  {speakerId}
                </span>
                <button
                  onClick={() => setTimestamp(info.timestamp)}
                  className="rounded bg-gray-800 px-2 py-1 text-xs text-gray-400 hover:bg-gray-700 hover:text-gray-200"
                  title="Kliknij aby przejść do tego momentu w filmiku"
                >
                  {formatTime(info.timestamp)}
                </button>
              </div>
              <p className="mb-3 text-sm italic text-gray-400 line-clamp-2">
                &ldquo;{info.example}&rdquo;
              </p>
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

        <button
          onClick={handleSave}
          disabled={saving}
          className="mt-6 w-full rounded bg-blue-600 px-4 py-3 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "Zapisywanie..." : "Zapisz i następny"}
        </button>
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
