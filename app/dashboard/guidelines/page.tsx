"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";
import {
  ref,
  uploadBytesResumable,
  getDownloadURL,
} from "firebase/storage";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db, storage } from "@/lib/firebase";
import DashboardNav from "@/components/DashboardNav";

interface Guidelines {
  content: string;
  fileName: string;
  uploadedAt: { toDate(): Date } | null;
  uploadedBy: string;
}

type PageState = "loading" | "access-denied" | "ready";

export default function GuidelinesPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [pageState, setPageState] = useState<PageState>("loading");
  const [current, setCurrent] = useState<Guidelines | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [confirmFile, setConfirmFile] = useState<File | null>(null);

  // ── Auth + admin check ──────────────────────────────────────────
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.replace("/login");
        return;
      }

      // Check admin status: settings/admins.uids[]
      // If the document doesn't exist yet, treat current user as admin (bootstrap)
      const adminsSnap = await getDoc(doc(db, "settings", "admins"));
      const isAdmin =
        !adminsSnap.exists() ||
        (adminsSnap.data()?.uids as string[])?.includes(user.uid);

      if (!isAdmin) {
        setPageState("access-denied");
        return;
      }

      // Load current guidelines
      const guidelinesSnap = await getDoc(doc(db, "settings", "guidelines"));
      if (guidelinesSnap.exists()) {
        setCurrent(guidelinesSnap.data() as Guidelines);
      }
      setPageState("ready");
    });
    return unsub;
  }, [router]);

  // ── File selection ──────────────────────────────────────────────
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    const valid = file.type === "application/pdf" ||
      file.type === "text/plain" ||
      file.name.endsWith(".pdf") ||
      file.name.endsWith(".txt");

    if (!valid) {
      setError("Only PDF and .txt files are supported.");
      return;
    }

    setError("");

    // If guidelines already exist, ask for confirmation first
    if (current) {
      setConfirmFile(file);
    } else {
      void processUpload(file);
    }
  }

  // ── Extract + upload + save ─────────────────────────────────────
  async function processUpload(file: File) {
    setUploading(true);
    setUploadProgress(0);
    setError("");
    setSuccessMsg("");
    setConfirmFile(null);

    try {
      // Step 1: Extract text
      const formData = new FormData();
      formData.append("file", file);
      const extractRes = await fetch("/api/extract-guidelines", {
        method: "POST",
        body: formData,
      });
      if (!extractRes.ok) {
        const body = await extractRes.json() as { error?: string };
        throw new Error(body.error ?? "Extraction failed.");
      }
      const { text } = await extractRes.json() as { text: string };

      // Step 2: Upload file to Firebase Storage
      const uid = auth.currentUser?.uid;
      if (!uid) throw new Error("Not authenticated.");

      const path = `guidelines/${Date.now()}_${file.name}`;
      const storageRef = ref(storage, path);
      const task = uploadBytesResumable(storageRef, file);

      await new Promise<void>((resolve, reject) => {
        task.on(
          "state_changed",
          (snap) => {
            setUploadProgress(
              Math.round((snap.bytesTransferred / snap.totalBytes) * 100)
            );
          },
          reject,
          resolve
        );
      });

      const downloadUrl = await getDownloadURL(task.snapshot.ref);
      void downloadUrl; // stored in Storage; text is what we use in prompts

      // Step 3: Save to Firestore
      const guidelinesData = {
        content: text,
        fileName: file.name,
        uploadedAt: serverTimestamp(),
        uploadedBy: uid,
      };
      await setDoc(doc(db, "settings", "guidelines"), guidelinesData);

      setCurrent({
        ...guidelinesData,
        uploadedAt: { toDate: () => new Date() },
      });
      setSuccessMsg("Brand guidelines updated successfully.");
      setTimeout(() => setSuccessMsg(""), 3000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Upload failed.";
      setError(msg);
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  }

  // ── Render states ───────────────────────────────────────────────
  if (pageState === "loading") {
    return (
      <div className="min-h-screen bg-gray-50">
        <DashboardNav />
        <div className="flex items-center justify-center py-32">
          <div className="w-7 h-7 border-[3px] border-brand border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (pageState === "access-denied") {
    return (
      <div className="min-h-screen bg-gray-50">
        <DashboardNav />
        <div className="max-w-2xl mx-auto px-6 py-16 text-center">
          <p className="text-2xl mb-3">🔒</p>
          <h1 className="text-lg font-semibold text-gray-900 mb-2">
            Access restricted
          </h1>
          <p className="text-sm text-gray-500 mb-6">
            Only admins can manage brand guidelines.
          </p>
          <button
            onClick={() => router.push("/dashboard")}
            className="text-sm text-gray-400 hover:text-gray-600 underline"
          >
            Back to dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <DashboardNav />

      <main className="max-w-2xl mx-auto px-6 py-8 space-y-5">
        {/* Header */}
        <div>
          <h1 className="text-xl font-bold text-gray-900">Brand Guidelines</h1>
          <p className="text-sm text-gray-400 mt-1">
            The uploaded document is fed as context into every copy generation request.
          </p>
        </div>

        {/* Current guidelines */}
        {current && (
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">
              Active guidelines
            </p>
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-[#F4F5F6] flex items-center justify-center text-sm shrink-0">
                  {current.fileName.endsWith(".pdf") ? "📄" : "📝"}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {current.fileName}
                  </p>
                  {current.uploadedAt && (
                    <p className="text-xs text-gray-400 mt-0.5">
                      Uploaded{" "}
                      {current.uploadedAt.toDate().toLocaleDateString("en-US", {
                        month: "long",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </p>
                  )}
                </div>
              </div>
              <span className="px-2.5 py-1 rounded-full bg-[#F4F5F6] text-ink text-xs font-medium shrink-0">
                Active
              </span>
            </div>

            {/* Content preview */}
            <div className="mt-4 p-3 rounded-xl bg-gray-50 border border-gray-100 max-h-36 overflow-y-auto">
              <p className="text-xs text-gray-500 leading-relaxed whitespace-pre-wrap">
                {current.content.slice(0, 600)}
                {current.content.length > 600 && (
                  <span className="text-gray-300">
                    {" "}…{" "}
                    <span className="not-italic">
                      ({current.content.length - 600} more characters)
                    </span>
                  </span>
                )}
              </p>
            </div>
          </div>
        )}

        {/* Upload zone */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <p className="text-sm font-medium text-gray-700 mb-1">
            {current ? "Replace guidelines" : "Upload guidelines"}
          </p>
          <p className="text-xs text-gray-400 mb-4">
            Supported formats: PDF, TXT. The document text will be extracted and
            injected into every generation prompt.
          </p>

          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.txt,application/pdf,text/plain"
            className="hidden"
            onChange={handleFileChange}
            disabled={uploading}
          />

          {uploading ? (
            <div className="border-2 border-dashed border-gray-200 rounded-xl py-10 flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-[3px] border-brand border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-gray-500">
                {uploadProgress < 50
                  ? "Extracting text…"
                  : `Uploading… ${uploadProgress}%`}
              </p>
              <div className="w-40 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-brand rounded-full transition-all"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full border-2 border-dashed border-gray-200 rounded-xl py-10 flex flex-col items-center gap-2 hover:border-ink/20 hover:bg-brand/10 transition-all group"
            >
              <span className="text-3xl text-gray-300 group-hover:text-ink/40 transition-colors">
                ⬆
              </span>
              <span className="text-sm text-gray-500 font-medium">
                {current ? "Upload new document to replace" : "Upload PDF or TXT"}
              </span>
              <span className="text-xs text-gray-300">
                Click to browse files
              </span>
            </button>
          )}
        </div>

        {/* Error */}
        {error && (
          <p className="text-sm text-red-600 bg-red-50 px-4 py-3 rounded-xl border border-red-100">
            {error}
          </p>
        )}

        {/* Success */}
        {successMsg && (
          <p className="text-sm text-green-700 bg-green-50 px-4 py-3 rounded-xl border border-green-100">
            {successMsg}
          </p>
        )}
      </main>

      {/* Confirmation dialog */}
      {confirmFile && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 max-w-sm w-full">
            <h2 className="text-base font-semibold text-gray-900 mb-2">
              Replace existing guidelines?
            </h2>
            <p className="text-sm text-gray-500 mb-1">
              This will replace{" "}
              <span className="font-medium text-gray-700">{current?.fileName}</span>{" "}
              with{" "}
              <span className="font-medium text-gray-700">{confirmFile.name}</span>.
            </p>
            <p className="text-sm text-gray-400 mb-6">
              All future copy generation requests will use the new document.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmFile(null)}
                className="flex-1 py-2.5 rounded-xl bg-[#F4F5F6] text-ink text-sm font-medium hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => void processUpload(confirmFile)}
                className="flex-1 py-2.5 rounded-xl bg-brand text-ink text-sm font-semibold hover:bg-brand-dark transition-colors shadow-sm"
              >
                Replace
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
