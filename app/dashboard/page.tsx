"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  collection,
  query,
  where,
  onSnapshot,
  Timestamp,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import DashboardNav from "@/components/DashboardNav";

interface CopyRequest {
  id: string;
  title: string;
  status: "draft" | "submitted" | "approved" | "rejected";
  createdAt: Timestamp;
  tone?: string;
  screenshotURLs?: string[];
}

const STATUS_CONFIG: Record<
  CopyRequest["status"],
  { label: string; classes: string }
> = {
  draft: { label: "Draft", classes: "bg-[#F4F5F6] text-ink" },
  submitted: { label: "Submitted", classes: "bg-[#F4F5F6] text-ink" },
  approved: { label: "Approved", classes: "bg-[#F4F5F6] text-ink" },
  rejected: { label: "Changes requested", classes: "bg-[#F4F5F6] text-ink" },
};

export default function DashboardPage() {
  const [requests, setRequests] = useState<CopyRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [uid, setUid] = useState<string | null>(null);

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

  const drafts = requests.filter((r) => r.status === "draft").length;
  const submitted = requests.filter((r) => r.status === "submitted").length;

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
                {requests.length} total · {submitted} submitted · {drafts} draft
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
              return (
                <Link
                  key={req.id}
                  href={`/dashboard/${req.id}`}
                  className="bg-white rounded-xl border border-gray-100 px-5 py-4 flex items-center justify-between hover:shadow-sm transition-shadow cursor-pointer group"
                >
                  {/* Left */}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-gray-900 truncate group-hover:text-ink transition-colors">
                      {req.title}
                    </h3>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-xs text-gray-400">
                        {req.createdAt?.toDate().toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </span>
                      {req.tone && (
                        <span className="text-xs text-gray-300">·</span>
                      )}
                      {req.tone && (
                        <span className="text-xs text-gray-400 capitalize">
                          {req.tone}
                        </span>
                      )}
                      {req.screenshotURLs && req.screenshotURLs.length > 0 && (
                        <>
                          <span className="text-xs text-gray-300">·</span>
                          <span className="text-xs text-gray-400">
                            {req.screenshotURLs.length} screenshot
                            {req.screenshotURLs.length !== 1 ? "s" : ""}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Right */}
                  <span
                    className={`ml-4 px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap ${cfg.classes}`}
                  >
                    {cfg.label}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
