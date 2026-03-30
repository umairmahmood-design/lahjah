"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import DashboardNav from "@/components/DashboardNav";

type AnnotationType = "CTA" | "Heading" | "Error Message" | "Tooltip" | "Body Copy";

interface Annotation {
  id: string;
  screenshotUrl: string;
  label: string;
  type: AnnotationType;
  note: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface CopyResult {
  status: "idle" | "loading" | "done" | "error";
  en: string;
  ar: string;
  error?: string;
}

const TYPE_COLORS: Record<AnnotationType, string> = {
  CTA: "#1B4FD8",
  Heading: "#7C3AED",
  "Error Message": "#DC2626",
  Tooltip: "#EAB308",
  "Body Copy": "#059669",
};

export default function GeneratePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [context, setContext] = useState("");
  const [tone, setTone] = useState("Professional");
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [results, setResults] = useState<Record<string, CopyResult>>({});
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);
  const hasGenerated = useRef(false);

  // Load request + annotations from Firestore
  useEffect(() => {
    async function load() {
      try {
        const snap = await getDoc(doc(db, "copyRequests", id));
        if (snap.exists()) {
          const data = snap.data();
          setTitle(data.title ?? "");
          setContext(data.context ?? "");
          setTone(data.tone ?? "Professional");
          const anns: Annotation[] = data.annotations ?? [];
          setAnnotations(anns);
          // Initialise result slots
          const initial: Record<string, CopyResult> = {};
          for (const ann of anns) {
            initial[ann.id] = { status: "idle", en: "", ar: "" };
          }
          setResults(initial);
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  // Auto-generate once annotations are loaded
  useEffect(() => {
    if (!loading && annotations.length > 0 && !hasGenerated.current) {
      hasGenerated.current = true;
      generateAll(annotations);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, annotations]);

  async function generateOne(ann: Annotation) {
    setResults((prev) => ({
      ...prev,
      [ann.id]: { status: "loading", en: "", ar: "" },
    }));

    const description = [ann.label, `(${ann.type})`, ann.note ? `— ${ann.note}` : ""]
      .filter(Boolean)
      .join(" ");

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description, context, tone }),
      });

      if (!res.ok) throw new Error("Generation failed");
      const data = await res.json() as { en: string; ar: string };

      setResults((prev) => ({
        ...prev,
        [ann.id]: { status: "done", en: data.en, ar: data.ar },
      }));
    } catch {
      setResults((prev) => ({
        ...prev,
        [ann.id]: { status: "error", en: "", ar: "", error: "Failed to generate. Try again." },
      }));
    }
  }

  function generateAll(anns: Annotation[]) {
    for (const ann of anns) {
      generateOne(ann);
    }
  }

  async function handleCopy(text: string, key: string) {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  }

  const allDone = annotations.length > 0 && annotations.every(
    (ann) => results[ann.id]?.status === "done" || results[ann.id]?.status === "error"
  );
  const anyLoading = annotations.some((ann) => results[ann.id]?.status === "loading");

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <DashboardNav />
        <div className="flex items-center justify-center py-32">
          <div className="w-7 h-7 border-[3px] border-brand border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (annotations.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50">
        <DashboardNav />
        <div className="max-w-2xl mx-auto px-6 py-16 text-center">
          <p className="text-sm text-gray-500">No annotations found. Go back and annotate your screenshots first.</p>
          <button
            onClick={() => router.push(`/dashboard/${id}`)}
            className="mt-4 text-sm text-brand hover:underline"
          >
            ← Back to request
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <DashboardNav />

      <main className="max-w-4xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-start justify-between mb-8 gap-4">
          <div>
            <button
              onClick={() => router.push(`/dashboard/${id}`)}
              className="text-xs text-gray-400 hover:text-gray-600 transition-colors mb-2 flex items-center gap-1"
            >
              ← Back to request
            </button>
            <h1 className="text-xl font-bold text-gray-900">{title}</h1>
            <p className="text-sm text-gray-400 mt-1">
              {annotations.length} annotation{annotations.length !== 1 ? "s" : ""} · {tone}
            </p>
          </div>

          <button
            onClick={() => generateAll(annotations)}
            disabled={anyLoading}
            className="shrink-0 px-4 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {anyLoading ? "Generating…" : "Regenerate all"}
          </button>
        </div>

        {/* Results */}
        <div className="space-y-4">
          {annotations.map((ann) => {
            const result = results[ann.id];
            const isLoading = result?.status === "loading";
            const isDone = result?.status === "done";
            const isError = result?.status === "error";

            return (
              <div
                key={ann.id}
                className="bg-white rounded-2xl border border-gray-100 overflow-hidden"
              >
                {/* Annotation header */}
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-50 gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className="w-2.5 h-2.5 rounded-sm shrink-0"
                      style={{ backgroundColor: TYPE_COLORS[ann.type] }}
                    />
                    <span className="font-medium text-sm text-gray-900 truncate">{ann.label}</span>
                    <span
                      className="text-xs px-2 py-0.5 rounded-full font-medium shrink-0"
                      style={{
                        backgroundColor: `${TYPE_COLORS[ann.type]}18`,
                        color: TYPE_COLORS[ann.type],
                      }}
                    >
                      {ann.type}
                    </span>
                  </div>
                  <button
                    onClick={() => generateOne(ann)}
                    disabled={isLoading}
                    className="text-xs text-gray-400 hover:text-brand transition-colors shrink-0 disabled:opacity-40"
                  >
                    {isLoading ? "Generating…" : "Regenerate"}
                  </button>
                </div>

                {/* Note */}
                {ann.note && (
                  <div className="px-5 py-2.5 bg-gray-50 border-b border-gray-100">
                    <p className="text-xs text-gray-500">{ann.note}</p>
                  </div>
                )}

                {/* Copy output */}
                <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-gray-100">
                  {/* English */}
                  <div className="px-5 py-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">English</span>
                      {isDone && (
                        <button
                          onClick={() => handleCopy(result.en, `en-${ann.id}`)}
                          className="text-xs text-gray-400 hover:text-brand transition-colors"
                        >
                          {copied === `en-${ann.id}` ? "Copied!" : "Copy"}
                        </button>
                      )}
                    </div>
                    {isLoading && (
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 border-2 border-brand border-t-transparent rounded-full animate-spin" />
                        <span className="text-sm text-gray-400">Generating…</span>
                      </div>
                    )}
                    {isDone && (
                      <p className="text-sm text-gray-800 leading-relaxed">{result.en}</p>
                    )}
                    {isError && (
                      <p className="text-sm text-red-500">{result.error}</p>
                    )}
                    {result?.status === "idle" && (
                      <p className="text-sm text-gray-300">—</p>
                    )}
                  </div>

                  {/* Arabic */}
                  <div className="px-5 py-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Arabic</span>
                      {isDone && (
                        <button
                          onClick={() => handleCopy(result.ar, `ar-${ann.id}`)}
                          className="text-xs text-gray-400 hover:text-brand transition-colors"
                        >
                          {copied === `ar-${ann.id}` ? "Copied!" : "Copy"}
                        </button>
                      )}
                    </div>
                    {isLoading && (
                      <div className="flex items-center gap-2">
                        <div className="w-4 h-4 border-2 border-brand border-t-transparent rounded-full animate-spin" />
                        <span className="text-sm text-gray-400">Generating…</span>
                      </div>
                    )}
                    {isDone && (
                      <p className="text-sm text-gray-800 leading-relaxed text-right" dir="rtl">
                        {result.ar}
                      </p>
                    )}
                    {isError && (
                      <p className="text-sm text-red-500">{result.error}</p>
                    )}
                    {result?.status === "idle" && (
                      <p className="text-sm text-gray-300 text-right" dir="rtl">—</p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {allDone && (
          <p className="text-center text-xs text-gray-400 mt-8 pb-8">
            All copy generated · You can regenerate individual strings above
          </p>
        )}
      </main>
    </div>
  );
}
