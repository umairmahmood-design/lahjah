"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { recognizeText } from "@/lib/ocr";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { auth, db, storage } from "@/lib/firebase";
import DashboardNav from "@/components/DashboardNav";
import { createNotification } from "@/lib/notifications";
import { getCopyTeamUids } from "@/lib/roles";

// ── Types ────────────────────────────────────────────────────────────────
type Tone = "Friendly" | "Professional" | "Playful" | "Urgent" | "Formal";
type AnnotationType = "CTA" | "Heading" | "Error Message" | "Tooltip" | "Body Copy";

interface UploadedFile {
  file: File;
  previewUrl: string;
  progress: number;
  downloadUrl: string | null;
  error: string | null;
}

type CharacterLimit = "approximately_same" | "exactly_same" | "no_limit";
type AnnotationTask = "revise_and_translate" | "arabic_only" | "english_only";

interface Annotation {
  id: string;
  screenshotUrl: string;
  label: string;
  type: AnnotationType;
  existingCopy: string;
  characterLimit: CharacterLimit;
  task: AnnotationTask;
  x: number;
  y: number;
  width: number;
  height: number;
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

interface CopyResult {
  status: "idle" | "loading" | "done" | "error";
  en: string[];
  ar: string[];
  error?: string;
}

interface Selection {
  enIdx: number;
  arIdx: number;
}

// ── Constants ────────────────────────────────────────────────────────────
const DOMAINS = ["Shopping", "New Verticals", "Growth", "Fulfillment", "Fintech"] as const;
const AUDIENCES = ["Customer", "Vendor", "Rider", "Internal", "External"] as const;
const TONES: Tone[] = ["Friendly", "Professional", "Playful", "Urgent", "Formal"];
const TONE_DESCRIPTIONS: Record<Tone, string> = {
  Friendly: "Warm, approachable, conversational",
  Professional: "Polished, clear, business-appropriate",
  Playful: "Fun, energetic, light-hearted",
  Urgent: "Action-oriented, time-sensitive",
  Formal: "Authoritative, precise, respectful",
};
const ANNOTATION_TYPES: AnnotationType[] = ["CTA", "Heading", "Error Message", "Tooltip", "Body Copy"];
const TYPE_COLORS: Record<AnnotationType, string> = {
  CTA: "#1B4FD8",
  Heading: "#7C3AED",
  "Error Message": "#DC2626",
  Tooltip: "#EAB308",
  "Body Copy": "#059669",
};

// ── Component ────────────────────────────────────────────────────────────
export default function NewRequestPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const labelInputRef = useRef<HTMLInputElement>(null);
  const competitorFileInputRef = useRef<HTMLInputElement>(null);

  // Form state
  const [title, setTitle] = useState("");
  const [domain, setDomain] = useState("");
  const [targetAudience, setTargetAudience] = useState("");
  const [publishingDeadline, setPublishingDeadline] = useState("");
  const [context, setContext] = useState("");
  const [problemStatement, setProblemStatement] = useState("");
  const [competitorResearch, setCompetitorResearch] = useState("");
  const [competitorFiles, setCompetitorFiles] = useState<UploadedFile[]>([]);
  const [tone, setTone] = useState<Tone>("Professional");
  const [lockedTerms, setLockedTerms] = useState<string[]>([]);
  const [termInput, setTermInput] = useState("");
  const [files, setFiles] = useState<UploadedFile[]>([]);

  // Annotation state
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [activeScreenIdx, setActiveScreenIdx] = useState(0);
  const [drawMode, setDrawMode] = useState<"draw" | "select">("draw");
  const [drawing, setDrawing] = useState<DrawState | null>(null);
  const [pendingRect, setPendingRect] = useState<PendingRect | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newLabel, setNewLabel] = useState("");
  const [newType, setNewType] = useState<AnnotationType>("CTA");
  const [newExistingCopy, setNewExistingCopy] = useState("");
  const [newCharacterLimit, setNewCharacterLimit] = useState<CharacterLimit>("no_limit");
  const [newTask, setNewTask] = useState<AnnotationTask>("revise_and_translate");
  const [ocrLoading, setOcrLoading] = useState(false);

  // Generation state
  const [results, setResults] = useState<Record<string, CopyResult>>({});
  const [selections, setSelections] = useState<Record<string, Selection>>({});
  const [generated, setGenerated] = useState(false);
  const [generating, setGenerating] = useState(false);

  // Feature 2: Copy button
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Feature 3: Previous results + custom copy
  const [previousResults, setPreviousResults] = useState<Record<string, CopyResult>>({});
  const [showCustom, setShowCustom] = useState<Set<string>>(new Set());
  const [customCopy, setCustomCopy] = useState<Record<string, { en: string; ar: string }>>({});

  // Feature 4: Multi-select
  const [selectedStrings, setSelectedStrings] = useState<Set<string>>(new Set());

  // Feature 1: Drag & drop
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const [fileDropError, setFileDropError] = useState<string | null>(null);
  const fileDragCounterRef = useRef(0);

  // Save state
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // ── Derived ──────────────────────────────────────────────────────────
  const uploadsInProgress = files.some((f) => f.downloadUrl === null && f.error === null);
  const uploadedFiles = files.filter((f) => f.downloadUrl !== null);
  const screenshotUrls = uploadedFiles.map((f) => f.downloadUrl as string);
  const safeActiveIdx = Math.min(activeScreenIdx, Math.max(0, screenshotUrls.length - 1));
  const currentUrl = screenshotUrls[safeActiveIdx] ?? "";
  const currentAnnotations = annotations.filter((a) => a.screenshotUrl === currentUrl);

  const loadingCount = annotations.filter((a) => results[a.id]?.status === "loading").length;
  const doneCount = annotations.filter((a) => results[a.id]?.status === "done").length;
  const allDone = generated && annotations.length > 0 && doneCount === annotations.length;

  const liveRect = drawing
    ? {
        x: Math.min(drawing.startX, drawing.currentX),
        y: Math.min(drawing.startY, drawing.currentY),
        w: Math.abs(drawing.currentX - drawing.startX),
        h: Math.abs(drawing.currentY - drawing.startY),
      }
    : null;

  // ── File upload ──────────────────────────────────────────────────────
  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? []);
    if (!selected.length) return;
    const startIdx = files.length;
    const newFiles: UploadedFile[] = selected.map((file) => ({
      file,
      previewUrl: URL.createObjectURL(file),
      progress: 0,
      downloadUrl: null,
      error: null,
    }));
    setFiles((prev) => [...prev, ...newFiles]);
    if (fileInputRef.current) fileInputRef.current.value = "";
    newFiles.forEach((f, i) => uploadFile(f.file, startIdx + i));
  }

  function uploadFile(file: File, index: number) {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const path = `screenshots/${uid}/${Date.now()}_${file.name}`;
    const storageRef = ref(storage, path);
    const task = uploadBytesResumable(storageRef, file);
    task.on(
      "state_changed",
      (snap) => {
        const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
        setFiles((prev) => {
          const updated = [...prev];
          if (updated[index]) updated[index] = { ...updated[index], progress: pct };
          return updated;
        });
      },
      (err) => {
        setFiles((prev) => {
          const updated = [...prev];
          if (updated[index]) updated[index] = { ...updated[index], error: err.message };
          return updated;
        });
      },
      async () => {
        const url = await getDownloadURL(task.snapshot.ref);
        setFiles((prev) => {
          const updated = [...prev];
          if (updated[index]) updated[index] = { ...updated[index], downloadUrl: url, progress: 100 };
          return updated;
        });
      }
    );
  }

  function removeFile(index: number) {
    setFiles((prev) => {
      const updated = [...prev];
      const removed = updated.splice(index, 1)[0];
      URL.revokeObjectURL(removed.previewUrl);
      if (removed.downloadUrl) {
        setAnnotations((a) => a.filter((ann) => ann.screenshotUrl !== removed.downloadUrl));
      }
      return updated;
    });
    setActiveScreenIdx((i) => Math.max(0, Math.min(i, screenshotUrls.length - 2)));
  }

  // ── Drag & drop / paste helpers (Feature 1) ─────────────────────────
  function attachDroppedFiles(droppedFiles: File[]) {
    const ACCEPTED = ["image/png", "image/jpeg", "image/webp"];
    const valid = droppedFiles.filter((f) => ACCEPTED.includes(f.type));
    if (valid.length < droppedFiles.length) {
      setFileDropError("Only image files are supported");
      setTimeout(() => setFileDropError(null), 3000);
    }
    if (!valid.length) return;
    const startIdx = files.length;
    const newUploads: UploadedFile[] = valid.map((file) => ({
      file,
      previewUrl: URL.createObjectURL(file),
      progress: 0,
      downloadUrl: null,
      error: null,
    }));
    setFiles((prev) => [...prev, ...newUploads]);
    valid.forEach((f, i) => uploadFile(f, startIdx + i));
  }

  function handleFileDragEnter(e: React.DragEvent) {
    e.preventDefault();
    fileDragCounterRef.current += 1;
    if (fileDragCounterRef.current === 1) setIsDraggingFiles(true);
  }

  function handleFileDragLeave(e: React.DragEvent) {
    e.preventDefault();
    fileDragCounterRef.current -= 1;
    if (fileDragCounterRef.current === 0) setIsDraggingFiles(false);
  }

  function handleFileDragOver(e: React.DragEvent) {
    e.preventDefault();
  }

  function handleFileDrop(e: React.DragEvent) {
    e.preventDefault();
    fileDragCounterRef.current = 0;
    setIsDraggingFiles(false);
    const dropped = Array.from(e.dataTransfer.files);
    if (dropped.length) attachDroppedFiles(dropped);
  }

  // ── Competitor screenshot upload ─────────────────────────────────────
  function handleCompetitorFileChange(e: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? []);
    if (!selected.length) return;
    const startIdx = competitorFiles.length;
    const newFiles: UploadedFile[] = selected.map((file) => ({
      file,
      previewUrl: URL.createObjectURL(file),
      progress: 0,
      downloadUrl: null,
      error: null,
    }));
    setCompetitorFiles((prev) => [...prev, ...newFiles]);
    if (competitorFileInputRef.current) competitorFileInputRef.current.value = "";
    newFiles.forEach((f, i) => uploadCompetitorFile(f.file, startIdx + i));
  }

  function uploadCompetitorFile(file: File, index: number) {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    const path = `competitor-refs/${uid}/${Date.now()}_${file.name}`;
    const storageRef = ref(storage, path);
    const task = uploadBytesResumable(storageRef, file);
    task.on(
      "state_changed",
      (snap) => {
        const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
        setCompetitorFiles((prev) => {
          const updated = [...prev];
          if (updated[index]) updated[index] = { ...updated[index], progress: pct };
          return updated;
        });
      },
      (err) => {
        setCompetitorFiles((prev) => {
          const updated = [...prev];
          if (updated[index]) updated[index] = { ...updated[index], error: err.message };
          return updated;
        });
      },
      async () => {
        const url = await getDownloadURL(task.snapshot.ref);
        setCompetitorFiles((prev) => {
          const updated = [...prev];
          if (updated[index]) updated[index] = { ...updated[index], downloadUrl: url, progress: 100 };
          return updated;
        });
      }
    );
  }

  function removeCompetitorFile(index: number) {
    setCompetitorFiles((prev) => {
      const updated = [...prev];
      const removed = updated.splice(index, 1)[0];
      URL.revokeObjectURL(removed.previewUrl);
      return updated;
    });
  }

  // ── Locked terms ─────────────────────────────────────────────────────
  function commitTerm() {
    const val = termInput.trim();
    if (val && !lockedTerms.includes(val)) setLockedTerms((prev) => [...prev, val]);
    setTermInput("");
  }

  function handleTermKeyDown(e: ReactKeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commitTerm();
    } else if (e.key === "Backspace" && termInput === "" && lockedTerms.length > 0) {
      setLockedTerms((prev) => prev.slice(0, -1));
    }
  }

  // ── Annotation drawing ───────────────────────────────────────────────
  function getRelativePos(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
    };
  }

  function handleMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    if (drawMode !== "draw") return;
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
    if (w > 0.02 && h > 0.02) setPendingRect({ x, y, width: w, height: h });
  }

  // Focus label input when popup opens + run OCR on drawn region
  useEffect(() => {
    console.log("[OCR] pendingRect useEffect fired, pendingRect:", pendingRect);
    if (!pendingRect) return;

    setNewLabel("");
    setNewType("CTA");
    setNewExistingCopy("");
    setNewCharacterLimit("no_limit");
    setNewTask("revise_and_translate");
    setTimeout(() => labelInputRef.current?.focus(), 50);

    if (!currentUrl) {
      console.log("[OCR] No screenshot URL — skipping");
      return;
    }

    let cancelled = false;
    setOcrLoading(true);
    console.log("[OCR] Starting — rect:", pendingRect, "url:", currentUrl.slice(0, 80));

    (async () => {
      try {
        console.log("[OCR] Fetching image blob via proxy…");
        const response = await fetch(`/api/proxy-image?url=${encodeURIComponent(currentUrl)}`);
        if (!response.ok) throw new Error(`Fetch ${response.status}: ${response.statusText}`);
        const blob = await response.blob();
        const blobUrl = URL.createObjectURL(blob);
        console.log("[OCR] Blob ready, loading into offscreen Image…");

        // `new window.Image()` avoids collision with the next/image import
        const offscreen = await new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new window.Image();
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error("Offscreen image load failed"));
          img.src = blobUrl;
        });
        URL.revokeObjectURL(blobUrl);

        const nw = offscreen.naturalWidth;
        const nh = offscreen.naturalHeight;
        console.log(`[OCR] Image size: ${nw}×${nh}`);

        const cropX = Math.round(pendingRect.x * nw);
        const cropY = Math.round(pendingRect.y * nh);
        const cropW = Math.round(pendingRect.width * nw);
        const cropH = Math.round(pendingRect.height * nh);
        console.log(`[OCR] Crop: x=${cropX} y=${cropY} w=${cropW} h=${cropH}`);

        const canvas = document.createElement("canvas");
        canvas.width = cropW;
        canvas.height = cropH;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Canvas 2D context unavailable");
        ctx.drawImage(offscreen, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

        console.log("[OCR] Canvas drawn — running Tesseract (3× upscale + Otsu threshold)…");
        const text = await recognizeText(canvas);
        console.log("[OCR] Result:", JSON.stringify(text));

        if (!cancelled) {
          setNewExistingCopy(text);
        }
      } catch (err) {
        console.error("[OCR] Failed:", err);
      } finally {
        if (!cancelled) setOcrLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      setOcrLoading(false);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingRect]);

  // Keyboard: delete selected / escape
  const handleGlobalKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if ((e.key === "Delete" || e.key === "Backspace") && selectedId && !pendingRect) {
        const tag = (document.activeElement as HTMLElement)?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") return;
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
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [handleGlobalKeyDown]);

  // Paste images anywhere on page (Feature 1)
  useEffect(() => {
    function handleWindowPaste(e: ClipboardEvent) {
      const items = Array.from(e.clipboardData?.items ?? []);
      const imageFiles = items
        .filter((i) => i.kind === "file" && i.type.startsWith("image/"))
        .map((i) => i.getAsFile())
        .filter((f): f is File => f !== null);
      if (!imageFiles.length) return;
      e.preventDefault();
      attachDroppedFiles(imageFiles);
    }
    window.addEventListener("paste", handleWindowPaste);
    return () => window.removeEventListener("paste", handleWindowPaste);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files]);

  function confirmAnnotation() {
    if (!pendingRect || !newLabel.trim()) return;
    const newAnn: Annotation = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      screenshotUrl: currentUrl,
      label: newLabel.trim(),
      type: newType,
      existingCopy: newExistingCopy.trim(),
      characterLimit: newCharacterLimit,
      task: newTask,
      ...pendingRect,
    };
    setAnnotations((prev) => [...prev, newAnn]);
    setResults((prev) => ({ ...prev, [newAnn.id]: { status: "idle", en: [], ar: [] } }));
    setSelections((prev) => ({ ...prev, [newAnn.id]: { enIdx: 0, arIdx: 0 } }));
    setPendingRect(null);
  }

  // ── Generation ───────────────────────────────────────────────────────
  async function generateOne(ann: Annotation) {
    // Feature 3: Save current result as previous before overwriting
    const current = results[ann.id];
    if (current?.status === "done") {
      setPreviousResults((prev) => ({ ...prev, [ann.id]: current }));
    }
    setResults((prev) => ({ ...prev, [ann.id]: { status: "loading", en: [], ar: [] } }));
    setSelections((prev) => ({ ...prev, [ann.id]: { enIdx: 0, arIdx: 0 } }));
    const description = `${ann.label} (${ann.type})`;
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
      const data = (await res.json()) as { en: string[]; ar: string[] };
      setResults((prev) => ({ ...prev, [ann.id]: { status: "done", en: data.en, ar: data.ar } }));
    } catch {
      setResults((prev) => ({
        ...prev,
        [ann.id]: { status: "error", en: [], ar: [], error: "Generation failed. Try again." },
      }));
    }
  }

  async function handleGenerate() {
    if (annotations.length === 0 || uploadsInProgress || generating) return;
    setGenerating(true);
    setGenerated(true);
    await Promise.all(annotations.map((ann) => generateOne(ann)));
    setGenerating(false);
  }

  // ── Copy to clipboard (Feature 2) ────────────────────────────────────
  async function copyText(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {}
  }

  // ── Multi-select helpers (Feature 4) ─────────────────────────────────
  function toggleStringSelection(id: string) {
    setSelectedStrings((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function submitSelected() {
    setError("");
    if (!title.trim()) { setError("Request title is required."); return; }
    if (!domain) { setError("Please select a domain before submitting."); return; }
    if (!targetAudience) { setError("Please select a target audience before submitting."); return; }
    if (!publishingDeadline) { setError("Publishing deadline is required before submitting."); return; }
    if (!context.trim()) { setError("Feature context is required before submitting."); return; }
    if (!problemStatement.trim()) { setError("Problem statement is required before submitting."); return; }
    if (selectedStrings.size === 0) return;
    if (uploadsInProgress) { setError("Please wait for uploads to finish."); return; }
    const uid = auth.currentUser?.uid;
    if (!uid) { setError("You must be signed in."); return; }
    setSaving(true);
    try {
      const screenshotURLs = files.filter((f) => f.downloadUrl).map((f) => f.downloadUrl as string);
      const finalTerms = termInput.trim() && !lockedTerms.includes(termInput.trim())
        ? [...lockedTerms, termInput.trim()] : lockedTerms;
      const copySelections: Record<string, { en: string; ar: string }> = {};
      for (const ann of annotations) {
        if (!selectedStrings.has(ann.id)) continue;
        const custom = customCopy[ann.id];
        if (custom?.en || custom?.ar) {
          copySelections[ann.id] = { en: custom.en ?? "", ar: custom.ar ?? "" };
        } else {
          const result = results[ann.id];
          const sel = selections[ann.id];
          if (result?.status === "done") {
            copySelections[ann.id] = {
              en: result.en[sel?.enIdx ?? 0] ?? "",
              ar: result.ar[sel?.arIdx ?? 0] ?? "",
            };
          }
        }
      }
      const docRef = await addDoc(collection(db, "copyRequests"), {
        title: title.trim(), domain, targetAudience, publishingDeadline,
        context: context.trim(), problemStatement: problemStatement.trim(),
        competitorResearch: competitorResearch.trim(),
        competitorScreenshotURLs: competitorFiles.filter((f) => f.downloadUrl).map((f) => f.downloadUrl as string),
        tone, lockedTerms: finalTerms, screenshotURLs, annotations, copySelections,
        status: "submitted", createdBy: uid,
        createdAt: serverTimestamp(), submittedAt: serverTimestamp(),
      });
      const adminUids = await getCopyTeamUids();
      await Promise.all(
        adminUids.filter((adminUid) => adminUid !== uid).map((adminUid) =>
          createNotification(adminUid, docRef.id, title.trim(), `New request "${title.trim()}" submitted for review`)
        )
      );
      router.push(`/dashboard/${docRef.id}`);
    } catch {
      setError("Failed to save. Please try again.");
      setSaving(false);
    }
  }

  // ── Save ─────────────────────────────────────────────────────────────
  async function save(status: "draft" | "submitted") {
    setError("");
    if (!title.trim()) { setError("Request title is required."); return; }
    if (status === "submitted" && !domain) { setError("Please select a domain before submitting."); return; }
    if (status === "submitted" && !targetAudience) { setError("Please select a target audience before submitting."); return; }
    if (status === "submitted" && !publishingDeadline) { setError("Publishing deadline is required before submitting."); return; }
    if (status === "submitted" && !context.trim()) { setError("Feature context is required before submitting."); return; }
    if (status === "submitted" && !problemStatement.trim()) { setError("Problem statement is required before submitting."); return; }
    if (status === "submitted" && annotations.length === 0) { setError("Add at least one annotation before submitting."); return; }
    if (uploadsInProgress) { setError("Please wait for uploads to finish."); return; }
    const uid = auth.currentUser?.uid;
    if (!uid) { setError("You must be signed in."); return; }

    setSaving(true);
    try {
      const screenshotURLs = files
        .filter((f) => f.downloadUrl)
        .map((f) => f.downloadUrl as string);

      const finalTerms =
        termInput.trim() && !lockedTerms.includes(termInput.trim())
          ? [...lockedTerms, termInput.trim()]
          : lockedTerms;

      // Build copy selections (Feature 3: prefer custom copy)
      const copySelections: Record<string, { en: string; ar: string }> = {};
      for (const ann of annotations) {
        const custom = customCopy[ann.id];
        if (custom?.en || custom?.ar) {
          copySelections[ann.id] = { en: custom.en ?? "", ar: custom.ar ?? "" };
        } else {
          const result = results[ann.id];
          const sel = selections[ann.id];
          if (result?.status === "done") {
            copySelections[ann.id] = {
              en: result.en[sel?.enIdx ?? 0] ?? "",
              ar: result.ar[sel?.arIdx ?? 0] ?? "",
            };
          }
        }
      }

      const docRef = await addDoc(collection(db, "copyRequests"), {
        title: title.trim(),
        domain,
        targetAudience,
        publishingDeadline,
        context: context.trim(),
        problemStatement: problemStatement.trim(),
        competitorResearch: competitorResearch.trim(),
        competitorScreenshotURLs: competitorFiles
          .filter((f) => f.downloadUrl)
          .map((f) => f.downloadUrl as string),
        tone,
        lockedTerms: finalTerms,
        screenshotURLs,
        annotations,
        copySelections,
        status,
        createdBy: uid,
        createdAt: serverTimestamp(),
        ...(status === "submitted" ? { submittedAt: serverTimestamp() } : {}),
      });

      if (status === "submitted") {
        // Notify Copy Team members
        const adminUids = await getCopyTeamUids();
        await Promise.all(
          adminUids
            .filter((adminUid) => adminUid !== uid)
            .map((adminUid) =>
              createNotification(adminUid, docRef.id, title.trim(), `New request "${title.trim()}" submitted for review`)
            )
        );
        router.push(`/dashboard/${docRef.id}`);
      } else {
        router.push("/dashboard");
      }
    } catch {
      setError("Failed to save. Please try again.");
      setSaving(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────
  const showAnnotationCanvas = uploadedFiles.length > 0 && !uploadsInProgress;

  return (
    <div className="min-h-screen bg-gray-50">
      <DashboardNav />

      <main className="px-4 sm:px-6 lg:px-8 py-6 pb-36">

        {/* Header — full width */}
        <div className="mb-6">
          <button
            onClick={() => router.push("/dashboard")}
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors mb-3 flex items-center gap-1"
          >
            ← All requests
          </button>
          <h1 className="text-xl font-bold text-gray-900">New copy request</h1>
          <p className="text-xs text-gray-400 mt-1">Fill in the details, annotate, generate copy, then submit.</p>
        </div>

        {/* Two-column layout */}
        <div className="flex flex-col lg:flex-row gap-6 items-start">

          {/* ── LEFT COLUMN (~40%) — form fields + sticky actions ── */}
          <div className="w-full lg:w-[40%] flex flex-col gap-4 lg:sticky lg:top-6">

            {/* Title */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Request title <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Checkout screen: CTA and error states"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand transition"
              />
            </div>

            {/* Domain / Target Audience / Deadline */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">
                    Domain <span className="text-red-400">*</span>
                  </label>
                  <select
                    value={domain}
                    onChange={(e) => setDomain(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand transition bg-white text-gray-700"
                  >
                    <option value="">Select…</option>
                    {DOMAINS.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1.5">
                    Target audience <span className="text-red-400">*</span>
                  </label>
                  <select
                    value={targetAudience}
                    onChange={(e) => setTargetAudience(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand transition bg-white text-gray-700"
                  >
                    <option value="">Select…</option>
                    {AUDIENCES.map((a) => (
                      <option key={a} value={a}>{a}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">
                  Publishing deadline <span className="text-red-400">*</span>
                </label>
                <input
                  type="date"
                  value={publishingDeadline}
                  onChange={(e) => setPublishingDeadline(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand transition text-gray-700"
                />
              </div>
            </div>

            {/* Feature context */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Feature context <span className="text-red-400">*</span>
              </label>
              <p className="text-xs text-gray-400 mb-2">
                Describe what the feature or design does, how the user will interact with it, and the business rationale behind it. Give full context of the user journey.
              </p>
              <textarea
                value={context}
                onChange={(e) => setContext(e.target.value)}
                rows={4}
                placeholder="e.g. This is the checkout screen for a food delivery app. The user has reviewed their cart and is ready to place the order. We need copy for the main CTA button, the order summary heading, and the error state when payment fails."
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand transition resize-none"
              />
            </div>

            {/* Problem statement */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                What problem does it solve? <span className="text-red-400">*</span>
              </label>
              <p className="text-xs text-gray-400 mb-2">
                Explain both the user pain point and the business pain or goal this feature addresses. Why does this feature exist?
              </p>
              <textarea
                value={problemStatement}
                onChange={(e) => setProblemStatement(e.target.value)}
                rows={3}
                placeholder="e.g. Users frequently drop off at checkout because they're unsure if the order went through. This feature adds clear confirmation states to reduce support tickets and improve trust."
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand transition resize-none"
              />
            </div>

            {/* Competitor research */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                How do similar competitors do it?
                <span className="ml-1.5 text-xs font-normal text-gray-400">Optional</span>
              </label>
              <p className="text-xs text-gray-400 mb-2">
                How do similar competitors (Keeta, Jahez, Ninja, etc.) do it?
              </p>
              <textarea
                value={competitorResearch}
                onChange={(e) => setCompetitorResearch(e.target.value)}
                rows={3}
                placeholder="e.g. Keeta uses 'Order placed!' with a checkmark. Jahez shows a countdown timer before confirming."
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand transition resize-none mb-3"
              />
              {/* Competitor screenshot upload */}
              <input
                ref={competitorFileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleCompetitorFileChange}
              />
              {competitorFiles.length === 0 ? (
                <button
                  type="button"
                  onClick={() => competitorFileInputRef.current?.click()}
                  className="w-full border border-dashed border-gray-200 rounded-xl py-3 flex items-center justify-center gap-2 hover:border-ink/20 hover:bg-brand/10 transition-all text-xs text-gray-400"
                >
                  <span className="text-base">⬆</span>
                  Upload competitor screenshots
                </button>
              ) : (
                <div>
                  <div className="grid grid-cols-4 gap-2 mb-2">
                    {competitorFiles.map((f, i) => (
                      <div key={i} className="relative group aspect-square">
                        <Image
                          src={f.previewUrl}
                          alt={f.file.name}
                          fill
                          className="object-cover rounded-lg border border-gray-100"
                          sizes="80px"
                        />
                        {f.progress < 100 && !f.error && (
                          <div className="absolute inset-0 bg-black/40 rounded-lg flex items-center justify-center">
                            <span className="text-white text-[10px] font-medium">{f.progress}%</span>
                          </div>
                        )}
                        {f.error && (
                          <div className="absolute inset-0 bg-red-500/60 rounded-lg flex items-center justify-center">
                            <span className="text-white text-[10px]">Error</span>
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => removeCompetitorFile(i)}
                          className="absolute top-1 right-1 w-4 h-4 bg-black/50 rounded-full text-white text-[10px] opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => competitorFileInputRef.current?.click()}
                      className="aspect-square rounded-lg border border-dashed border-gray-200 flex items-center justify-center text-gray-300 hover:border-ink/20 hover:text-ink/40 text-xl"
                    >
                      +
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Tone */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <label className="block text-sm font-medium text-gray-700 mb-3">Tone</label>
              <div className="flex flex-wrap gap-2">
                {TONES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTone(t)}
                    className={`px-4 py-2 rounded-full text-sm font-medium border transition-all ${
                      tone === t
                        ? "bg-brand text-ink border-brand shadow-sm"
                        : "bg-white text-gray-600 border-gray-200 hover:border-ink/30 hover:text-ink"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
              {tone && <p className="text-xs text-gray-400 mt-2.5">{TONE_DESCRIPTIONS[tone]}</p>}
            </div>

            {/* Locked terms */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <label className="block text-sm font-medium text-gray-700 mb-1">Locked terms</label>
              <p className="text-xs text-gray-400 mb-3">
                Brand names or phrases the AI must never alter. Press Enter or comma to add.
              </p>
              <div className="flex flex-wrap gap-2 min-h-[40px] px-3 py-2 rounded-lg border border-gray-200 focus-within:ring-2 focus-within:ring-brand/20 focus-within:border-brand transition">
                {lockedTerms.map((term) => (
                  <span
                    key={term}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-ink text-white text-xs font-medium"
                  >
                    {term}
                    <button
                      type="button"
                      onClick={() => setLockedTerms((prev) => prev.filter((t) => t !== term))}
                      className="text-white/60 hover:text-white transition-colors leading-none"
                      aria-label={`Remove ${term}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
                <input
                  type="text"
                  value={termInput}
                  onChange={(e) => setTermInput(e.target.value)}
                  onKeyDown={handleTermKeyDown}
                  onBlur={commitTerm}
                  placeholder={lockedTerms.length === 0 ? "e.g. HungerStation, طلبات" : ""}
                  className="flex-1 min-w-[140px] text-sm outline-none bg-transparent placeholder-gray-300"
                />
              </div>
            </div>

          </div>

          {/* ── RIGHT COLUMN (~60%) — screenshots + annotation ── */}
          <div className="w-full lg:flex-1 flex flex-col gap-4">

            {/* Screenshots upload */}
            <div
              className="bg-white rounded-2xl border border-gray-100 p-5 relative"
              onDragEnter={handleFileDragEnter}
              onDragLeave={handleFileDragLeave}
              onDragOver={handleFileDragOver}
              onDrop={handleFileDrop}
            >
              {/* Drop error toast */}
              {fileDropError && (
                <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 px-3 py-1.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 shadow-sm whitespace-nowrap">
                  {fileDropError}
                </div>
              )}
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm font-medium text-gray-700">Screenshots</label>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="text-xs font-medium text-ink hover:text-ink/70 transition-colors"
                >
                  + Add images
                </button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleFileChange}
              />
              {files.length === 0 ? (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className={`w-full border-2 border-dashed rounded-xl py-14 flex flex-col items-center gap-2 transition-all group ${
                    isDraggingFiles
                      ? "border-brand bg-blue-50/60"
                      : "border-gray-200 hover:border-ink/20 hover:bg-brand/10"
                  }`}
                >
                  <span className={`text-3xl transition-colors ${isDraggingFiles ? "text-brand" : "text-gray-300 group-hover:text-ink/40"}`}>⬆</span>
                  <span className={`text-sm ${isDraggingFiles ? "text-brand font-semibold" : "text-gray-400"}`}>
                    {isDraggingFiles ? "Drop images here" : "Click to upload images"}
                  </span>
                  {!isDraggingFiles && <span className="text-xs text-gray-300">PNG, JPG, WebP — or drag and drop</span>}
                </button>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-3">
                  {files.map((f, i) => (
                    <div key={i} className="relative group aspect-square">
                      <Image
                        src={f.previewUrl}
                        alt={f.file.name}
                        fill
                        className="object-cover rounded-xl border border-gray-100"
                        sizes="120px"
                      />
                      {f.progress < 100 && !f.error && (
                        <div className="absolute inset-0 bg-black/40 rounded-xl flex flex-col items-center justify-center gap-1">
                          <div className="w-10 h-1 bg-white/30 rounded-full overflow-hidden">
                            <div className="h-full bg-white rounded-full transition-all" style={{ width: `${f.progress}%` }} />
                          </div>
                          <span className="text-white text-xs font-medium">{f.progress}%</span>
                        </div>
                      )}
                      {f.error && (
                        <div className="absolute inset-0 bg-red-500/60 rounded-xl flex items-center justify-center">
                          <span className="text-white text-xs font-medium">Failed</span>
                        </div>
                      )}
                      {f.downloadUrl && (
                        <div className="absolute top-1.5 right-1.5 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center">
                          <span className="text-white text-xs">✓</span>
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => removeFile(i)}
                        className="absolute top-1.5 left-1.5 w-5 h-5 bg-black/50 rounded-full text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                        aria-label="Remove image"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="aspect-square rounded-xl border-2 border-dashed border-gray-200 flex items-center justify-center text-gray-300 hover:border-ink/20 hover:text-ink/40 hover:bg-brand/10 transition-all text-2xl"
                  >
                    +
                  </button>
                </div>
              )}
              {/* Dragging overlay when files already exist */}
              {isDraggingFiles && files.length > 0 && (
                <div className="absolute inset-0 rounded-2xl border-2 border-dashed border-brand bg-blue-50/60 flex items-center justify-center pointer-events-none z-10">
                  <span className="text-sm font-semibold text-brand">Drop images here</span>
                </div>
              )}
            </div>

            {/* Annotation canvas — appears after upload */}
            {showAnnotationCanvas && (
              <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                {/* Canvas header */}
                <div className="px-5 py-3.5 border-b border-gray-100 flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-gray-700">Annotate screenshots</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Draw boxes around UI elements that need copy
                    </p>
                  </div>
                  <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1 shrink-0">
                    <button
                      onClick={() => { setDrawMode("draw"); setSelectedId(null); }}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                        drawMode === "draw" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
                      }`}
                    >
                      Draw
                    </button>
                    <button
                      onClick={() => setDrawMode("select")}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                        drawMode === "select" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
                      }`}
                    >
                      Select
                    </button>
                  </div>
                </div>

                {/* Screenshot tabs */}
                {screenshotUrls.length > 1 && (
                  <div className="flex gap-1.5 px-4 py-2 border-b border-gray-100 overflow-x-auto">
                    {screenshotUrls.map((url, i) => {
                      const count = annotations.filter((a) => a.screenshotUrl === url).length;
                      return (
                        <button
                          key={i}
                          onClick={() => { setActiveScreenIdx(i); setSelectedId(null); }}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                            i === safeActiveIdx ? "bg-ink text-white" : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                          }`}
                        >
                          Screenshot {i + 1}
                          {count > 0 && (
                            <span className="bg-ink text-white text-[10px] px-1.5 py-0.5 rounded-full">
                              {count}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Canvas area */}
                <div className="p-4 bg-gray-50 flex justify-center">
                  <div className="relative w-full" style={{ userSelect: "none" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={currentUrl}
                      alt={`Screenshot ${safeActiveIdx + 1}`}
                      draggable={false}
                      className="block w-full rounded-lg select-none max-h-[520px] object-contain"
                    />
                    <div
                      className="absolute inset-0 rounded-lg"
                      style={{ cursor: drawMode === "draw" ? "crosshair" : "default" }}
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
                              boxShadow: isSelected
                                ? `0 0 0 2px white, 0 0 0 4px ${TYPE_COLORS[ann.type]}`
                                : undefined,
                              cursor: drawMode === "select" ? "pointer" : "default",
                              pointerEvents: drawMode === "select" ? "auto" : "none",
                            }}
                            onClick={(e) => {
                              if (drawMode === "select") {
                                e.stopPropagation();
                                setSelectedId(isSelected ? null : ann.id);
                              }
                            }}
                          >
                            <span
                              className="absolute text-white text-[10px] font-semibold px-1.5 py-0.5 rounded-sm whitespace-nowrap leading-tight"
                              style={{ top: -20, left: -1, backgroundColor: TYPE_COLORS[ann.type] }}
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
                <div className="px-5 py-2.5 border-t border-gray-100">
                  <p className="text-xs text-gray-400 text-center">
                    {drawMode === "draw"
                      ? "Click and drag on the screenshot to mark a UI element"
                      : selectedId
                      ? "Press Delete to remove the selected annotation · Click elsewhere to deselect"
                      : "Click an annotation box to select it"}
                  </p>
                </div>

                {/* Annotation list — detailed */}
                {annotations.length > 0 && (
                  <div className="px-5 py-4 border-t border-gray-100">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                        {annotations.length} annotation{annotations.length !== 1 ? "s" : ""}
                      </p>
                      {selectedId && drawMode === "select" && (
                        <button
                          onClick={() => {
                            setAnnotations((prev) => prev.filter((a) => a.id !== selectedId));
                            setSelectedId(null);
                          }}
                          className="text-xs text-red-500 hover:text-red-600 transition-colors"
                        >
                          Delete selected
                        </button>
                      )}
                    </div>
                    <div className="space-y-2">
                      {annotations.map((ann) => (
                        <div
                          key={ann.id}
                          onClick={() => {
                            const idx = screenshotUrls.indexOf(ann.screenshotUrl);
                            if (idx !== -1) setActiveScreenIdx(idx);
                            setDrawMode("select");
                            setSelectedId(ann.id === selectedId ? null : ann.id);
                          }}
                          className={`flex items-start gap-3 px-4 py-3 rounded-xl border cursor-pointer transition-colors ${
                            ann.id === selectedId
                              ? "border-ink bg-gray-50"
                              : "border-gray-100 bg-gray-50 hover:border-gray-200"
                          }`}
                        >
                          <span
                            className="w-2.5 h-2.5 rounded-sm shrink-0 mt-1"
                            style={{ backgroundColor: TYPE_COLORS[ann.type] }}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 flex-wrap">
                              <span className="font-semibold text-sm text-gray-900">{ann.label}</span>
                              <span className="text-xs px-2 py-0.5 rounded-full bg-[#F4F5F6] text-ink font-medium shrink-0">
                                {ann.type}
                              </span>
                            </div>
                            {ann.existingCopy && (
                              <p className="text-xs text-gray-500 mb-0.5">
                                <span className="text-gray-400">Current: </span>
                                <span className="italic">&ldquo;{ann.existingCopy}&rdquo;</span>
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Below both columns — generation results (full width) ── */}
        {generated && annotations.length > 0 && (
          <div className="mt-6 space-y-4">
            {/* Select all row (Feature 4) */}
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-gray-700">Generated copy</p>
              <div className="flex items-center gap-3">
                {annotations.filter(a => results[a.id]?.status === "done").length > 0 && (
                  <button
                    onClick={() => {
                      const doneIds = annotations.filter(a => results[a.id]?.status === "done").map(a => a.id);
                      const allSelected = doneIds.every(id => selectedStrings.has(id));
                      if (allSelected) setSelectedStrings(new Set());
                      else setSelectedStrings(new Set(doneIds));
                    }}
                    className="text-xs text-gray-500 hover:text-ink transition-colors"
                  >
                    {annotations.filter(a => results[a.id]?.status === "done").every(a => selectedStrings.has(a.id))
                      ? "Deselect all"
                      : "Select all"}
                  </button>
                )}
              </div>
            </div>
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
                          {/* Checkbox (Feature 4) */}
                          <input
                            type="checkbox"
                            checked={selectedStrings.has(ann.id)}
                            onChange={() => toggleStringSelection(ann.id)}
                            onClick={(e) => e.stopPropagation()}
                            className="w-4 h-4 rounded border-gray-300 text-brand focus:ring-brand shrink-0"
                          />
                          <span
                            className="w-2.5 h-2.5 rounded-sm shrink-0"
                            style={{ backgroundColor: TYPE_COLORS[ann.type] }}
                          />
                          <span className="font-semibold text-sm text-gray-900 truncate">{ann.label}</span>
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium shrink-0 bg-[#F4F5F6] text-ink">
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

                      {/* Existing copy context */}
                      {ann.existingCopy && (
                        <div className="px-5 py-2.5 bg-gray-50 border-b border-gray-100">
                          <p className="text-xs text-gray-500">
                            <span className="font-medium text-gray-400">Current text: </span>
                            <span className="italic">&ldquo;{ann.existingCopy}&rdquo;</span>
                          </p>
                        </div>
                      )}

                      {/* Loading skeleton */}
                      {isLoading && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-gray-100">
                          {["English", "Arabic"].map((lang) => (
                            <div key={lang} className="px-5 py-5">
                              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">{lang}</p>
                              <div className="space-y-2.5 animate-pulse">
                                {[1, 2, 3].map((i) => (
                                  <div key={i} className="h-10 rounded-xl bg-gray-100" style={{ width: `${70 + i * 8}%` }} />
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
                        <>
                        <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-gray-100">
                          {/* English */}
                          <div className="px-5 py-5">
                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">English</p>
                            <div className="space-y-2">
                              {result.en.map((suggestion, i) => {
                                const isSelected = sel.enIdx === i;
                                return (
                                  <div key={i} className="relative group/item">
                                    <button
                                      onClick={() =>
                                        setSelections((prev) => ({
                                          ...prev,
                                          [ann.id]: { ...prev[ann.id], enIdx: i },
                                        }))
                                      }
                                      className={`w-full text-left px-4 py-3 rounded-xl border text-sm leading-relaxed transition-all pr-10 ${
                                        isSelected
                                          ? "border-ink bg-gray-50 text-ink font-medium"
                                          : "border-gray-100 text-gray-700 hover:border-gray-200 hover:bg-gray-50"
                                      }`}
                                    >
                                      <span className="text-[10px] font-semibold uppercase tracking-wide opacity-50 block mb-0.5">
                                        Option {i + 1}
                                      </span>
                                      {suggestion}
                                    </button>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); copyText(suggestion, `${ann.id}-en-${i}`); }}
                                      className="absolute top-2 right-2 p-1 rounded-md bg-white border border-gray-200 text-gray-400 hover:text-gray-700 hover:border-gray-300 opacity-0 group-hover/item:opacity-100 transition-opacity text-[10px] font-semibold"
                                      title="Copy"
                                    >
                                      {copiedKey === `${ann.id}-en-${i}` ? "✓" : (
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                                        </svg>
                                      )}
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          {/* Arabic */}
                          <div className="px-5 py-5">
                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Arabic</p>
                            <div className="space-y-2">
                              {result.ar.map((suggestion, i) => {
                                const isSelected = sel.arIdx === i;
                                return (
                                  <div key={i} className="relative group/item">
                                    <button
                                      dir="rtl"
                                      onClick={() =>
                                        setSelections((prev) => ({
                                          ...prev,
                                          [ann.id]: { ...prev[ann.id], arIdx: i },
                                        }))
                                      }
                                      className={`w-full text-right px-4 py-3 rounded-xl border text-sm leading-relaxed transition-all ${
                                        isSelected
                                          ? "border-ink bg-gray-50 text-ink font-medium"
                                          : "border-gray-100 text-gray-700 hover:border-gray-200 hover:bg-gray-50"
                                      }`}
                                    >
                                      <span
                                        className="text-[10px] font-semibold uppercase tracking-wide opacity-50 block mb-0.5"
                                        dir="ltr"
                                      >
                                        Option {i + 1}
                                      </span>
                                      {suggestion}
                                    </button>
                                    <button
                                      onClick={(e) => { e.stopPropagation(); copyText(suggestion, `${ann.id}-ar-${i}`); }}
                                      className="absolute top-2 right-2 p-1 rounded-md bg-white border border-gray-200 text-gray-400 hover:text-gray-700 hover:border-gray-300 opacity-0 group-hover/item:opacity-100 transition-opacity text-[10px] font-semibold"
                                      title="Copy"
                                    >
                                      {copiedKey === `${ann.id}-ar-${i}` ? "✓" : (
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                                        </svg>
                                      )}
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>

                        {/* Previous suggestion (Feature 3) */}
                        {previousResults[ann.id]?.status === "done" && (
                          <div className="px-5 pb-4 border-t border-gray-50">
                            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mt-3 mb-2">Previous suggestion</p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div className="px-4 py-3 rounded-xl border border-dashed border-gray-200 bg-gray-50/50 text-sm text-gray-500 leading-relaxed">
                                <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 block mb-0.5">English</span>
                                {previousResults[ann.id].en[selections[ann.id]?.enIdx ?? 0] ?? previousResults[ann.id].en[0]}
                              </div>
                              <div className="px-4 py-3 rounded-xl border border-dashed border-gray-200 bg-gray-50/50 text-sm text-gray-500 leading-relaxed text-right" dir="rtl">
                                <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 block mb-0.5" dir="ltr">Arabic</span>
                                {previousResults[ann.id].ar[selections[ann.id]?.arIdx ?? 0] ?? previousResults[ann.id].ar[0]}
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Write my own (Feature 3) */}
                        <div className="px-5 pb-4 border-t border-gray-50">
                          {!showCustom.has(ann.id) ? (
                            <button
                              onClick={() => setShowCustom((prev) => { const next = new Set(prev); next.add(ann.id); return next; })}
                              className="mt-3 text-xs text-gray-400 hover:text-ink transition-colors underline underline-offset-2"
                            >
                              + Write my own copy instead
                            </button>
                          ) : (
                            <div className="mt-3 space-y-2">
                              <p className="text-xs font-semibold text-gray-500">Write your own copy</p>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                  <label className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 block mb-1">English</label>
                                  <textarea
                                    rows={2}
                                    value={customCopy[ann.id]?.en ?? ""}
                                    onChange={(e) => setCustomCopy((prev) => ({ ...prev, [ann.id]: { ...prev[ann.id], en: e.target.value } }))}
                                    placeholder="Type your own English copy…"
                                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand transition resize-none"
                                  />
                                </div>
                                <div>
                                  <label className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 block mb-1">Arabic</label>
                                  <textarea
                                    rows={2}
                                    dir="rtl"
                                    value={customCopy[ann.id]?.ar ?? ""}
                                    onChange={(e) => setCustomCopy((prev) => ({ ...prev, [ann.id]: { ...prev[ann.id], ar: e.target.value } }))}
                                    placeholder="اكتب نصك العربي هنا…"
                                    className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand transition resize-none text-right"
                                  />
                                </div>
                              </div>
                              <button
                                onClick={() => {
                                  setShowCustom((prev) => { const next = new Set(prev); next.delete(ann.id); return next; });
                                  setCustomCopy((prev) => { const next = { ...prev }; delete next[ann.id]; return next; });
                                }}
                                className="text-xs text-gray-400 hover:text-red-500 transition-colors"
                              >
                                Cancel custom copy
                              </button>
                            </div>
                          )}
                        </div>
                        </>
                      )}
                    </div>
                  );
                })}
          </div>
        )}

      </main>

      {/* ── Bulk action bar (Feature 4) — floats above generate card ── */}
      {selectedStrings.size > 0 && (
        <div className="fixed bottom-[128px] inset-x-0 z-40 px-4 sm:px-6 lg:px-8">
          <div className="bg-ink text-white rounded-2xl shadow-lg px-5 py-3 flex items-center justify-between gap-4">
            <p className="text-sm font-medium">
              {selectedStrings.size} string{selectedStrings.size !== 1 ? "s" : ""} selected
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSelectedStrings(new Set())}
                className="text-xs text-white/60 hover:text-white transition-colors"
              >
                Clear
              </button>
              <button
                onClick={submitSelected}
                disabled={saving}
                className="px-4 py-2 rounded-xl bg-white text-ink text-xs font-semibold hover:bg-gray-100 transition-colors disabled:opacity-50"
              >
                {saving ? "Submitting…" : "Submit selected for review"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Generate copy floating card (above sticky bar) ── */}
      <div className="fixed bottom-[64px] inset-x-0 z-40 px-4 sm:px-6 lg:px-8">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-lg px-5 py-3.5 flex items-center gap-6">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-800 leading-tight">Generate copy</p>
            <p className="text-xs text-gray-400 mt-0.5">
              {annotations.length === 0
                ? "Add at least one annotation above to enable generation"
                : generating
                ? `Generating for ${loadingCount > 0 ? loadingCount : annotations.length} annotation${annotations.length !== 1 ? "s" : ""}…`
                : generated
                ? `${doneCount} of ${annotations.length} done · click to regenerate`
                : `${annotations.length} annotation${annotations.length !== 1 ? "s" : ""} ready`}
            </p>
          </div>
          <button
            onClick={handleGenerate}
            disabled={annotations.length === 0 || uploadsInProgress || generating}
            className="shrink-0 px-5 py-2 rounded-xl bg-ink text-white text-sm font-semibold hover:bg-ink/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {generating ? "Generating…" : generated ? "Regenerate all" : "Generate copy"}
          </button>
        </div>
      </div>

      {/* ── Sticky CTA bar ── */}
      <div className="fixed bottom-0 inset-x-0 z-40 bg-white border-t border-gray-200 shadow-[0_-2px_8px_rgba(0,0,0,0.06)]">
        <div className="px-4 sm:px-6 lg:px-8 py-3">
          {/* Error */}
          {error && (
            <p className="text-xs text-red-600 mb-2 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
              {error}
            </p>
          )}
          {/* Upload notice */}
          {uploadsInProgress && (
            <p className="text-xs text-gray-400 flex items-center gap-1.5 mb-2">
              <span className="w-3 h-3 border-2 border-brand border-t-transparent rounded-full animate-spin shrink-0" />
              Uploading images…
            </p>
          )}
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => save("draft")}
              disabled={saving || uploadsInProgress}
              className="px-6 py-2.5 rounded-xl bg-[#F4F5F6] text-ink font-semibold text-sm hover:bg-gray-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? "Saving…" : "Save as draft"}
            </button>
            <button
              type="button"
              onClick={() => save("submitted")}
              disabled={saving || uploadsInProgress || !allDone}
              title={!allDone ? "Generate and select copy for all annotations first" : undefined}
              className="px-6 py-2.5 rounded-xl bg-brand text-ink font-semibold text-sm hover:bg-brand-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
            >
              {saving ? "Saving…" : "Save & Submit for review"}
            </button>
          </div>
        </div>
      </div>

      {/* ── New annotation popup ── */}
      {pendingRect && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white border border-gray-200 rounded-2xl p-5 w-full max-w-sm shadow-2xl">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">New annotation</h3>

            <div className="mb-3">
              <label className="block text-xs text-gray-500 mb-1.5">
                Label <span className="text-red-400">*</span>
              </label>
              <input
                ref={labelInputRef}
                type="text"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && confirmAnnotation()}
                placeholder="e.g. Main CTA button"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand transition"
              />
            </div>

            <div className="mb-3">
              <label className="block text-xs text-gray-500 mb-1.5">Type</label>
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value as AnnotationType)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand transition"
              >
                {ANNOTATION_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            <div className="mb-3">
              <label className="block text-xs text-gray-500 mb-1.5">Existing copy</label>
              <div className="relative">
                <input
                  type="text"
                  value={newExistingCopy}
                  onChange={(e) => setNewExistingCopy(e.target.value)}
                  disabled={ocrLoading}
                  placeholder={ocrLoading ? "" : 'e.g. "Continue"'}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand transition disabled:opacity-60"
                />
                {ocrLoading && (
                  <div className="absolute inset-0 flex items-center gap-2 px-3 rounded-lg pointer-events-none">
                    <div className="w-3.5 h-3.5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin shrink-0" />
                    <span className="text-xs text-gray-400">Reading text…</span>
                  </div>
                )}
              </div>
              <p className="text-[11px] text-gray-400 mt-1">Auto-filled via OCR · edit if needed</p>
            </div>

            <div className="mb-3">
              <label className="block text-xs text-gray-500 mb-1.5">Character limit</label>
              <select
                value={newCharacterLimit}
                onChange={(e) => setNewCharacterLimit(e.target.value as CharacterLimit)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand transition"
              >
                <option value="no_limit">No character limit</option>
                <option value="approximately_same">Keep approximately the same (±10 characters)</option>
                <option value="exactly_same">Keep exactly the same as existing copy</option>
              </select>
            </div>

            <div className="mb-5">
              <label className="block text-xs text-gray-500 mb-1.5">Task</label>
              <select
                value={newTask}
                onChange={(e) => setNewTask(e.target.value as AnnotationTask)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand transition"
              >
                <option value="revise_and_translate">Revise English + provide Arabic translation</option>
                <option value="arabic_only">Arabic translation only</option>
                <option value="english_only">English revision only</option>
              </select>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setPendingRect(null)}
                className="flex-1 py-2 rounded-lg bg-[#F4F5F6] text-ink text-sm font-medium hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmAnnotation}
                disabled={!newLabel.trim()}
                className="flex-1 py-2 rounded-lg bg-brand text-ink text-sm font-semibold hover:bg-brand-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
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
