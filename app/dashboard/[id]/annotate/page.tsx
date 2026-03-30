"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

type AnnotationType = "CTA" | "Heading" | "Error Message" | "Tooltip" | "Body";

interface Annotation {
  id: string;
  screenshotUrl: string;
  x: number;      // 0–1 fraction of image width
  y: number;      // 0–1 fraction of image height
  width: number;  // 0–1
  height: number; // 0–1
  type: AnnotationType;
}

interface DrawState {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

const TYPES: AnnotationType[] = ["CTA", "Heading", "Error Message", "Tooltip", "Body"];

const TYPE_COLORS: Record<AnnotationType, string> = {
  CTA: "#1B4FD8",
  Heading: "#7C3AED",
  "Error Message": "#DC2626",
  Tooltip: "#D97706",
  Body: "#059669",
};

export default function AnnotatePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [screenshotURLs, setScreenshotURLs] = useState<string[]>([]);
  const [requestTitle, setRequestTitle] = useState("");
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [selectedType, setSelectedType] = useState<AnnotationType>("CTA");
  const [drawing, setDrawing] = useState<DrawState | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saveError, setSaveError] = useState("");

  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function load() {
      try {
        const snap = await getDoc(doc(db, "copyRequests", id));
        if (snap.exists()) {
          const data = snap.data();
          setScreenshotURLs(data.screenshotURLs ?? []);
          setRequestTitle(data.title ?? "");
          setAnnotations(data.annotations ?? []);
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  // ── Drawing helpers ─────────────────────────────────────────────────
  function getRelativePos(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
    };
  }

  function handleMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    e.preventDefault();
    const pos = getRelativePos(e);
    setDrawing({ startX: pos.x, startY: pos.y, currentX: pos.x, currentY: pos.y });
  }

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    if (!drawing) return;
    const pos = getRelativePos(e);
    setDrawing((d) => (d ? { ...d, currentX: pos.x, currentY: pos.y } : null));
  }

  function handleMouseUp() {
    if (!drawing) return;
    const x = Math.min(drawing.startX, drawing.currentX);
    const y = Math.min(drawing.startY, drawing.currentY);
    const w = Math.abs(drawing.currentX - drawing.startX);
    const h = Math.abs(drawing.currentY - drawing.startY);

    // Ignore tiny accidental clicks (less than 2% of image dimension)
    if (w > 0.02 && h > 0.02) {
      setAnnotations((prev) => [
        ...prev,
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          screenshotUrl: screenshotURLs[activeIdx],
          x,
          y,
          width: w,
          height: h,
          type: selectedType,
        },
      ]);
    }
    setDrawing(null);
  }

  function deleteAnnotation(annId: string) {
    setAnnotations((prev) => prev.filter((a) => a.id !== annId));
  }

  async function handleSave() {
    setSaveError("");
    setSaving(true);
    try {
      await updateDoc(doc(db, "copyRequests", id), { annotations });
      router.push(`/dashboard/${id}`);
    } catch {
      setSaveError("Failed to save. Please try again.");
      setSaving(false);
    }
  }

  // ── Derived state ───────────────────────────────────────────────────
  const currentUrl = screenshotURLs[activeIdx] ?? "";
  const currentAnnotations = annotations.filter((a) => a.screenshotUrl === currentUrl);

  // Live drawing rect (normalized)
  const liveRect = drawing
    ? {
        x: Math.min(drawing.startX, drawing.currentX),
        y: Math.min(drawing.startY, drawing.currentY),
        w: Math.abs(drawing.currentX - drawing.startX),
        h: Math.abs(drawing.currentY - drawing.startY),
      }
    : null;

  // ── Loading ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="w-7 h-7 border-[3px] border-brand border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (screenshotURLs.length === 0) {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center gap-4 text-white">
        <p className="text-sm text-gray-400">No screenshots to annotate.</p>
        <button
          onClick={() => router.push(`/dashboard/${id}`)}
          className="text-xs text-gray-500 hover:text-gray-300 underline"
        >
          Go back
        </button>
      </div>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">

      {/* ── Top bar ── */}
      <header className="flex items-center justify-between px-5 py-3.5 border-b border-white/10 bg-gray-900 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push(`/dashboard/${id}`)}
            className="text-gray-400 hover:text-white transition-colors text-sm"
          >
            ←
          </button>
          <div>
            <p className="text-xs text-gray-500">Annotating</p>
            <p className="text-sm font-semibold text-white truncate max-w-xs">{requestTitle}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {saveError && <p className="text-xs text-red-400">{saveError}</p>}
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-brand text-white text-sm font-semibold hover:bg-brand-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "Saving…" : "Save annotations"}
          </button>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">

        {/* ── Left: canvas area ── */}
        <div className="flex-1 flex flex-col min-w-0">

          {/* Screenshot tabs */}
          {screenshotURLs.length > 1 && (
            <div className="flex gap-1.5 px-4 py-2.5 border-b border-white/10 bg-gray-900 overflow-x-auto shrink-0">
              {screenshotURLs.map((url, i) => {
                const count = annotations.filter((a) => a.screenshotUrl === url).length;
                return (
                  <button
                    key={i}
                    onClick={() => setActiveIdx(i)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                      i === activeIdx
                        ? "bg-white/10 text-white"
                        : "text-gray-500 hover:text-gray-300"
                    }`}
                  >
                    Screenshot {i + 1}
                    {count > 0 && (
                      <span className="bg-brand/80 text-white text-[10px] px-1.5 py-0.5 rounded-full">
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Image + drawing overlay */}
          <div className="flex-1 flex items-center justify-center p-6 overflow-auto">
            <div className="relative inline-block" style={{ maxWidth: "100%", maxHeight: "calc(100vh - 220px)" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={currentUrl}
                alt={`Screenshot ${activeIdx + 1}`}
                draggable={false}
                className="block rounded-lg"
                style={{ maxWidth: "100%", maxHeight: "calc(100vh - 220px)", objectFit: "contain", userSelect: "none" }}
              />

              {/* Drawing + annotation overlay */}
              <div
                ref={overlayRef}
                className="absolute inset-0 rounded-lg"
                style={{ cursor: "crosshair" }}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
              >
                {/* Existing annotations */}
                {currentAnnotations.map((ann) => (
                  <div
                    key={ann.id}
                    className="absolute pointer-events-none"
                    style={{
                      left: `${ann.x * 100}%`,
                      top: `${ann.y * 100}%`,
                      width: `${ann.width * 100}%`,
                      height: `${ann.height * 100}%`,
                      border: `2px solid ${TYPE_COLORS[ann.type]}`,
                      backgroundColor: `${TYPE_COLORS[ann.type]}22`,
                    }}
                  >
                    <span
                      className="absolute text-white text-[10px] font-semibold px-1.5 py-0.5 rounded-sm whitespace-nowrap"
                      style={{
                        top: -20,
                        left: -1,
                        backgroundColor: TYPE_COLORS[ann.type],
                      }}
                    >
                      {ann.type}
                    </span>
                  </div>
                ))}

                {/* Live drawing rectangle */}
                {liveRect && (
                  <div
                    className="absolute pointer-events-none"
                    style={{
                      left: `${liveRect.x * 100}%`,
                      top: `${liveRect.y * 100}%`,
                      width: `${liveRect.w * 100}%`,
                      height: `${liveRect.h * 100}%`,
                      border: `2px dashed ${TYPE_COLORS[selectedType]}`,
                      backgroundColor: `${TYPE_COLORS[selectedType]}18`,
                    }}
                  />
                )}
              </div>
            </div>
          </div>

          {/* ── Type selector toolbar ── */}
          <div className="shrink-0 px-5 py-3 border-t border-white/10 bg-gray-900 flex items-center gap-2 flex-wrap">
            <span className="text-xs text-gray-500 mr-1">Draw as:</span>
            {TYPES.map((type) => (
              <button
                key={type}
                onClick={() => setSelectedType(type)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                  selectedType === type
                    ? "text-white border-transparent"
                    : "text-gray-400 border-white/10 hover:border-white/20 hover:text-gray-200"
                }`}
                style={
                  selectedType === type
                    ? { backgroundColor: TYPE_COLORS[type], borderColor: TYPE_COLORS[type] }
                    : {}
                }
              >
                {type}
              </button>
            ))}
          </div>
        </div>

        {/* ── Right: annotation list ── */}
        <aside className="w-60 shrink-0 border-l border-white/10 bg-gray-900 flex flex-col">
          <div className="px-4 py-3 border-b border-white/10">
            <p className="text-xs font-semibold text-gray-300">Annotations</p>
            <p className="text-xs text-gray-500 mt-0.5">
              {currentAnnotations.length} on this screenshot
            </p>
          </div>

          <div className="flex-1 overflow-y-auto py-2">
            {currentAnnotations.length === 0 ? (
              <p className="text-xs text-gray-600 text-center mt-8 px-4 leading-relaxed">
                Draw a box on the screenshot to add an annotation.
              </p>
            ) : (
              <ul className="space-y-1 px-2">
                {currentAnnotations.map((ann, i) => (
                  <li
                    key={ann.id}
                    className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg hover:bg-white/5 group"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-2.5 h-2.5 rounded-sm shrink-0"
                        style={{ backgroundColor: TYPE_COLORS[ann.type] }}
                      />
                      <span className="text-xs text-gray-300 truncate">{ann.type}</span>
                      <span className="text-xs text-gray-600">#{i + 1}</span>
                    </div>
                    <button
                      onClick={() => deleteAnnotation(ann.id)}
                      className="text-gray-600 hover:text-red-400 transition-colors text-xs opacity-0 group-hover:opacity-100 shrink-0"
                      aria-label="Delete annotation"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {currentAnnotations.length > 0 && (
            <div className="px-4 py-3 border-t border-white/10">
              <button
                onClick={() =>
                  setAnnotations((prev) =>
                    prev.filter((a) => a.screenshotUrl !== currentUrl)
                  )
                }
                className="text-xs text-gray-600 hover:text-red-400 transition-colors"
              >
                Clear all on this screenshot
              </button>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
