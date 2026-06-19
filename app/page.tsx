"use client";

import { useState, useRef } from "react";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

type Status = "idle" | "running" | "done" | "error";

interface JobState {
  status: Status;
  progress: number;
  total: number;
  current_name: string;
  error: string | null;
}

export default function Home() {
  const [businessType, setBusinessType] = useState("");
  const [zone, setZone] = useState("");
  const [total, setTotal] = useState(20);
  const [job, setJob] = useState<JobState | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    esRef.current?.close();

    const search = `${businessType.trim()} en ${zone.trim()}`;
    setJob({ status: "running", progress: 0, total, current_name: "Iniciando...", error: null });
    setJobId(null);

    try {
      const res = await fetch(`${BACKEND}/api/scrape`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ search, total }),
      });

      if (!res.ok) throw new Error(await res.text());
      const { job_id } = await res.json();
      setJobId(job_id);

      const es = new EventSource(`${BACKEND}/api/stream/${job_id}`);
      esRef.current = es;

      es.onmessage = (e) => {
        const data: JobState = JSON.parse(e.data);
        setJob(data);
        if (data.status === "done" || data.status === "error") {
          es.close();
        }
      };

      es.onerror = () => {
        es.close();
        setJob((prev) => prev ? { ...prev, status: "error", error: "Conexión perdida con el servidor" } : null);
      };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setJob({ status: "error", progress: 0, total, current_name: "", error: msg });
    }
  };

  const handleDownload = () => {
    if (jobId) window.location.href = `${BACKEND}/api/download/${jobId}`;
  };

  const pct = job && job.total > 0 ? Math.round((job.progress / job.total) * 100) : 0;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-16 bg-white">
      {/* Header */}
      <div className="mb-12 text-center">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-green-500/30 bg-green-50 px-3 py-1 text-xs text-green-600">
          <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
          Google Maps Scraper
        </div>
        <h1 className="text-4xl font-bold tracking-tight text-gray-900">
          Extrae negocios de<br />
          <span className="text-green-500">Google Maps</span>
        </h1>
        <p className="mt-3 text-gray-500">Ingresá el tipo de negocio y la zona, y descargá los resultados en CSV.</p>
      </div>

      {/* Card */}
      <div className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Tipo de negocio</label>
            <input
              value={businessType}
              onChange={(e) => setBusinessType(e.target.value)}
              placeholder="ej: restaurantes, ferreterías, clínicas..."
              required
              disabled={job?.status === "running"}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 outline-none ring-green-500/50 transition focus:border-green-500 focus:ring-2 disabled:opacity-50"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Zona</label>
            <input
              value={zone}
              onChange={(e) => setZone(e.target.value)}
              placeholder="ej: Buenos Aires, Palermo, CDMX..."
              required
              disabled={job?.status === "running"}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 outline-none ring-green-500/50 transition focus:border-green-500 focus:ring-2 disabled:opacity-50"
            />
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700">Cantidad de resultados</label>
              <span className="text-sm font-semibold text-green-500">{total}</span>
            </div>
            <input
              type="range"
              min={1}
              max={100}
              step={1}
              value={total}
              onChange={(e) => setTotal(Number(e.target.value))}
              disabled={job?.status === "running"}
              className="w-full accent-green-500 disabled:opacity-50"
            />
            <div className="mt-1 flex justify-between text-xs text-gray-400">
              <span>1 (~15s)</span>
              <span>50 (~5min)</span>
              <span>100 (~12min)</span>
            </div>
          </div>

          <button
            type="submit"
            disabled={job?.status === "running"}
            className="w-full rounded-xl bg-green-500 py-3 text-sm font-semibold text-white transition hover:bg-green-600 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {job?.status === "running" ? "Buscando..." : "Buscar"}
          </button>
        </form>

        {/* Progress */}
        {job?.status === "running" && (
          <div className="mt-6 space-y-3">
            <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full rounded-full bg-green-500 transition-all duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="max-w-[70%] truncate text-gray-500">{job.current_name}</span>
              <span className="font-medium text-green-500">
                {job.progress}/{job.total}
              </span>
            </div>
          </div>
        )}

        {/* Done */}
        {job?.status === "done" && (
          <div className="mt-6 space-y-3">
            <div className="h-2 w-full rounded-full bg-green-500" />
            <div className="flex items-center justify-between rounded-xl border border-green-100 bg-green-50 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-green-600">¡Listo!</p>
                <p className="text-xs text-gray-500">{job.total} resultados encontrados</p>
              </div>
              <button
                onClick={handleDownload}
                className="flex items-center gap-2 rounded-lg bg-green-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-green-600 active:scale-95"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Descargar CSV
              </button>
            </div>
          </div>
        )}

        {/* Error */}
        {job?.status === "error" && (
          <div className="mt-6 rounded-xl border border-red-100 bg-red-50 px-4 py-3">
            <p className="text-sm font-medium text-red-600">Error</p>
            <p className="mt-0.5 text-xs text-gray-500">{job.error}</p>
          </div>
        )}
      </div>

      <p className="mt-8 text-xs text-gray-400">
        Los tiempos son aproximados · No hagas scrapes masivos seguidos para evitar bloqueos
      </p>
    </main>
  );
}
