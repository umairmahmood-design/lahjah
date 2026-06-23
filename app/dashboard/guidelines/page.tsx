"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL } from "firebase/storage";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db, storage } from "@/lib/firebase";
import { isCopyTeamUser } from "@/lib/roles";
import DashboardNav from "@/components/DashboardNav";

interface Guidelines {
  content: string;
  fileUrl?: string;
  fileName?: string;
  updatedBy: string;
  updatedByName: string;
  updatedAt: { toDate(): Date } | null;
}

export default function GuidelinesPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(true);
  const [isCopyTeam, setIsCopyTeam] = useState(false);
  const [current, setCurrent] = useState<Guidelines | null>(null);
  const [mode, setMode] = useState<"view" | "edit">("view");

  // Edit state
  const [editText, setEditText] = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.replace("/login");
        return;
      }
      const [isAdmin, snap] = await Promise.all([
        isCopyTeamUser(user.uid),
        getDoc(doc(db, "settings", "brandGuidelines")),
      ]);
      setIsCopyTeam(isAdmin);
      if (snap.exists()) setCurrent(snap.data() as Guidelines);
      setLoading(false);
    });
    return unsub;
  }, [router]);

  function startEdit() {
    setEditText(current?.content ?? "");
    setPendingFile(null);
    setError("");
    setMode("edit");
  }

  function cancelEdit() {
    setMode("view");
    setError("");
    setPendingFile(null);
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    const isPdf = file.type === "application/pdf" || file.name.endsWith(".pdf");
    const isDocx =
      file.type ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      file.name.endsWith(".docx");
    const isTxt = file.type === "text/plain" || file.name.endsWith(".txt");

    if (!isPdf && !isDocx && !isTxt) {
      setError("Only PDF, DOCX, and TXT files are supported.");
      return;
    }

    setError("");
    setExtracting(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/extract-guidelines", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error ?? "Extraction failed.");
      }
      const { text } = (await res.json()) as { text: string };
      setEditText(text);
      setPendingFile(file);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to extract text.");
    } finally {
      setExtracting(false);
    }
  }

  async function handleSave() {
    if (!editText.trim()) {
      setError("Guidelines content cannot be empty.");
      return;
    }

    const user = auth.currentUser;
    if (!user) {
      setError("Not authenticated.");
      return;
    }

    setSaving(true);
    setError("");

    try {
      let fileUrl: string | undefined;
      let fileName: string | undefined;

      if (pendingFile) {
        const path = `guidelines/${Date.now()}_${pendingFile.name}`;
        const storageRef = ref(storage, path);
        const task = uploadBytesResumable(storageRef, pendingFile);
        await new Promise<void>((resolve, reject) => {
          task.on("state_changed", null, reject, resolve);
        });
        fileUrl = await getDownloadURL(task.snapshot.ref);
        fileName = pendingFile.name;
      } else if (current?.fileUrl) {
        // Preserve existing file reference when saving text edits
        fileUrl = current.fileUrl;
        fileName = current.fileName;
      }

      const updatedByName = user.displayName ?? user.email ?? user.uid;
      const data: Record<string, unknown> = {
        content: editText.trim(),
        updatedBy: user.uid,
        updatedByName,
        updatedAt: serverTimestamp(),
      };
      if (fileUrl) {
        data.fileUrl = fileUrl;
        data.fileName = fileName;
      }

      await setDoc(doc(db, "settings", "brandGuidelines"), data);

      setCurrent({
        content: editText.trim(),
        ...(fileUrl ? { fileUrl, fileName } : {}),
        updatedBy: user.uid,
        updatedByName,
        updatedAt: { toDate: () => new Date() },
      });
      setMode("view");
      setSuccessMsg("Brand guidelines saved successfully.");
      setTimeout(() => setSuccessMsg(""), 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save guidelines.");
    } finally {
      setSaving(false);
    }
  }

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

  return (
    <div className="min-h-screen bg-gray-50">
      <DashboardNav />

      <main className="max-w-3xl mx-auto px-6 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Brand Tone Guidelines</h1>
            <p className="text-sm text-gray-400 mt-1">
              These guidelines are used as context for all copy generated in Lahjah.
            </p>
          </div>
          {isCopyTeam && mode === "view" && (
            <button
              onClick={startEdit}
              className="shrink-0 px-4 py-2 rounded-lg bg-white border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              {current ? "Edit guidelines" : "Add guidelines"}
            </button>
          )}
        </div>

        {successMsg && (
          <p className="text-sm text-green-700 bg-green-50 px-4 py-3 rounded-xl border border-green-100">
            {successMsg}
          </p>
        )}

        {/* ── VIEW MODE ─────────────────────────────────────────── */}
        {mode === "view" && (
          <>
            {current ? (
              <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4">
                {/* Meta */}
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                      Active guidelines
                    </p>
                    {current.updatedAt && (
                      <p className="text-xs text-gray-400 mt-1">
                        Last updated by{" "}
                        <span className="font-medium text-gray-600">
                          {current.updatedByName}
                        </span>{" "}
                        on{" "}
                        {current.updatedAt.toDate().toLocaleDateString("en-US", {
                          month: "long",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </p>
                    )}
                    {current.fileName && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        Source file:{" "}
                        <span className="font-medium text-gray-600">
                          {current.fileName}
                        </span>
                      </p>
                    )}
                  </div>
                  <span className="px-2.5 py-1 rounded-full bg-green-50 text-green-700 text-xs font-medium shrink-0 border border-green-100">
                    Active
                  </span>
                </div>

                {/* Content */}
                <div className="rounded-xl bg-gray-50 border border-gray-100 p-4 max-h-96 overflow-y-auto">
                  <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                    {current.content}
                  </p>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
                <p className="text-3xl mb-3">📋</p>
                <p className="text-sm font-medium text-gray-500">
                  No brand guidelines uploaded yet.
                </p>
                {isCopyTeam && (
                  <p className="text-xs text-gray-400 mt-1">
                    Click "Add guidelines" to get started.
                  </p>
                )}
              </div>
            )}
          </>
        )}

        {/* ── EDIT MODE ─────────────────────────────────────────── */}
        {mode === "edit" && (
          <div className="space-y-4">
            {/* Textarea */}
            <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-gray-700">
                  Guidelines content
                </p>
                <span className="text-xs text-gray-400">
                  {editText.length > 0
                    ? `${editText.length.toLocaleString()} characters`
                    : "Paste or write your brand guidelines below"}
                </span>
              </div>
              <textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                placeholder={`Paste your brand tone and voice guidelines here…\n\nFor example:\n- Tone: Friendly, clear, and conversational\n- Do: Use active voice\n- Don't: Use jargon or overly formal language\n- Terminology: Always write "HungerStation" not "HS"`}
                className="w-full h-80 px-4 py-3 rounded-xl border border-gray-200 text-sm text-gray-800 placeholder-gray-300 resize-none focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand/50 leading-relaxed"
                disabled={extracting}
              />
            </div>

            {/* File upload (optional) */}
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
              <p className="text-sm font-medium text-gray-700 mb-1">
                Import from document{" "}
                <span className="font-normal text-gray-400">(optional)</span>
              </p>
              <p className="text-xs text-gray-400 mb-4">
                Upload a PDF, DOCX, or TXT file. The extracted text will
                populate the field above so you can review and edit before saving.
              </p>

              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
                className="hidden"
                onChange={handleFileChange}
                disabled={extracting || saving}
              />

              {extracting ? (
                <div className="flex items-center gap-3 py-3">
                  <div className="w-4 h-4 border-2 border-brand border-t-transparent rounded-full animate-spin shrink-0" />
                  <p className="text-sm text-gray-500">Extracting text from document…</p>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={saving}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  <span>⬆</span>
                  {pendingFile ? `${pendingFile.name} — upload another` : "Upload PDF, DOCX, or TXT"}
                </button>
              )}

              {pendingFile && !extracting && (
                <p className="text-xs text-green-700 mt-2">
                  ✓ Text extracted from <span className="font-medium">{pendingFile.name}</span> — review above before saving.
                </p>
              )}
            </div>

            {/* Error */}
            {error && (
              <p className="text-sm text-red-600 bg-red-50 px-4 py-3 rounded-xl border border-red-100">
                {error}
              </p>
            )}

            {/* Actions */}
            <div className="flex items-center gap-3">
              <button
                onClick={handleSave}
                disabled={saving || extracting}
                className="px-6 py-2.5 rounded-lg bg-[#FFEA00] text-gray-900 text-sm font-semibold hover:bg-yellow-300 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {saving && (
                  <span className="w-3.5 h-3.5 border-2 border-gray-700 border-t-transparent rounded-full animate-spin" />
                )}
                {saving ? "Saving…" : "Save guidelines"}
              </button>
              <button
                onClick={cancelEdit}
                disabled={saving}
                className="px-4 py-2.5 rounded-lg text-sm text-gray-500 hover:text-gray-700 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
