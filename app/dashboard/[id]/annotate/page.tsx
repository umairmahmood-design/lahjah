"use client";

import { useEffect, useCallback, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

type AnnotationType = "CTA" | "Heading" | "Error Message" | "Tooltip" | "Body Copy";

interface Annotation {
  id: string;
  screenshotUrl: string;
  label: string;
  type: AnnotationType;
  note: string;
  x: number;      // 0–1
  y: number;      // 0–1
  width: number;  // 0–1
  height: number; // 0–1
}

interface DrawState {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

interface PendingRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const TYPES: AnnotationType[] = ["CTA", "Heading", "Error Message", "Tooltip", "Body Copy"];

const TYPE_COLORS: Record<AnnotationType, string> = {
  CTA: "#1B4FD8",
  Heading: "#7C3AED",
  "Error Message": "#DC2626",
  Tooltip: "#EAB308",
  "Body Copy": "#059669",
};

export default function AnnotatePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [screenshotURLs, setScreenshotURLs] = useState<string[]>([]);
  const [requestTitle, setRequestTitle] = useState("");
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [mode, setMode] = useState<"draw" | "select">("draw");

  // Drawing
  const [drawing, setDrawing] = useState<DrawState | null>(null);
  const [pendingRect, setPendingRect] = useState<PendingRect | null>(null);

  // New annotation popup
  const [newLabel, setNewLabel] = useState("");
  const [newType, setNewType] = useState<AnnotationType>("CTA");
  const [newNote, setNewNote] = useState("");
  const labelInputRef = useRef<HTMLInputElement>(null);

  // Selection
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Save state
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saveError, setSaveError] = useState("");

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

  // Focus label input when popup opens
  useEffect(() => {
    if (pendingRect) {
      setNewLabel("");
      setNewType("CTA");
      setNewNote("");
      setTimeout(() => labelInputRef.current?.focus(), 50);
    }
  }, [pendingRect]);

  // Delete selected annotation with keyboard
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId && !pendingRect) {
        // Don't fire if user is typing in an input
        if (document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA") return;
        setAnnotations((prev) => prev.filter((a) => a.id !== selectedId));
        setSelectedId(null);
      }
      if (e.key === "Escape") {
        setPendingRect(null);
        setSelectedId(null);
      }
    },
    [selectedId, pendingRect]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // ── Drawing ─────────────────────────────────────────────────────────
  function getRelativePos(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
    };
  }

  function handleMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    if (mode !== "draw") return;
    e.preventDefault();
    const pos = getRelativePos(e);
    setSelectedId(null);
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
    setDrawing(null);
    if (w > 0.02 && h > 0.02) {
      setPendingRect({ x, y, width: w, height: h });
    }
  }

  // ── Popup: confirm new annotation ───────────────────────────────────
  function confirmAnnotation() {
    if (!pendingRect || !newLabel.trim()) return;
    setAnnotations((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        screenshotUrl: screenshotURLs[activeIdx],
        label: newLabel.trim(),
        type: newType,
        note: newNote.trim(),
        ...pendingRect,
      },
    ]);
    setPendingRect(null);
  }

  function cancelAnnotation() {
    setPendingRect(null);
  }

  // ── Save ─────────────────────────────────────────────────────────────
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

  // ── Derived ──────────────────────────────────────────────────────────
  const currentUrl = screenshotURLs[activeIdx] ?? "";
  const currentAnnotations = annotations.filter((a) => a.screenshotUrl === currentUrl);

  const liveRect = drawing
    ? {
        x: Math.min(drawing.startX, drawing.currentX),
        y: Math.min(drawing.startY, drawing.currentY),
        w: Math.abs(drawing.currentX - drawing.startX),
        h: Math.abs(drawing.currentY - drawing.startY),
      }
    : null;

  // ── Loading ──────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="w-7 h-7 border-[3px] border-brand border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (screenshotURLs.length === 0) {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center gap-4">
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

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">

      {/* ── Top bar ── */}
      <header className="flex items-center justify-between px-5 py-3.5 border-b border-white/10 bg-gray-900 shrink-0 gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => router.push(`/dashboard/${id}`)}
            className="text-gray-400 hover:text-white transition-colors text-sm shrink-0"
          >
            ←
          </button>
          <div className="min-w-0">
            <p className="text-xs text-gray-500">Annotating</p>
            <p className="text-sm font-semibold text-white truncate">{requestTitle}</p>
          </div>
        </div>

        {/* Mode toggle */}
        <div className="flex items-center gap-1 bg-white/5 rounded-lg p-1 shrink-0">
          <button
            onClick={() => { setMode("draw"); setSelectedId(null); }}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              mode === "draw" ? "bg-white/10 text-white" : "text-gray-500 hover:text-gray-300"
            }`}
          >
            Draw
          </button>
          <button
            onClick={() => setMode("select")}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              mode === "select" ? "bg-white/10 text-white" : "text-gray-500 hover:text-gray-300"
            }`}
          >
            Select
          </button>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {saveError && <p className="text-xs text-red-400 hidden sm:block">{saveError}</p>}
          {selectedId && mode === "select" && (
            <button
              onClick={() => {
                setAnnotations((prev) => prev.filter((a) => a.id !== selectedId));
                setSelectedId(null);
              }}
              className="px-3 py-2 rounded-lg bg-red-500/20 text-red-400 text-xs font-semibold hover:bg-red-500/30 transition-colors"
            >
              Delete
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-brand text-white text-sm font-semibold hover:bg-brand-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </header>

      <div className="flex flex-1 min-h-0 flex-col lg:flex-row">

        {/* ── Canvas area ── */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0">

          {/* Screenshot tabs */}
          {screenshotURLs.length > 1 && (
            <div className="flex gap-1.5 px-4 py-2.5 border-b border-white/10 bg-gray-900 overflow-x-auto shrink-0">
              {screenshotURLs.map((url, i) => {
                const count = annotations.filter((a) => a.screenshotUrl === url).length;
                return (
                  <button
                    key={i}
                    onClick={() => { setActiveIdx(i); setSelectedId(null); }}
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

          {/* Image + overlay */}
          <div className="flex-1 flex items-center justify-center p-6 overflow-auto">
            <div
              className="relative inline-block"
              style={{ maxWidth: "100%", maxHeight: "calc(100vh - 200px)" }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={currentUrl}
                alt={`Screenshot ${activeIdx + 1}`}
                draggable={false}
                className="block rounded-lg select-none"
                style={{
                  maxWidth: "100%",
                  maxHeight: "calc(100vh - 200px)",
                  objectFit: "contain",
                }}
              />

              {/* Overlay */}
              <div
                className="absolute inset-0 rounded-lg"
                style={{ cursor: mode === "draw" ? "crosshair" : "default" }}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
              >
                {/* Existing annotations */}
                {currentAnnotations.map((ann) => {
                  const isSelected = ann.id === selectedId;
                  return (
                    <div
                      key={ann.id}
                      className="absolute"
                      style={{
                        left: `${ann.x * 100}%`,
                        top: `${ann.y * 100}%`,
                        width: `${ann.width * 100}%`,
                        height: `${ann.height * 100}%`,
                        border: `2px solid ${TYPE_COLORS[ann.type]}`,
                        backgroundColor: `${TYPE_COLORS[ann.type]}22`,
                        boxShadow: isSelected ? `0 0 0 2px white, 0 0 0 4px ${TYPE_COLORS[ann.type]}` : undefined,
                        cursor: mode === "select" ? "pointer" : "default",
                        pointerEvents: mode === "select" ? "auto" : "none",
                      }}
                      onClick={(e) => {
                        if (mode === "select") {
                          e.stopPropagation();
                          setSelectedId(isSelected ? null : ann.id);
                        }
                      }}
                    >
                      <span
                        className="absolute text-white text-[10px] font-semibold px-1.5 py-0.5 rounded-sm whitespace-nowrap leading-tight"
                        style={{
                          top: -20,
                          left: -1,
                          backgroundColor: TYPE_COLORS[ann.type],
                        }}
                      >
                        {ann.label}
                      </span>
                    </div>
                  );
                })}

                {/* Live drawing rect */}
                {liveRect && (
                  <div
                    className="absolute pointer-events-none"
                    style={{
                      left: `${liveRect.x * 100}%`,
                      top: `${liveRect.y * 100}%`,
                      width: `${liveRect.w * 100}%`,
                      height: `${liveRect.h * 100}%`,
                      border: `2px dashed ${TYPE_COLORS[newType]}`,
                      backgroundColor: `${TYPE_COLORS[newType]}18`,
                    }}
                  />
                )}
              </div>
            </div>
          </div>

          {/* Hint bar */}
          <div className="shrink-0 px-5 py-2.5 border-t border-white/10 bg-gray-900">
            <p className="text-xs text-gray-600 text-center">
              {mode === "draw"
                ? "Click and drag to draw a box around a UI element"
                : selectedId
                ? "Press Delete or use the Delete button to remove · Click elsewhere to deselect"
                : "Click an annotation to select it"}
            </p>
          </div>
        </div>

        {/* ── Right panel: annotation list ── */}
        <aside className="w-full lg:w-64 shrink-0 border-t lg:border-t-0 lg:border-l border-white/10 bg-gray-900 flex flex-col max-h-64 lg:max-h-none">
          <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-gray-300">Annotations</p>
              <p className="text-xs text-gray-500 mt-0.5">
                {currentAnnotations.length} on this screenshot
              </p>
            </div>
            {currentAnnotations.length > 0 && (
              <button
                onClick={() => {
                  setAnnotations((prev) => prev.filter((a) => a.screenshotUrl !== currentUrl));
                  setSelectedId(null);
                }}
                className="text-xs text-gray-600 hover:text-red-400 transition-colors"
              >
                Clear all
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto py-2">
            {currentAnnotations.length === 0 ? (
              <p className="text-xs text-gray-600 text-center mt-6 px-4 leading-relaxed">
                Switch to Draw mode and drag to add annotations.
              </p>
            ) : (
              <ul className="space-y-1 px-2">
                {currentAnnotations.map((ann) => (
                  <li
                    key={ann.id}
                    onClick={() => { setMode("select"); setSelectedId(ann.id); }}
                    className={`px-2.5 py-2 rounded-lg cursor-pointer transition-colors ${
                      ann.id === selectedId ? "bg-white/10" : "hover:bg-white/5"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2.5 h-2.5 rounded-sm shrink-0"
                        style={{ backgroundColor: TYPE_COLORS[ann.type] }}
                      />
                      <span className="text-xs text-gray-200 font-medium truncate">{ann.label}</span>
                    </div>
                    <p className="text-[11px] text-gray-500 mt-0.5 ml-4">{ann.type}</p>
                    {ann.note && (
                      <p className="text-[11px] text-gray-600 mt-0.5 ml-4 line-clamp-2">{ann.note}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>

      {/* ── New annotation popup ── */}
      {pendingRect && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-gray-900 border border-white/10 rounded-2xl p-5 w-full max-w-sm shadow-2xl">
            <h3 className="text-sm font-semibold text-white mb-4">New annotation</h3>

            {/* Label */}
            <div className="mb-3">
              <label className="block text-xs text-gray-400 mb-1.5">
                Label <span className="text-red-400">*</span>
              </label>
              <input
                ref={labelInputRef}
                type="text"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && confirmAnnotation()}
                placeholder="e.g. Main CTA button"
                className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand/60 transition"
              />
            </div>

            {/* Type */}
            <div className="mb-3">
              <label className="block text-xs text-gray-400 mb-1.5">Type</label>
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value as AnnotationType)}
                className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand/60 transition"
              >
                {TYPES.map((t) => (
                  <option key={t} value={t} className="bg-gray-900">
                    {t}
                  </option>
                ))}
              </select>
            </div>

            {/* Note */}
            <div className="mb-5">
              <label className="block text-xs text-gray-400 mb-1.5">Note</label>
              <textarea
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder="e.g. Revise the English and provide an Arabic translation"
                rows={3}
                className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-white placeholder-gray-600 focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand/60 transition resize-none"
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={cancelAnnotation}
                className="flex-1 py-2 rounded-lg border border-white/10 text-gray-400 text-sm font-medium hover:bg-white/5 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmAnnotation}
                disabled={!newLabel.trim()}
                className="flex-1 py-2 rounded-lg bg-brand text-white text-sm font-semibold hover:bg-brand-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Add annotation
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
