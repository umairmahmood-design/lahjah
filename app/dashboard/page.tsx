"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  collection,
  query,
  where,
  onSnapshot,
  deleteDoc,
  doc,
  getDoc,
  Timestamp,
} from "firebase/firestore";
import { ref, deleteObject } from "firebase/storage";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db, storage } from "@/lib/firebase";
import DashboardNav from "@/components/DashboardNav";
import { STATUS_CONFIG, type RequestStatus } from "@/lib/status";

interface CopyRequest {
  id: string;
  title: string;
  status: RequestStatus;
  createdAt: Timestamp;
  tone?: string;
  screenshotURLs?: string[];
}

export default function DashboardPage() {
  const [requests, setRequests] = useState<CopyRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [uid, setUid] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setUid(user?.uid ?? null);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!uid) return;

    // No orderBy here — avoids needing a composite Firestore index.
    // We sort client-side after fetching instead.
    const q = query(
      collection(db, "copyRequests"),
      where("createdBy", "==", uid)
    );

    const unsub = onSnapshot(
      q,
      (snap) => {
        const docs = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<CopyRequest, "id">) }))
          // Sort newest-first client-side
          .sort((a, b) => {
            const aMs = a.createdAt?.toMillis() ?? 0;
            const bMs = b.createdAt?.toMillis() ?? 0;
            return bMs - aMs;
          });
        setRequests(docs);
        setLoading(false);
      },
      (err) => {
        console.error("[dashboard] Firestore error:", err);
        setLoadError("Could not load requests. Please refresh the page.");
        setLoading(false);
      }
    );

    return unsub;
  }, [uid]);

  async function handleDelete(id: string) {
    setDeleteLoading(true);
    try {
      // Fetch screenshotURLs to delete from Storage
      const snap = await getDoc(doc(db, "copyRequests", id));
      if (snap.exists()) {
        const urls: string[] = snap.data().screenshotURLs ?? [];
        await Promise.allSettled(
          urls.map((url) => {
            try {
              const path = decodeURIComponent(url.split("/o/")[1].split("?")[0]);
              return deleteObject(ref(storage, path));
            } catch {
              return Promise.resolve();
            }
          })
        );
      }
      await deleteDoc(doc(db, "copyRequests", id));
      setDeletingId(null);
    } catch {
      // fail silently — the list will not update if delete failed
    } finally {
      setDeleteLoading(false);
    }
  }

  const drafts = requests.filter((r) => r.status === "draft").length;
  const pending = requests.filter(
    (r) => r.status === "submitted" || r.status === "in_review"
  ).length;

  return (
    <div className="min-h-screen bg-gray-50">
      <DashboardNav />

      <main className="max-w-5xl mx-auto px-6 sm:px-8 py-10">
        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Copy Requests</h1>
            {!loading && requests.length > 0 && (
              <p className="text-sm text-gray-400 mt-1">
                {requests.length} total · {pending} in review · {drafts} draft
                {drafts !== 1 ? "s" : ""}
              </p>
            )}
          </div>
          <Link
            href="/dashboard/new"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand text-ink font-semibold text-sm hover:bg-brand-dark transition-colors shadow-sm"
          >
            <span className="text-base leading-none">+</span>
            New request
          </Link>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="w-7 h-7 border-[3px] border-brand border-t-transparent rounded-full animate-spin" />
          </div>
        ) : loadError ? (
          <div className="text-center py-20 bg-white rounded-2xl border border-red-100">
            <p className="text-sm text-red-500 font-medium">{loadError}</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-4 text-xs text-gray-400 hover:text-gray-600 underline"
            >
              Refresh
            </button>
          </div>
        ) : requests.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-gray-200">
            <div className="w-12 h-12 rounded-2xl bg-brand/20 flex items-center justify-center text-ink text-xl mx-auto mb-4">
              ✦
            </div>
            <h3 className="font-semibold text-gray-900 mb-1">No requests yet</h3>
            <p className="text-sm text-gray-400 mb-6 max-w-xs mx-auto">
              Create your first copy request and let Lahjah do the writing.
            </p>
            <Link
              href="/dashboard/new"
              className="inline-flex items-center px-4 py-2 rounded-lg bg-brand text-ink text-sm font-medium hover:bg-brand-dark transition-colors"
            >
              + New request
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {requests.map((req) => {
              const cfg = STATUS_CONFIG[req.status] ?? STATUS_CONFIG.draft;
              const canDelete = req.status === "draft" || req.status === "changes_requested";
              return (
                <div key={req.id} className="flex items-stretch gap-2">
                  <Link
                    href={`/dashboard/${req.id}`}
                    className="flex-1 min-w-0 bg-white rounded-xl border border-gray-100 px-4 py-3 flex items-center gap-4 hover:shadow-sm transition-shadow cursor-pointer group"
                  >
                    {/* Thumbnail */}
                    <div className="relative shrink-0 w-[60px] h-[60px] rounded-lg overflow-hidden bg-gray-100 border border-gray-100">
                      {req.screenshotURLs && req.screenshotURLs.length > 0 ? (
                        <>
                          <Image
                            src={req.screenshotURLs[0]}
                            alt=""
                            fill
                            className="object-cover"
                            sizes="60px"
                          />
                          {req.screenshotURLs.length > 1 && (
                            <span className="absolute bottom-0 right-0 bg-black/60 text-white text-[9px] font-semibold px-1 py-0.5 leading-tight rounded-tl">
                              +{req.screenshotURLs.length - 1}
                            </span>
                          )}
                        </>
                      ) : (
                        <div className="w-full h-full bg-gray-100 flex items-center justify-center">
                          <svg className="w-5 h-5 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 18h16.5M3.75 6.75h16.5A2.25 2.25 0 0122.5 9v9a2.25 2.25 0 01-2.25 2.25H3.75A2.25 2.25 0 011.5 18V9a2.25 2.25 0 012.25-2.25z" />
                          </svg>
                        </div>
                      )}
                    </div>

                    {/* Title + meta */}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-gray-900 truncate group-hover:text-ink transition-colors">
                        {req.title}
                      </h3>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="text-xs text-gray-400">
                          {req.createdAt?.toDate().toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </span>
                        {req.tone && (
                          <>
                            <span className="text-xs text-gray-300">·</span>
                            <span className="text-xs text-gray-400 capitalize">{req.tone}</span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Status badge */}
                    <span className={`ml-2 shrink-0 px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap ${cfg.classes}`}>
                      {cfg.label}
                    </span>
                  </Link>

                  {/* Delete button — only for draft / changes_requested */}
                  {canDelete ? (
                    <button
                      onClick={() => setDeletingId(req.id)}
                      className="w-10 flex items-center justify-center rounded-xl border border-gray-100 bg-white text-gray-300 hover:text-red-500 hover:border-red-200 hover:bg-red-50 transition-colors shrink-0"
                      aria-label="Delete request"
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                        <path d="M10 11v6M14 11v6" />
                        <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                      </svg>
                    </button>
                  ) : (
                    <div className="w-10 shrink-0" />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
      {/* Delete confirmation modal */}
      {deletingId && (() => {
        const req = requests.find((r) => r.id === deletingId);
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl border border-gray-100">
              <h2 className="text-base font-semibold text-gray-900 mb-1">Delete request?</h2>
              {req && (
                <p className="text-sm text-gray-500 mb-1 truncate">
                  &ldquo;{req.title}&rdquo;
                </p>
              )}
              <p className="text-sm text-gray-400">
                This will permanently delete the request and all uploaded screenshots. This cannot be undone.
              </p>
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setDeletingId(null)}
                  disabled={deleteLoading}
                  className="flex-1 py-2.5 rounded-xl bg-[#F4F5F6] text-ink text-sm font-semibold hover:bg-gray-200 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDelete(deletingId)}
                  disabled={deleteLoading}
                  className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-sm font-semibold hover:bg-red-600 transition-colors disabled:opacity-50 shadow-sm"
                >
                  {deleteLoading ? "Deleting…" : "Delete"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
