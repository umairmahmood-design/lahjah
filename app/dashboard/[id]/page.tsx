"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
  doc,
  getDoc,
  updateDoc,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { isCopyTeamUser, getUserDisplayName } from "@/lib/roles";
import DashboardNav from "@/components/DashboardNav";
import { STATUS_CONFIG, type RequestStatus } from "@/lib/status";
import { createNotification } from "@/lib/notifications";

interface Annotation {
  id: string;
  label: string;
  type: string;
  screenshotUrl: string;
}

interface StringReview {
  annotationId: string;
  approved: boolean;
  comment: string;
  designerReply?: string;
  copyTeamReply?: string;
}

interface CopyRequest {
  id: string;
  title: string;
  status: RequestStatus;
  tone?: string;
  context?: string;
  domain?: string;
  targetAudience?: string;
  publishingDeadline?: string;
  problemStatement?: string;
  competitorResearch?: string;
  competitorScreenshotURLs?: string[];
  createdAt: Timestamp;
  createdBy: string;
  annotations?: Annotation[];
  screenshotURLs?: string[];
  copySelections?: Record<string, { en: string; ar: string }>;
  stringReviews?: StringReview[];
  // legacy field — kept for display of old requests
  revisionNotes?: string;
  reviewedBy?: string;
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
  const [isCopyTeam, setIsCopyTeam] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [acting, setActing] = useState(false);
  const [closingRequest, setClosingRequest] = useState(false);

  // Per-string review state (Copy Team only)
  const [stringReviews, setStringReviews] = useState<Record<string, { approved: boolean; comment: string }>>({});

  // Per-string designer reply state
  const [designerReplies, setDesignerReplies] = useState<Record<string, string>>({});
  const [savingReply, setSavingReply] = useState<string | null>(null);

  // Per-string Copy Team reply state
  const [copyTeamReplies, setCopyTeamReplies] = useState<Record<string, string>>({});
  const [savingCopyTeamReply, setSavingCopyTeamReply] = useState<string | null>(null);

  // Display names for raised-by / reviewed-by
  const [createdByName, setCreatedByName] = useState<string | null>(null);
  const [reviewedByName, setReviewedByName] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const user = auth.currentUser;
      if (!user) { router.replace("/login"); return; }

      const copyTeam = await isCopyTeamUser(user.uid);
      setIsCopyTeam(copyTeam);

      try {
        const snap = await getDoc(doc(db, "copyRequests", id));
        if (!snap.exists()) { setError("Request not found."); setLoading(false); return; }

        const data = snap.data() as Omit<CopyRequest, "id">;
        setRequest({ id: snap.id, ...data });

        // Auto-advance to in_review when Copy Team opens a submitted request
        if (copyTeam && data.status === "submitted") {
          await updateDoc(doc(db, "copyRequests", id), { status: "in_review" });
          setRequest((prev) => prev ? { ...prev, status: "in_review" } : prev);
        }

        // Seed per-string review state from existing stringReviews (if any)
        const annotations = (data.annotations ?? []) as Annotation[];
        const existing = (data.stringReviews ?? []) as StringReview[];
        const initial: Record<string, { approved: boolean; comment: string }> = {};
        const initialReplies: Record<string, string> = {};
        const initialCopyTeamReplies: Record<string, string> = {};
        for (const ann of annotations) {
          const prev = existing.find((r) => r.annotationId === ann.id);
          // Start fresh for each review round — previous round comment is shown as read-only context
          initial[ann.id] = { approved: false, comment: "" };
          initialReplies[ann.id] = prev?.designerReply ?? "";
          initialCopyTeamReplies[ann.id] = prev?.copyTeamReply ?? "";
        }
        setStringReviews(initial);
        setDesignerReplies(initialReplies);
        setCopyTeamReplies(initialCopyTeamReplies);

        // Fetch display names
        if (data.createdBy) {
          getUserDisplayName(data.createdBy).then(setCreatedByName);
        }
        if (data.reviewedBy) {
          getUserDisplayName(data.reviewedBy).then(setReviewedByName);
        }
      } catch {
        setError("Failed to load request.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id, router]);

  async function handleSubmitReview() {
    if (!request) return;
    setActing(true);
    setError("");
    try {
      const reviews: StringReview[] = Object.entries(stringReviews).map(([annotationId, v]) => {
        const prev = existingStringReviews.find((r) => r.annotationId === annotationId);
        return {
          annotationId,
          approved: v.approved,
          comment: v.comment.trim(),
          // Preserve replies from the previous round so they aren't lost on submit
          ...(prev?.designerReply ? { designerReply: prev.designerReply } : {}),
          ...(copyTeamReplies[annotationId]?.trim() ? { copyTeamReply: copyTeamReplies[annotationId].trim() } : {}),
        };
      });

      const allApproved = reviews.every((r) => r.approved);
      const newStatus: RequestStatus = allApproved ? "approved" : "changes_requested";

      await updateDoc(doc(db, "copyRequests", id), {
        status: newStatus,
        stringReviews: reviews,
        reviewedBy: auth.currentUser?.uid,
        reviewedAt: serverTimestamp(),
      });

      const message = allApproved
        ? `Your request "${request.title}" has been approved`
        : `Your request "${request.title}" needs changes`;

      await createNotification(request.createdBy, id, request.title, message);
      router.push("/dashboard/review");
    } catch {
      setError("Failed to submit review. Please try again.");
      setActing(false);
    }
  }

  async function handleCloseRequest() {
    if (!request) return;
    setActing(true);
    try {
      await updateDoc(doc(db, "copyRequests", id), { status: "closed" });
      setRequest((prev) => prev ? { ...prev, status: "closed" } : prev);
      setClosingRequest(false);
    } catch {
      setError("Failed to close request. Please try again.");
    } finally {
      setActing(false);
    }
  }

  async function handleSaveReply(annotationId: string) {
    if (!request) return;
    setSavingReply(annotationId);
    try {
      const updated = (request.stringReviews ?? []).map((r) =>
        r.annotationId === annotationId
          ? { ...r, designerReply: designerReplies[annotationId]?.trim() ?? "" }
          : r
      );
      await updateDoc(doc(db, "copyRequests", id), { stringReviews: updated });
      setRequest((prev) => prev ? { ...prev, stringReviews: updated } : prev);
    } catch {
      setError("Failed to save reply. Please try again.");
    } finally {
      setSavingReply(null);
    }
  }

  async function handleSaveCopyTeamReply(annotationId: string) {
    if (!request) return;
    setSavingCopyTeamReply(annotationId);
    try {
      const updated = (request.stringReviews ?? []).map((r) =>
        r.annotationId === annotationId
          ? { ...r, copyTeamReply: copyTeamReplies[annotationId]?.trim() ?? "" }
          : r
      );
      await updateDoc(doc(db, "copyRequests", id), { stringReviews: updated });
      setRequest((prev) => prev ? { ...prev, stringReviews: updated } : prev);
    } catch {
      setError("Failed to save reply. Please try again.");
    } finally {
      setSavingCopyTeamReply(null);
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
  const screenshotURLs = request.screenshotURLs ?? [];
  const existingStringReviews = request.stringReviews ?? [];
  const isResolved = request.status === "approved" || request.status === "changes_requested" || request.status === "closed";

  const Header = () => (
    <div>
      <button
        onClick={() => router.push(isCopyTeam ? "/dashboard/review" : "/dashboard")}
        className="text-xs text-gray-400 hover:text-gray-600 transition-colors mb-3 flex items-center gap-1"
      >
        ← {isCopyTeam ? "Review queue" : "All requests"}
      </button>
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-xl font-bold text-gray-900">{request.title}</h1>
        <div className="flex items-center gap-2 shrink-0">
          {!isCopyTeam && request.status === "changes_requested" && (
            <button
              onClick={() => setClosingRequest(true)}
              className="px-3 py-1 rounded-full text-xs font-medium bg-[#F4F5F6] text-ink hover:bg-gray-200 transition-colors"
            >
              Close request
            </button>
          )}
          <span className={`px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap ${cfg.classes}`}>
            {cfg.label}
          </span>
        </div>
      </div>
      <p className="text-xs text-gray-400 mt-1">
        {request.createdAt?.toDate().toLocaleDateString("en-US", {
          month: "long", day: "numeric", year: "numeric",
        })}
        {request.tone && ` · ${request.tone}`}
        {request.domain && ` · ${request.domain}`}
        {request.targetAudience && ` · ${request.targetAudience}`}
      </p>
      <div className="flex items-center gap-3 mt-1 flex-wrap">
        {createdByName && (
          <span className="text-xs text-gray-400">Raised by: <span className="text-gray-600">{createdByName}</span></span>
        )}
        {reviewedByName && (
          <>
            {createdByName && <span className="text-xs text-gray-300">·</span>}
            <span className="text-xs text-gray-400">Reviewed by: <span className="text-gray-600">{reviewedByName}</span></span>
          </>
        )}
      </div>
    </div>
  );

  const ContextBlock = () => {
    const hasMeta = request.domain || request.targetAudience || request.publishingDeadline;
    const hasContext = request.context || request.problemStatement || request.competitorResearch;
    if (!hasMeta && !hasContext) return null;
    return (
      <div className="space-y-3">
        {/* Meta row */}
        {hasMeta && (
          <div className="bg-white rounded-2xl border border-gray-100 p-5 flex flex-wrap gap-5">
            {request.domain && (
              <div>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Domain</p>
                <p className="text-sm text-gray-800 font-medium">{request.domain}</p>
              </div>
            )}
            {request.targetAudience && (
              <div>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Target audience</p>
                <p className="text-sm text-gray-800 font-medium">{request.targetAudience}</p>
              </div>
            )}
            {request.publishingDeadline && (
              <div>
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Publishing deadline</p>
                <p className="text-sm text-gray-800 font-medium">
                  {new Date(request.publishingDeadline).toLocaleDateString("en-US", {
                    month: "long", day: "numeric", year: "numeric",
                  })}
                </p>
              </div>
            )}
          </div>
        )}
        {/* Context */}
        {request.context && (
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Feature context</p>
            <p className="text-sm text-gray-700 leading-relaxed">{request.context}</p>
          </div>
        )}
        {/* Problem statement */}
        {request.problemStatement && (
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">What problem does it solve?</p>
            <p className="text-sm text-gray-700 leading-relaxed">{request.problemStatement}</p>
          </div>
        )}
        {/* Competitor research */}
        {(request.competitorResearch || (request.competitorScreenshotURLs ?? []).length > 0) && (
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">Competitor research</p>
            {request.competitorResearch && (
              <p className="text-sm text-gray-700 leading-relaxed mb-3">{request.competitorResearch}</p>
            )}
            {(request.competitorScreenshotURLs ?? []).length > 0 && (
              <div className="flex gap-3 overflow-x-auto pb-1">
                {(request.competitorScreenshotURLs ?? []).map((url, i) => (
                  <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="shrink-0">
                    <div className="relative w-36 h-24 rounded-lg overflow-hidden border border-gray-100 hover:border-gray-300 transition-colors">
                      <Image src={url} alt={`Competitor ref ${i + 1}`} fill className="object-cover" />
                    </div>
                  </a>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const ScreenshotsBlock = () =>
    screenshotURLs.length > 0 ? (
      <div className="bg-white rounded-2xl border border-gray-100 p-5">
        <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">Screenshots</p>
        <div className="flex gap-3 overflow-x-auto pb-1">
          {screenshotURLs.map((url, i) => (
            <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="shrink-0">
              <div className="relative w-48 h-32 rounded-lg overflow-hidden border border-gray-100 hover:border-gray-300 transition-colors">
                <Image src={url} alt={`Screenshot ${i + 1}`} fill className="object-cover" />
              </div>
            </a>
          ))}
        </div>
      </div>
    ) : null;

  // ── DESIGNER VIEW ────────────────────────────────────────────────────
  if (!isCopyTeam) {
    return (
      <div className="min-h-screen bg-gray-50">
        <DashboardNav />
        <main className="max-w-3xl mx-auto px-6 py-8 space-y-5">
          <Header />

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

          {request.status === "changes_requested" && (
            <div className="bg-[#FFEA00]/20 border border-[#FFEA00] rounded-2xl p-4">
              <p className="text-sm font-semibold text-ink">Changes requested. See comments below each string.</p>
            </div>
          )}

          {request.status === "closed" && (
            <div className="bg-[#F4F5F6] border border-gray-200 rounded-2xl p-4">
              <p className="text-sm font-semibold text-ink">This request has been closed and archived.</p>
            </div>
          )}

          <ContextBlock />
          <ScreenshotsBlock />

          {/* Per-string copy cards */}
          {annotations.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Generated copy</p>
              {annotations.map((ann) => {
                const sel = copySelections[ann.id];
                const review = existingStringReviews.find((r) => r.annotationId === ann.id);
                const hasComment = request.status === "changes_requested" && review?.comment;

                return (
                  <div key={ann.id} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                    {/* Card header */}
                    <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
                      <span
                        className="w-2 h-2 rounded-sm shrink-0"
                        style={{ backgroundColor: TYPE_COLORS[ann.type] ?? "#888" }}
                      />
                      <span className="text-xs font-semibold text-gray-700">{ann.label}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-[#F4F5F6] text-ink font-medium">
                        {ann.type}
                      </span>
                    </div>

                    {/* Copy content */}
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

                    {/* Per-string reviewer comment + designer reply */}
                    {hasComment && (
                      <div className="mx-4 mb-4 mt-1 space-y-2">
                        <div className="bg-[#FFEA00]/30 border border-[#FFEA00] rounded-xl px-4 py-3">
                          <p className="text-[10px] font-semibold text-ink uppercase tracking-wide mb-1">Reviewer comment</p>
                          <p className="text-sm text-ink leading-relaxed">{review!.comment}</p>
                        </div>
                        {/* Designer reply */}
                        <div className="flex gap-2">
                          <textarea
                            value={designerReplies[ann.id] ?? ""}
                            onChange={(e) =>
                              setDesignerReplies((prev) => ({ ...prev, [ann.id]: e.target.value }))
                            }
                            rows={2}
                            placeholder="Add a comment or note for the reviewer…"
                            className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand transition resize-none text-gray-700 placeholder-gray-300"
                          />
                          <button
                            onClick={() => handleSaveReply(ann.id)}
                            disabled={savingReply === ann.id}
                            className="self-end px-3 py-2 rounded-lg bg-brand text-ink text-xs font-semibold hover:bg-brand-dark transition-colors disabled:opacity-50 shrink-0"
                          >
                            {savingReply === ann.id ? "Saving…" : "Send"}
                          </button>
                        </div>
                        {/* Copy Team's response to designer reply (read-only) */}
                        {review!.copyTeamReply && (
                          <div className="bg-[#F4F5F6] border border-gray-200 rounded-xl px-4 py-3">
                            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Copy Team response</p>
                            <p className="text-sm text-gray-700">{review!.copyTeamReply}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Legacy revisionNotes fallback (old requests without stringReviews) */}
          {request.status === "changes_requested" && request.revisionNotes && existingStringReviews.length === 0 && (
            <div className="bg-[#FFEA00]/30 border border-[#FFEA00] rounded-2xl p-5">
              <p className="text-xs font-semibold text-ink uppercase tracking-wide mb-2">Revision notes</p>
              <p className="text-sm text-ink leading-relaxed">{request.revisionNotes}</p>
            </div>
          )}

          {/* Resubmit action */}
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

        {/* Close request confirmation modal */}
        {closingRequest && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl border border-gray-100">
              <h2 className="text-base font-semibold text-gray-900 mb-2">Close this request?</h2>
              <p className="text-sm text-gray-500">
                Are you sure you want to close this request? It will be archived and no longer visible in your active requests.
              </p>
              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setClosingRequest(false)}
                  disabled={acting}
                  className="flex-1 py-2.5 rounded-xl bg-[#F4F5F6] text-ink text-sm font-semibold hover:bg-gray-200 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCloseRequest}
                  disabled={acting}
                  className="flex-1 py-2.5 rounded-xl bg-[#F4F5F6] text-ink text-sm font-semibold hover:bg-gray-200 transition-colors disabled:opacity-50"
                >
                  {acting ? "Closing…" : "Close request"}
                </button>
              </div>
            </div>
          </div>
        )}
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
        <ScreenshotsBlock />

        {/* Per-string review cards */}
        {annotations.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide">Review each string</p>
            {annotations.map((ann) => {
              const sel = copySelections[ann.id];
              const rev = stringReviews[ann.id] ?? { approved: false, comment: "" };

              return (
                <div
                  key={ann.id}
                  className={`bg-white rounded-2xl border overflow-hidden transition-colors ${
                    rev.approved ? "border-green-300" : "border-gray-100"
                  }`}
                >
                  {/* Card header with approve toggle */}
                  <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
                    <span
                      className="w-2 h-2 rounded-sm shrink-0"
                      style={{ backgroundColor: TYPE_COLORS[ann.type] ?? "#888" }}
                    />
                    <span className="text-xs font-semibold text-gray-700 flex-1">{ann.label}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-[#F4F5F6] text-ink font-medium">
                      {ann.type}
                    </span>
                    {/* Approve toggle */}
                    {!isResolved && (
                      <button
                        onClick={() =>
                          setStringReviews((prev) => ({
                            ...prev,
                            [ann.id]: { ...prev[ann.id], approved: !prev[ann.id]?.approved },
                          }))
                        }
                        className={`ml-2 flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                          rev.approved
                            ? "bg-green-500 text-white border-green-500"
                            : "bg-white text-gray-500 border-gray-200 hover:border-green-400"
                        }`}
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                        {rev.approved ? "Approved" : "Approve"}
                      </button>
                    )}
                    {isResolved && (
                      <span className={`ml-2 px-2 py-0.5 rounded-full text-xs font-semibold ${
                        existingStringReviews.find((r) => r.annotationId === ann.id)?.approved
                          ? "bg-green-100 text-green-700"
                          : "bg-red-100 text-red-600"
                      }`}>
                        {existingStringReviews.find((r) => r.annotationId === ann.id)?.approved ? "Approved" : "Changes requested"}
                      </span>
                    )}
                  </div>

                  {/* Copy content */}
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

                  {/* Per-string comment field + designer reply (active review) */}
                  {!isResolved && (
                    <div className="px-4 pb-4 pt-2 space-y-2">
                      {/* Previous round context: reviewer comment + designer reply */}
                      {(() => {
                        const prevReview = existingStringReviews.find((r) => r.annotationId === ann.id);
                        if (!prevReview?.comment && !prevReview?.designerReply) return null;
                        return (
                          <>
                            {prevReview.comment && (
                              <div className="bg-[#FFEA00]/20 border border-[#FFEA00] rounded-xl px-4 py-3">
                                <p className="text-[10px] font-semibold text-ink uppercase tracking-wide mb-1">Previous comment</p>
                                <p className="text-sm text-ink">{prevReview.comment}</p>
                              </div>
                            )}
                            {prevReview.designerReply && (
                              <>
                                <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
                                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Designer reply</p>
                                  <p className="text-sm text-gray-700">{prevReview.designerReply}</p>
                                </div>
                                <div className="flex gap-2">
                                  <textarea
                                    value={copyTeamReplies[ann.id] ?? ""}
                                    onChange={(e) =>
                                      setCopyTeamReplies((prev) => ({ ...prev, [ann.id]: e.target.value }))
                                    }
                                    rows={2}
                                    placeholder="Respond to designer..."
                                    className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand transition resize-none text-gray-700 placeholder-gray-300"
                                  />
                                  <button
                                    onClick={() => handleSaveCopyTeamReply(ann.id)}
                                    disabled={savingCopyTeamReply === ann.id}
                                    className="self-end px-3 py-2 rounded-lg bg-brand text-ink text-xs font-semibold hover:bg-brand-dark transition-colors disabled:opacity-50 shrink-0"
                                  >
                                    {savingCopyTeamReply === ann.id ? "Saving…" : "Send"}
                                  </button>
                                </div>
                              </>
                            )}
                          </>
                        );
                      })()}
                      <textarea
                        value={rev.comment}
                        onChange={(e) =>
                          setStringReviews((prev) => ({
                            ...prev,
                            [ann.id]: { ...prev[ann.id], comment: e.target.value },
                          }))
                        }
                        rows={2}
                        placeholder="Leave a comment for this string (optional)..."
                        className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand transition resize-none text-gray-700 placeholder-gray-300"
                      />
                    </div>
                  )}

                  {/* Show saved comment + designer reply if resolved */}
                  {isResolved && (() => {
                    const savedReview = existingStringReviews.find((r) => r.annotationId === ann.id);
                    return (
                      <>
                        {savedReview?.comment && (
                          <div className={`mx-4 mt-1 bg-[#FFEA00]/20 border border-[#FFEA00] rounded-xl px-4 py-3 ${savedReview.designerReply ? "mb-2" : "mb-4"}`}>
                            <p className="text-[10px] font-semibold text-ink uppercase tracking-wide mb-1">Your comment</p>
                            <p className="text-sm text-ink">{savedReview.comment}</p>
                          </div>
                        )}
                        {savedReview?.designerReply && (
                          <>
                            <div className={`mx-4 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 ${savedReview.copyTeamReply ? "mb-2" : "mb-2"}`}>
                              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Designer reply</p>
                              <p className="text-sm text-gray-700">{savedReview.designerReply}</p>
                            </div>
                            <div className="mx-4 mb-4 flex gap-2">
                              <textarea
                                value={copyTeamReplies[ann.id] ?? ""}
                                onChange={(e) =>
                                  setCopyTeamReplies((prev) => ({ ...prev, [ann.id]: e.target.value }))
                                }
                                rows={2}
                                placeholder="Respond to designer..."
                                className="flex-1 px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand transition resize-none text-gray-700 placeholder-gray-300"
                              />
                              <button
                                onClick={() => handleSaveCopyTeamReply(ann.id)}
                                disabled={savingCopyTeamReply === ann.id}
                                className="self-end px-3 py-2 rounded-lg bg-brand text-ink text-xs font-semibold hover:bg-brand-dark transition-colors disabled:opacity-50 shrink-0"
                              >
                                {savingCopyTeamReply === ann.id ? "Saving…" : "Send"}
                              </button>
                            </div>
                          </>
                        )}
                      </>
                    );
                  })()}
                </div>
              );
            })}
          </div>
        )}

        {/* Error */}
        {error && (
          <p className="text-sm text-red-600 bg-red-50 px-4 py-3 rounded-xl border border-red-100">
            {error}
          </p>
        )}

        {/* Submit review button */}
        {!isResolved ? (
          <div className="pb-8">
            <button
              onClick={handleSubmitReview}
              disabled={acting}
              className="w-full py-3 rounded-xl bg-brand text-ink font-semibold text-sm hover:bg-brand-dark transition-colors shadow-sm disabled:opacity-50"
            >
              {acting ? "Submitting…" : "Submit review"}
            </button>
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
                : request.status === "changes_requested"
                ? "Review submitted. Waiting for the designer to revise and resubmit."
                : "This request has been closed."}
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
