"use client";

import { useState, useRef, ChangeEvent, KeyboardEvent } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import {
  ref,
  uploadBytesResumable,
  getDownloadURL,
} from "firebase/storage";
import { auth, db, storage } from "@/lib/firebase";

type Tone = "Friendly" | "Professional" | "Playful" | "Urgent" | "Formal";

const TONE_DESCRIPTIONS: Record<Tone, string> = {
  Friendly: "Warm, approachable, conversational",
  Professional: "Polished, clear, business-appropriate",
  Playful: "Fun, energetic, light-hearted",
  Urgent: "Action-oriented, time-sensitive",
  Formal: "Authoritative, precise, respectful",
};

interface UploadedFile {
  file: File;
  previewUrl: string;
  progress: number; // 0–100
  downloadUrl: string | null;
  error: string | null;
}

const TONES: Tone[] = ["Friendly", "Professional", "Playful", "Urgent", "Formal"];

export default function NewRequestPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState("");
  const [context, setContext] = useState("");
  const [tone, setTone] = useState<Tone>("Professional");
  const [lockedTerms, setLockedTerms] = useState<string[]>([]);
  const [termInput, setTermInput] = useState("");
  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // ── File selection ──────────────────────────────────────────────
  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? []);
    if (!selected.length) return;

    const newFiles: UploadedFile[] = selected.map((file) => ({
      file,
      previewUrl: URL.createObjectURL(file),
      progress: 0,
      downloadUrl: null,
      error: null,
    }));

    setFiles((prev) => [...prev, ...newFiles]);

    // Reset input so the same file can be re-selected if needed
    if (fileInputRef.current) fileInputRef.current.value = "";

    // Start uploading each new file immediately
    newFiles.forEach((f, i) => {
      const globalIndex = files.length + i;
      uploadFile(f.file, globalIndex);
    });
  }

  function removeFile(index: number) {
    setFiles((prev) => {
      const updated = [...prev];
      URL.revokeObjectURL(updated[index].previewUrl);
      updated.splice(index, 1);
      return updated;
    });
  }

  // ── Upload a single file to Firebase Storage ───────────────────
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
          if (updated[index])
            updated[index] = { ...updated[index], error: err.message };
          return updated;
        });
      },
      async () => {
        const url = await getDownloadURL(task.snapshot.ref);
        setFiles((prev) => {
          const updated = [...prev];
          if (updated[index])
            updated[index] = { ...updated[index], downloadUrl: url, progress: 100 };
          return updated;
        });
      }
    );
  }

  // ── Locked terms ────────────────────────────────────────────────
  function commitTerm() {
    const val = termInput.trim();
    if (val && !lockedTerms.includes(val)) {
      setLockedTerms((prev) => [...prev, val]);
    }
    setTermInput("");
  }

  function handleTermKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      commitTerm();
    } else if (e.key === "Backspace" && termInput === "" && lockedTerms.length > 0) {
      setLockedTerms((prev) => prev.slice(0, -1));
    }
  }

  function removeTerm(term: string) {
    setLockedTerms((prev) => prev.filter((t) => t !== term));
  }

  // ── Save helpers ────────────────────────────────────────────────
  const uploadsInProgress = files.some(
    (f) => f.downloadUrl === null && f.error === null
  );

  async function save(status: "draft" | "submitted") {
    setError("");

    if (!title.trim()) {
      setError("Request title is required.");
      return;
    }
    if (status === "submitted" && !context.trim()) {
      setError("Feature context is required before submitting.");
      return;
    }
    if (uploadsInProgress) {
      setError("Please wait for all uploads to finish.");
      return;
    }

    const uid = auth.currentUser?.uid;
    if (!uid) {
      setError("You must be signed in.");
      return;
    }

    setSaving(true);
    try {
      const screenshotURLs = files
        .filter((f) => f.downloadUrl)
        .map((f) => f.downloadUrl as string);

      // Commit any partially typed term before saving
      const finalTerms =
        termInput.trim() && !lockedTerms.includes(termInput.trim())
          ? [...lockedTerms, termInput.trim()]
          : lockedTerms;

      await addDoc(collection(db, "copyRequests"), {
        title: title.trim(),
        context: context.trim(),
        tone,
        lockedTerms: finalTerms,
        screenshotURLs,
        status,
        createdBy: uid,
        createdAt: serverTimestamp(),
      });

      router.push("/dashboard");
    } catch {
      setError("Failed to save. Please try again.");
      setSaving(false);
    }
  }

  // ── Render ──────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-6 py-4 flex items-center gap-4">
        <button
          onClick={() => router.back()}
          className="text-gray-400 hover:text-gray-600 transition-colors"
          aria-label="Go back"
        >
          ←
        </button>
        <div>
          <h1 className="text-lg font-semibold text-gray-900">New Copy Request</h1>
          <p className="text-xs text-gray-400">Fill in the details below</p>
        </div>
      </div>

      <main className="max-w-2xl mx-auto px-6 py-8 space-y-5">

        {/* Title */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Request title <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Checkout screen — CTA and error states"
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand transition"
          />
        </div>

        {/* Screenshots */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
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
              className="w-full border-2 border-dashed border-gray-200 rounded-xl py-10 flex flex-col items-center gap-2 hover:border-ink/20 hover:bg-brand/10 transition-all group"
            >
              <span className="text-3xl text-gray-300 group-hover:text-ink/40 transition-colors">
                ⬆
              </span>
              <span className="text-sm text-gray-400">
                Click to upload images
              </span>
              <span className="text-xs text-gray-300">PNG, JPG, WebP</span>
            </button>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
              {files.map((f, i) => (
                <div key={i} className="relative group aspect-square">
                  <Image
                    src={f.previewUrl}
                    alt={f.file.name}
                    fill
                    className="object-cover rounded-xl border border-gray-100"
                    sizes="120px"
                  />

                  {/* Progress overlay */}
                  {f.progress < 100 && !f.error && (
                    <div className="absolute inset-0 bg-black/40 rounded-xl flex flex-col items-center justify-center gap-1">
                      <div className="w-10 h-1 bg-white/30 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-white rounded-full transition-all"
                          style={{ width: `${f.progress}%` }}
                        />
                      </div>
                      <span className="text-white text-xs font-medium">
                        {f.progress}%
                      </span>
                    </div>
                  )}

                  {/* Error overlay */}
                  {f.error && (
                    <div className="absolute inset-0 bg-red-500/60 rounded-xl flex items-center justify-center">
                      <span className="text-white text-xs font-medium px-1 text-center">
                        Failed
                      </span>
                    </div>
                  )}

                  {/* Done check */}
                  {f.downloadUrl && (
                    <div className="absolute top-1.5 right-1.5 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center">
                      <span className="text-white text-xs">✓</span>
                    </div>
                  )}

                  {/* Remove button */}
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

              {/* Add more tile */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="aspect-square rounded-xl border-2 border-dashed border-gray-200 flex items-center justify-center text-gray-300 hover:border-ink/20 hover:text-ink/40 hover:bg-brand/10 transition-all text-2xl"
              >
                +
              </button>
            </div>
          )}
        </div>

        {/* Feature context */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Feature context{" "}
            <span className="text-red-400">*</span>
          </label>
          <p className="text-xs text-gray-400 mb-2">
            Describe what this feature does and what the user is trying to accomplish.
          </p>
          <textarea
            value={context}
            onChange={(e) => setContext(e.target.value)}
            rows={4}
            placeholder="e.g. This is the checkout screen for a food delivery app. The user has reviewed their cart and is ready to place the order. We need copy for the main CTA button, the order summary heading, and the error state when payment fails."
            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand transition resize-none"
          />
        </div>

        {/* Tone */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <label className="block text-sm font-medium text-gray-700 mb-3">
            Tone
          </label>
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
          {tone && (
            <p className="text-xs text-gray-400 mt-2.5">
              {TONE_DESCRIPTIONS[tone]}
            </p>
          )}
        </div>

        {/* Locked terms */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Locked terms
          </label>
          <p className="text-xs text-gray-400 mb-3">
            Brand names, product terms, or phrases the AI must never alter or translate. Press Enter or comma to add each term.
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
                  onClick={() => removeTerm(term)}
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
          {lockedTerms.length > 0 && (
            <p className="text-xs text-gray-400 mt-2">
              {lockedTerms.length} locked term{lockedTerms.length !== 1 ? "s" : ""} — the AI will preserve these exactly as written.
            </p>
          )}
        </div>

        {/* Error */}
        {error && (
          <p className="text-sm text-red-600 bg-red-50 px-4 py-3 rounded-xl border border-red-100">
            {error}
          </p>
        )}

        {/* Upload in-progress notice */}
        {uploadsInProgress && (
          <p className="text-xs text-gray-400 flex items-center gap-2">
            <span className="w-3 h-3 border-2 border-brand border-t-transparent rounded-full animate-spin inline-block" />
            Uploading images…
          </p>
        )}

        {/* Actions */}
        <div className="flex gap-3 pb-8">
          <button
            type="button"
            onClick={() => save("draft")}
            disabled={saving || uploadsInProgress}
            className="flex-1 py-3 rounded-xl bg-ink text-white font-semibold text-sm hover:bg-ink/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {saving ? "Saving…" : "Save as draft"}
          </button>
          <button
            type="button"
            onClick={() => save("submitted")}
            disabled={saving || uploadsInProgress}
            className="flex-1 py-3 rounded-xl bg-brand text-ink font-semibold text-sm hover:bg-brand-dark transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
          >
            {saving ? "Saving…" : "Submit request"}
          </button>
        </div>
      </main>
    </div>
  );
}
