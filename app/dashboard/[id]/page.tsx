"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  doc,
  getDoc,
  updateDoc,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import DashboardNav from "@/components/DashboardNav";
import { STATUS_CONFIG, type RequestStatus } from "@/lib/status";
import { createNotification } from "@/lib/notifications";

interface Annotation {
  id: string;
  label: string;
  type: string;
  screenshotUrl: string;
}

interface CopyRequest {
  id: string;
  title: string;
  status: RequestStatus;
  tone?: string;
  context?: string;
  createdAt: Timestamp;
  createdBy: string;
  revisionNotes?: string;
  annotations?: Annotation[];
  copySelections?: Record<string, { en: string; ar: string }>;
}

const TYPE_COLORS: Record<string, string> = {
  CTA: "#1B4FD8",
  Heading: "#7C3AED",
  "Error Message": "#DC2626",
  Tooltip: "#EAB308",
  "Body Copy": "#059669",
};

export default function RequestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [request, setRequest] = useState<CopyRequest | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revisionNotes, setRevisionNotes] = useState("");
  const [acting, setActing] = useState(false);

  useEffect(() => {
    async function load() {
      const user = auth.currentUser;
      if (!user) { router.replace("/login"); return; }

      // Check admin role
      const adminsSnap = await getDoc(doc(db, "settings", "admins"));
      const adminUids = adminsSnap.exists()
        ? (adminsSnap.data()?.uids as string[]) ?? []
        : null;
      const admin = adminUids === null || adminUids.includes(user.uid);
      setIsAdmin(admin);

      // Load request
      try {
        const snap = await getDoc(doc(db, "copyRequests", id));
        if (!snap.exists()) { setError("Request not found."); setLoading(false); return; }

        const data = snap.data() as Omit<CopyRequest, "id">;
        setRequest({ id: snap.id, ...data });

        // Auto-advance to in_review when Copy Team opens a submitted request
        if (admin && data.status === "submitted") {
          await updateDoc(doc(db, "copyRequests", id), { status: "in_review" });
          setRequest((prev) => prev ? { ...prev, status: "in_review" } : prev);
        }
      } catch {
        setError("Failed to load request.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id, router]);

  async function handleApprove() {
    if (!request) return;
    setActing(true);
    try {
      await updateDoc(doc(db, "copyRequests", id), {
        status: "approved",
        reviewedBy: auth.currentUser?.uid,
        reviewedAt: serverTimestamp(),
        revisionNotes: null,
      });
      await createNotification(
        request.createdBy, id, request.title,
        `Your request "${request.title}" has been approved`
      );
      router.push("/dashboard/review");
    } catch {
      setError("Action failed. Please try again.");
      setActing(false);
    }
  }

  async function handleRequestChanges() {
    if (!request) return;
    if (!revisionNotes.trim()) {
      setError("Please add revision notes before requesting changes.");
      return;
    }
    setActing(true);
    try {
      await updateDoc(doc(db, "copyRequests", id), {
        status: "changes_requested",
        revisionNotes: revisionNotes.trim(),
        reviewedBy: auth.currentUser?.uid,
        reviewedAt: serverTimestamp(),
      });
      await createNotification(
        request.createdBy, id, request.title,
        `Your request "${request.title}" needs changes: ${revisionNotes.trim()}`
      );
      router.push("/dashboard/review");
    } catch {
      setError("Action failed. Please try again.");
      setActing(false);
    }
  }

  // ── Loading ──────────────────────────────────────────────────────────
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

  if (error && !request) {
    return (
      <div className="min-h-screen bg-gray-50">
        <DashboardNav />
        <div className="max-w-2xl mx-auto px-6 py-16 text-center">
          <p className="text-sm text-red-500">{error}</p>
          <button onClick={() => router.push("/dashboard")} className="mt-4 text-sm text-gray-400 hover:text-gray-600 underline">
            Back to dashboard
          </button>
        </div>
      </div>
    );
  }

  if (!request) return null;

  const cfg = STATUS_CONFIG[request.status] ?? STATUS_CONFIG.draft;
  const annotations = request.annotations ?? [];
  const copySelections = request.copySelections ?? {};
  const hasSelections = annotations.some((a) => copySelections[a.id]);
  const isResolved = request.status === "approved" || request.status === "changes_requested";

  // Shared header
  const Header = () => (
    <div>
      <button
        onClick={() => router.push(isAdmin ? "/dashboard/review" : "/dashboard")}
        className="text-xs text-gray-400 hover:text-gray-600 transition-colors mb-3 flex items-center gap-1"
      >
        ← {isAdmin ? "Review queue" : "All requests"}
      </button>
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-xl font-bold text-gray-900">{request.title}</h1>
        <span className={`px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap ${cfg.classes}`}>
          {cfg.label}
        </span>
      </div>
      <p className="text-xs text-gray-400 mt-1">
        {request.createdAt?.toDate().toLocaleDateString("en-US", {
          month: "long", day: "numeric", year: "numeric",
        })}
        {request.tone && ` · ${request.tone}`}
      </p>
    </div>
  );

  // Shared copy display
  const CopyDisplay = () =>
    hasSelections ? (
      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-4">
          Generated copy
        </p>
        <div className="space-y-4">
          {annotations.map((ann) => {
            const sel = copySelections[ann.id];
            return (
              <div key={ann.id} className="border border-gray-100 rounded-xl overflow-hidden">
                <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
                  <span
                    className="w-2 h-2 rounded-sm shrink-0"
                    style={{ backgroundColor: TYPE_COLORS[ann.type] ?? "#888" }}
                  />
                  <span className="text-xs font-semibold text-gray-700">{ann.label}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-[#F4F5F6] text-ink font-medium">
                    {ann.type}
                  </span>
                </div>
                {sel ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-gray-100">
                    <div className="px-4 py-3">
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">English</p>
                      <p className="text-sm text-gray-800">{sel.en}</p>
                    </div>
                    <div className="px-4 py-3" dir="rtl">
                      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1" dir="ltr">Arabic</p>
                      <p className="text-sm text-gray-800">{sel.ar}</p>
                    </div>
                  </div>
                ) : (
                  <div className="px-4 py-3">
                    <p className="text-xs text-gray-400 italic">No copy selected for this annotation.</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    ) : null;

  // Context block
  const ContextBlock = () =>
    request.context ? (
      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Feature context</p>
        <p className="text-sm text-gray-700 leading-relaxed">{request.context}</p>
      </div>
    ) : null;

  // ── DESIGNER VIEW ────────────────────────────────────────────────────
  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-gray-50">
        <DashboardNav />
        <main className="max-w-3xl mx-auto px-6 py-8 space-y-5">
          <Header />

          {/* Revision notes — yellow box (changes_requested only) */}
          {request.status === "changes_requested" && request.revisionNotes && (
            <div className="bg-brand/30 border border-brand rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2 h-2 rounded-full bg-ink shrink-0" />
                <p className="text-sm font-semibold text-ink">Changes requested</p>
              </div>
              <p className="text-sm text-ink leading-relaxed">{request.revisionNotes}</p>
            </div>
          )}

          {/* Status notices */}
          {(request.status === "submitted" || request.status === "in_review") && (
            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5">
              <p className="text-sm font-medium text-blue-800">
                {request.status === "in_review"
                  ? "The Copy Team is currently reviewing this request."
                  : "This request has been submitted and is awaiting review."}
              </p>
            </div>
          )}

          {request.status === "approved" && (
            <div className="bg-green-50 border border-green-200 rounded-2xl p-5">
              <p className="text-sm font-semibold text-green-700">
                This request has been approved by the Copy Team.
              </p>
            </div>
          )}

          <ContextBlock />
          <CopyDisplay />

          {/* Revise copy action (changes_requested only) */}
          {request.status === "changes_requested" && (
            <div className="pb-8">
              <Link
                href={`/dashboard/${id}/generate`}
                className="w-full flex items-center justify-center py-3 rounded-xl bg-brand text-ink font-semibold text-sm hover:bg-brand-dark transition-colors shadow-sm"
              >
                Revise copy &amp; resubmit
              </Link>
            </div>
          )}
        </main>
      </div>
    );
  }

  // ── COPY TEAM VIEW ───────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">
      <DashboardNav />
      <main className="max-w-3xl mx-auto px-6 py-8 space-y-5">
        <Header />
        <ContextBlock />

        {/* Previous revision notes (if any) */}
        {request.revisionNotes && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-5">
            <p className="text-xs font-medium text-red-600 uppercase tracking-wide mb-2">
              Previous revision notes
            </p>
            <p className="text-sm text-red-700 leading-relaxed">{request.revisionNotes}</p>
          </div>
        )}

        <CopyDisplay />

        {/* Error */}
        {error && (
          <p className="text-sm text-red-600 bg-red-50 px-4 py-3 rounded-xl border border-red-100">
            {error}
          </p>
        )}

        {/* Review actions */}
        {!isResolved ? (
          <div className="bg-white rounded-2xl border border-gray-100 p-5 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Revision notes
              </label>
              <p className="text-xs text-gray-400 mb-2">
                Required if requesting changes. Explain what needs to be revised.
              </p>
              <textarea
                value={revisionNotes}
                onChange={(e) => setRevisionNotes(e.target.value)}
                rows={4}
                placeholder="e.g. The Arabic CTA sounds too formal. Please try a warmer, more conversational tone."
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand transition resize-none"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleRequestChanges}
                disabled={acting}
                className="flex-1 py-3 rounded-xl bg-red-500 text-white font-semibold text-sm hover:bg-red-600 transition-colors disabled:opacity-50"
              >
                {acting ? "Sending…" : "Request changes"}
              </button>
              <button
                onClick={handleApprove}
                disabled={acting}
                className="flex-1 py-3 rounded-xl bg-green-500 text-white font-semibold text-sm hover:bg-green-600 transition-colors shadow-sm disabled:opacity-50"
              >
                {acting ? "Approving…" : "Approve"}
              </button>
            </div>
          </div>
        ) : (
          <div className={`rounded-2xl p-5 border ${
            request.status === "approved"
              ? "bg-green-50 border-green-200"
              : "bg-[#F4F5F6] border-gray-200"
          }`}>
            <p className={`text-sm font-semibold ${
              request.status === "approved" ? "text-green-700" : "text-ink"
            }`}>
              {request.status === "approved"
                ? "This request has been approved."
                : "Changes have been requested."}
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
