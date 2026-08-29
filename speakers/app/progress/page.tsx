"use client";

import { useEffect, useState } from "react";

type ProgressData = {
  done: number;
  pending: number;
  total: number;
};

export default function ProgressPage() {
  const [data, setData] = useState<ProgressData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/progress")
      .then((r) => {
        if (!r.ok) throw new Error("Unauthorized");
        return r.json();
      })
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => {
        setError("Nie udalo sie zaladowac danych. Zaloguj sie najpierw.");
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-gray-400">
        Liczenie plikow...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center text-red-400">
        {error}
      </div>
    );
  }

  if (!data) return null;

  const pct = data.total > 0 ? Math.round((data.done / data.total) * 100) : 0;

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="w-full max-w-md space-y-6 rounded-lg border border-gray-800 bg-gray-900 p-8">
        <h1 className="text-xl font-semibold text-gray-100">Postep</h1>

        <div className="space-y-2">
          <div className="flex justify-between text-sm text-gray-400">
            <span>{data.done} zrobionych</span>
            <span>{data.pending} do zrobienia</span>
          </div>
          <div className="h-4 w-full overflow-hidden rounded-full bg-gray-800">
            <div
              className="h-full rounded-full bg-blue-600 transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="text-center text-lg font-medium text-gray-100">
            {data.done}/{data.total} ({pct}%)
          </p>
        </div>

        <a
          href="/"
          className="block text-center text-sm text-blue-400 hover:text-blue-300"
        >
          Wroc do labelowania
        </a>
      </div>
    </div>
  );
}
