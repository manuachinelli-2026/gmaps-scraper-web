"use client";

import { useState, useRef, useCallback } from "react";

const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";

// ─── Scraper types ────────────────────────────────────────────────────────────

type Status = "idle" | "running" | "done" | "error";

interface JobState {
  status: Status;
  progress: number;
  total: number;
  current_name: string;
  error: string | null;
}

// ─── CSV / WhatsApp types ─────────────────────────────────────────────────────

interface Contact {
  name: string;
  phone: string;
  address: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseCSV(text: string): Contact[] {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().replace(/"/g, "").toLowerCase());
  const nameIdx = headers.findIndex((h) => h === "name");
  const phoneIdx = headers.findIndex((h) => h.includes("phone"));
  const addressIdx = headers.findIndex((h) => h === "address");

  return lines
    .slice(1)
    .map((line) => {
      const cols = line.match(/(".*?"|[^,]+|(?<=,)(?=,)|(?<=,)$|^(?=,))/g) ?? line.split(",");
      const clean = (i: number) => (cols[i] ?? "").trim().replace(/^"|"$/g, "");
      return {
        name: nameIdx >= 0 ? clean(nameIdx) : "",
        phone: phoneIdx >= 0 ? clean(phoneIdx) : "",
        address: addressIdx >= 0 ? clean(addressIdx) : "",
      };
    })
    .filter((c) => c.name);
}

function cleanPhone(raw: string): string {
  return raw.replace(/[^\d+]/g, "");
}

function waLink(phone: string, message: string): string {
  const p = cleanPhone(phone);
  const encoded = encodeURIComponent(message);
  return `https://wa.me/${p}?text=${encoded}`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Home() {
  const [tab, setTab] = useState<"scraper" | "whatsapp">("scraper");

  // Scraper state
  const [businessType, setBusinessType] = useState("");
  const [zone, setZone] = useState("");
  const [total, setTotal] = useState(20);
  const [job, setJob] = useState<JobState | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);

  // WhatsApp state
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [message, setMessage] = useState("");
  const [confirmedMessage, setConfirmedMessage] = useState("");
  const [dragging, setDragging] = useState(false);

  // ── Scraper handlers ────────────────────────────────────────────────────────

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
        if (data.status === "done" || data.status === "error") es.close();
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

  // ── WhatsApp handlers ───────────────────────────────────────────────────────

  const loadFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const parsed = parseCSV(text);
      setContacts(parsed);
      setConfirmedMessage("");
      setMessage("");
    };
    reader.readAsText(file);
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file?.name.endsWith(".csv")) loadFile(file);
  }, []);

  const onFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) loadFile(file);
  };

  const contactsWithPhone = contacts.filter((c) => cleanPhone(c.phone).length >= 7);

  return (
    <main className="flex min-h-screen flex-col items-center px-4 py-16 bg-white">
      {/* Header */}
      <div className="mb-10 text-center">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-green-500/30 bg-green-50 px-3 py-1 text-xs text-green-600">
          <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
          Google Maps Scraper
        </div>
        <h1 className="text-4xl font-bold tracking-tight text-gray-900">
          Extrae negocios de<br />
          <span className="text-green-500">Google Maps</span>
        </h1>
        <p className="mt-3 text-gray-500">Scrapeá negocios y enviá mensajes de WhatsApp masivos.</p>
      </div>

      {/* Tabs */}
      <div className="mb-8 flex rounded-xl border border-gray-200 bg-gray-50 p-1 gap-1">
        <button
          onClick={() => setTab("scraper")}
          className={`rounded-lg px-5 py-2 text-sm font-medium transition ${
            tab === "scraper"
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          Scraper
        </button>
        <button
          onClick={() => setTab("whatsapp")}
          className={`rounded-lg px-5 py-2 text-sm font-medium transition ${
            tab === "whatsapp"
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-500 hover:text-gray-700"
          }`}
        >
          WhatsApp
        </button>
      </div>

      {/* ── SCRAPER TAB ── */}
      {tab === "scraper" && (
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
                type="range" min={1} max={100} step={1} value={total}
                onChange={(e) => setTotal(Number(e.target.value))}
                disabled={job?.status === "running"}
                className="w-full accent-green-500 disabled:opacity-50"
              />
              <div className="mt-1 flex justify-between text-xs text-gray-400">
                <span>1 (~15s)</span><span>50 (~5min)</span><span>100 (~12min)</span>
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

          {job?.status === "running" && (
            <div className="mt-6 space-y-3">
              <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
                <div className="h-full rounded-full bg-green-500 transition-all duration-300" style={{ width: `${pct}%` }} />
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="max-w-[70%] truncate text-gray-500">{job.current_name}</span>
                <span className="font-medium text-green-500">{job.progress}/{job.total}</span>
              </div>
            </div>
          )}

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

          {job?.status === "error" && (
            <div className="mt-6 rounded-xl border border-red-100 bg-red-50 px-4 py-3">
              <p className="text-sm font-medium text-red-600">Error</p>
              <p className="mt-0.5 text-xs text-gray-500">{job.error}</p>
            </div>
          )}
        </div>
      )}

      {/* ── WHATSAPP TAB ── */}
      {tab === "whatsapp" && (
        <div className="w-full max-w-2xl space-y-6">

          {/* Drop zone */}
          {contacts.length === 0 && (
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={onDrop}
              className={`flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed px-8 py-16 text-center transition ${
                dragging ? "border-green-400 bg-green-50" : "border-gray-200 bg-gray-50"
              }`}
            >
              <svg className="h-10 w-10 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
              <div>
                <p className="text-sm font-medium text-gray-700">Arrastrá el CSV acá</p>
                <p className="text-xs text-gray-400">o hacé click para seleccionarlo</p>
              </div>
              <label className="cursor-pointer rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-600 transition hover:bg-gray-50">
                Seleccionar archivo
                <input type="file" accept=".csv" className="hidden" onChange={onFileInput} />
              </label>
            </div>
          )}

          {/* Contacts loaded */}
          {contacts.length > 0 && (
            <>
              {/* Stats + reset */}
              <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-gray-800">{contacts.length} contactos cargados</p>
                  <p className="text-xs text-gray-500">{contactsWithPhone.length} con número de teléfono</p>
                </div>
                <button
                  onClick={() => { setContacts([]); setConfirmedMessage(""); setMessage(""); }}
                  className="text-xs text-gray-400 hover:text-red-500 transition"
                >
                  Cambiar archivo
                </button>
              </div>

              {/* Message composer */}
              <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm space-y-4">
                <label className="block text-sm font-medium text-gray-700">Mensaje de WhatsApp</label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Ej: Hola! Te contacto porque vi tu negocio en Google Maps y..."
                  rows={4}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 outline-none ring-green-500/50 transition focus:border-green-500 focus:ring-2 resize-none"
                />
                <button
                  onClick={() => setConfirmedMessage(message)}
                  disabled={!message.trim()}
                  className="w-full rounded-xl bg-green-500 py-3 text-sm font-semibold text-white transition hover:bg-green-600 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Confirmar mensaje y cargar links
                </button>
              </div>

              {/* Contact list with WA links */}
              {confirmedMessage && (
                <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden">
                  <div className="border-b border-gray-100 px-6 py-4 flex items-center justify-between">
                    <p className="text-sm font-medium text-gray-800">Links de WhatsApp</p>
                    <span className="text-xs text-gray-400">{contactsWithPhone.length} contactos</span>
                  </div>
                  <div className="divide-y divide-gray-50 max-h-[480px] overflow-y-auto">
                    {contacts.map((c, i) => {
                      const phone = cleanPhone(c.phone);
                      const hasPhone = phone.length >= 7;
                      return (
                        <div key={i} className="flex items-center justify-between gap-4 px-6 py-4">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-800 truncate">{c.name}</p>
                            <p className="text-xs text-gray-400 truncate">{c.phone || "Sin teléfono"}</p>
                          </div>
                          {hasPhone ? (
                            <a
                              href={waLink(phone, confirmedMessage)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex shrink-0 items-center gap-1.5 rounded-lg bg-[#25D366] px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-[#20bd5a] active:scale-95"
                            >
                              <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
                                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                              </svg>
                              Abrir
                            </a>
                          ) : (
                            <span className="shrink-0 rounded-lg border border-gray-100 px-3 py-1.5 text-xs text-gray-300">Sin número</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      <p className="mt-10 text-xs text-gray-400">
        Los tiempos son aproximados · No hagas scrapes masivos seguidos para evitar bloqueos
      </p>
    </main>
  );
}
