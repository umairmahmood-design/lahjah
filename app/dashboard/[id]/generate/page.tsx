"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import DashboardNav from "@/components/DashboardNav";
import { createNotification } from "@/lib/notifications";
import { type RequestStatus } from "@/lib/status";

type AnnotationType = "CTA" | "Heading" | "Error Message" | "Tooltip" | "Body Copy";
type CharacterLimit = "approximately_same" | "exactly_same" | "no_limit";
type AnnotationTask = "revise_and_translate" | "arabic_only" | "english_only";

interface Annotation {
  id: string;
  screenshotUrl: string;
  label: string;
  type: AnnotationType;
  note: string;
  existingCopy: string;
  characterLimit?: CharacterLimit;
  task?: AnnotationTask;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface CopyResult {
  status: "idle" | "loading" | "done" | "error";
  en: string[];
  ar: string[];
  error?: string;
}

// selectedEn/selectedAr are indices into the suggestions arrays
interface Selection {
  enIdx: number;
  arIdx: number;
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
  const [lockedTerms, setLockedTerms] = useState<string[]>([]);
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [results, setResults] = useState<Record<string, CopyResult>>({});
  const [selections, setSelections] = useState<Record<string, Selection>>({});
  const [requestStatus, setRequestStatus] = useState<RequestStatus>("draft");
  const [createdBy, setCreatedBy] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const hasGenerated = useRef(false);

  // ── Load request ────────────────────────────────────────────────────
  useEffect(() => {
    async function load() {
      try {
        const snap = await getDoc(doc(db, "copyRequests", id));
        if (snap.exists()) {
          const data = snap.data();
          setTitle(data.title ?? "");
          setContext(data.context ?? "");
          setTone(data.tone ?? "Professional");
          setLockedTerms(data.lockedTerms ?? []);
          setRequestStatus((data.status as RequestStatus) ?? "draft");
          setCreatedBy(data.createdBy ?? "");
          const anns: Annotation[] = data.annotations ?? [];
          setAnnotations(anns);

          // Initialise result + selection slots
          const initResults: Record<string, CopyResult> = {};
          const initSelections: Record<string, Selection> = {};
          for (const ann of anns) {
            initResults[ann.id] = { status: "idle", en: [], ar: [] };
            initSelections[ann.id] = { enIdx: 0, arIdx: 0 };
          }
          // Restore any previously saved selections
          const saved = data.copySelections as Record<string, { en: string; ar: string }> | undefined;
          setResults(initResults);
          setSelections(initSelections);
          // (saved selections will be applied after generation completes)
          void saved; // unused for now — regeneration always starts fresh
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  // Auto-generate once annotations are ready
  useEffect(() => {
    if (!loading && annotations.length > 0 && !hasGenerated.current) {
      hasGenerated.current = true;
      annotations.forEach((ann) => generateOne(ann));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, annotations]);

  // ── Generation ──────────────────────────────────────────────────────
  async function generateOne(ann: Annotation) {
    setResults((prev) => ({
      ...prev,
      [ann.id]: { status: "loading", en: [], ar: [] },
    }));
    // Reset selection for this annotation
    setSelections((prev) => ({ ...prev, [ann.id]: { enIdx: 0, arIdx: 0 } }));

    const description = [ann.label, `(${ann.type})`, ann.note ? `— ${ann.note}` : ""]
      .filter(Boolean)
      .join(" ");

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
        title,
        description,
        context,
        tone,
        lockedTerms,
        existingCopy: ann.existingCopy || undefined,
        characterLimit: ann.characterLimit,
        task: ann.task,
      }),
      });

      if (!res.ok) throw new Error("Generation failed");
      const data = await res.json() as { en: string[]; ar: string[] };

      setResults((prev) => ({
        ...prev,
        [ann.id]: { status: "done", en: data.en, ar: data.ar },
      }));
    } catch {
      setResults((prev) => ({
        ...prev,
        [ann.id]: { status: "error", en: [], ar: [], error: "Generation failed. Try again." },
      }));
    }
  }

  // ── Save selections ─────────────────────────────────────────────────
  async function handleSave() {
    setSaving(true);
    setSavedOk(false);
    try {
      const copySelections: Record<string, { en: string; ar: string }> = {};
      for (const ann of annotations) {
        const result = results[ann.id];
        const sel = selections[ann.id];
        if (result?.status === "done") {
          copySelections[ann.id] = {
            en: result.en[sel?.enIdx ?? 0] ?? "",
            ar: result.ar[sel?.arIdx ?? 0] ?? "",
          };
        }
      }
      await updateDoc(doc(db, "copyRequests", id), { copySelections });
      setSavedOk(true);
      setTimeout(() => setSavedOk(false), 2500);
    } catch {
      // fail silently — user can retry
    } finally {
      setSaving(false);
    }
  }

  // ── Save + submit ───────────────────────────────────────────────────
  async function handleSaveAndSubmit(isResubmit: boolean) {
    setSubmitting(true);
    setSubmitError("");
    try {
      const copySelections: Record<string, { en: string; ar: string }> = {};
      for (const ann of annotations) {
        const result = results[ann.id];
        const sel = selections[ann.id];
        if (result?.status === "done") {
          copySelections[ann.id] = {
            en: result.en[sel?.enIdx ?? 0] ?? "",
            ar: result.ar[sel?.arIdx ?? 0] ?? "",
          };
        }
      }

      await updateDoc(doc(db, "copyRequests", id), {
        copySelections,
        status: "submitted",
        ...(isResubmit ? { revisionNotes: null } : {}),
        submittedAt: serverTimestamp(),
      });

      // Notify all Copy Team admins
      const adminsSnap = await getDoc(doc(db, "settings", "admins"));
      const adminUids: string[] = adminsSnap.exists()
        ? (adminsSnap.data()?.uids as string[]) ?? []
        : [];

      const message = isResubmit
        ? `"${title}" has been revised and resubmitted for review`
        : `New request "${title}" submitted for review`;

      await Promise.all(
        adminUids
          .filter((uid) => uid !== auth.currentUser?.uid)
          .map((uid) => createNotification(uid, id, title, message))
      );

      router.push(`/dashboard/${id}`);
    } catch {
      setSubmitError("Failed to submit. Please try again.");
      setSubmitting(false);
    }
  }

  // ── Derived state ────────────────────────────────────────────────────
  const loadingCount = annotations.filter((a) => results[a.id]?.status === "loading").length;
  const doneCount = annotations.filter((a) => results[a.id]?.status === "done").length;
  const anyLoading = loadingCount > 0;
  const allDone = annotations.length > 0 && doneCount === annotations.length;

  // ── Page-level loading ───────────────────────────────────────────────
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
          <p className="text-sm text-gray-500 mb-4">
            No annotations found. Annotate your screenshots first.
          </p>
          <button
            onClick={() => router.push(`/dashboard/${id}`)}
            className="text-sm text-ink hover:underline"
          >
            ← Back to request
          </button>
        </div>
      </div>
    );
  }

  // ── Main render ──────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">
      <DashboardNav />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">

        {/* Header */}
        <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
          <div>
            <button
              onClick={() => router.push(`/dashboard/${id}`)}
              className="text-xs text-gray-400 hover:text-gray-600 transition-colors mb-2 flex items-center gap-1"
            >
              ← Back to request
            </button>
            <h1 className="text-xl font-bold text-gray-900">{title}</h1>
            <p className="text-sm text-gray-400 mt-1">
              {anyLoading
                ? `Generating copy for ${loadingCount} annotation${loadingCount !== 1 ? "s" : ""}…`
                : `${annotations.length} annotation${annotations.length !== 1 ? "s" : ""} · ${tone}`}
            </p>
            {lockedTerms.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                <span className="text-xs text-gray-400">Locked:</span>
                {lockedTerms.map((term) => (
                  <span
                    key={term}
                    className="inline-flex items-center px-2 py-0.5 rounded-full bg-ink text-white text-xs font-medium"
                  >
                    {term}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={() => annotations.forEach((ann) => generateOne(ann))}
              disabled={anyLoading}
              className="px-4 py-2 rounded-xl bg-ink text-white text-sm font-medium hover:bg-ink/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Regenerate all
            </button>
            <button
              onClick={handleSave}
              disabled={saving || anyLoading || !allDone}
              className="px-4 py-2 rounded-xl bg-brand text-ink text-sm font-semibold hover:bg-brand-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
            >
              {saving ? "Saving…" : savedOk ? "Saved ✓" : "Save selections"}
            </button>
          </div>
        </div>

        {/* Annotation cards */}
        <div className="space-y-5">
          {annotations.map((ann) => {
            const result = results[ann.id];
            const sel = selections[ann.id] ?? { enIdx: 0, arIdx: 0 };
            const isLoading = result?.status === "loading";
            const isDone = result?.status === "done";
            const isError = result?.status === "error";

            return (
              <div
                key={ann.id}
                className="bg-white rounded-2xl border border-gray-100 overflow-hidden"
              >
                {/* Card header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-50 gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className="w-2.5 h-2.5 rounded-sm shrink-0"
                      style={{ backgroundColor: TYPE_COLORS[ann.type] }}
                    />
                    <span className="font-semibold text-sm text-gray-900 truncate">
                      {ann.label}
                    </span>
                    <span
                      className="text-xs px-2 py-0.5 rounded-full font-medium shrink-0 bg-[#F4F5F6] text-ink"
                    >
                      {ann.type}
                    </span>
                  </div>
                  <button
                    onClick={() => generateOne(ann)}
                    disabled={isLoading}
                    className="text-xs text-gray-400 hover:text-ink transition-colors shrink-0 disabled:opacity-40"
                  >
                    {isLoading ? "Generating…" : "Regenerate"}
                  </button>
                </div>

                {/* Existing copy + note */}
                {(ann.existingCopy || ann.note) && (
                  <div className="px-5 py-2.5 bg-gray-50 border-b border-gray-100 space-y-1">
                    {ann.existingCopy && (
                      <p className="text-xs text-gray-500">
                        <span className="font-medium text-gray-400">Current text: </span>
                        <span className="italic">&ldquo;{ann.existingCopy}&rdquo;</span>
                      </p>
                    )}
                    {ann.note && (
                      <p className="text-xs text-gray-500">
                        <span className="font-medium text-gray-400">Note: </span>
                        {ann.note}
                      </p>
                    )}
                  </div>
                )}

                {/* Loading skeleton */}
                {isLoading && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-gray-100">
                    {["English", "Arabic"].map((lang) => (
                      <div key={lang} className="px-5 py-5">
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                          {lang}
                        </p>
                        <div className="space-y-2.5 animate-pulse">
                          {[1, 2, 3].map((i) => (
                            <div
                              key={i}
                              className="h-10 rounded-xl bg-gray-100"
                              style={{ width: `${70 + i * 8}%` }}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Error */}
                {isError && (
                  <div className="px-5 py-5 flex items-center justify-between gap-4">
                    <p className="text-sm text-red-500">{result.error}</p>
                    <button
                      onClick={() => generateOne(ann)}
                      className="text-xs text-ink hover:underline shrink-0"
                    >
                      Try again
                    </button>
                  </div>
                )}

                {/* Suggestions */}
                {isDone && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-gray-100">

                    {/* English */}
                    <div className="px-5 py-5">
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                        English
                      </p>
                      <div className="space-y-2">
                        {result.en.map((suggestion, i) => {
                          const isSelected = sel.enIdx === i;
                          return (
                            <button
                              key={i}
                              onClick={() =>
                                setSelections((prev) => ({
                                  ...prev,
                                  [ann.id]: { ...prev[ann.id], enIdx: i },
                                }))
                              }
                              className={`w-full text-left px-4 py-3 rounded-xl border text-sm leading-relaxed transition-all ${
                                isSelected
                                  ? "border-brand bg-brand/20 text-ink font-medium"
                                  : "border-gray-100 text-gray-700 hover:border-gray-200 hover:bg-gray-50"
                              }`}
                            >
                              <span className="text-[10px] font-semibold uppercase tracking-wide opacity-50 block mb-0.5">
                                Option {i + 1}
                              </span>
                              {suggestion}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Arabic */}
                    <div className="px-5 py-5">
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                        Arabic
                      </p>
                      <div className="space-y-2">
                        {result.ar.map((suggestion, i) => {
                          const isSelected = sel.arIdx === i;
                          return (
                            <button
                              key={i}
                              onClick={() =>
                                setSelections((prev) => ({
                                  ...prev,
                                  [ann.id]: { ...prev[ann.id], arIdx: i },
                                }))
                              }
                              className={`w-full text-right px-4 py-3 rounded-xl border text-sm leading-relaxed transition-all ${
                                isSelected
                                  ? "border-brand bg-brand/20 text-ink font-medium"
                                  : "border-gray-100 text-gray-700 hover:border-gray-200 hover:bg-gray-50"
                              }`}
                              dir="rtl"
                            >
                              <span className="text-[10px] font-semibold uppercase tracking-wide opacity-50 block mb-0.5" dir="ltr">
                                Option {i + 1}
                              </span>
                              {suggestion}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Bottom save bar */}
        {allDone && (
          <div className="mt-8 pb-8 bg-white rounded-2xl border border-gray-100 px-6 py-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <p className="text-sm text-gray-500">
                  Select your preferred suggestion for each annotation, then save or submit for review.
                </p>
                {submitError && (
                  <p className="text-xs text-red-500 mt-1">{submitError}</p>
                )}
              </div>
              <div className="flex gap-3 w-full sm:w-auto">
                <button
                  onClick={handleSave}
                  disabled={saving || submitting}
                  className="flex-1 sm:flex-none px-5 py-2.5 rounded-xl bg-[#F4F5F6] text-ink text-sm font-semibold hover:bg-gray-200 transition-colors disabled:opacity-50"
                >
                  {saving ? "Saving…" : savedOk ? "Saved ✓" : "Save selections"}
                </button>
                {(requestStatus === "draft" || requestStatus === "changes_requested") && (
                  <button
                    onClick={() => handleSaveAndSubmit(requestStatus === "changes_requested")}
                    disabled={submitting || saving}
                    className="flex-1 sm:flex-none px-5 py-2.5 rounded-xl bg-brand text-ink text-sm font-semibold hover:bg-brand-dark transition-colors disabled:opacity-50 shadow-sm"
                  >
                    {submitting
                      ? "Submitting…"
                      : requestStatus === "changes_requested"
                      ? "Resubmit for review"
                      : "Submit for review"}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
