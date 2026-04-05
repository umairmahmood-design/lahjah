"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  doc,
  getDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import DashboardNav from "@/components/DashboardNav";
import { STATUS_CONFIG, type RequestStatus } from "@/lib/status";
import { createNotification } from "@/lib/notifications";

type AnnotationType = "CTA" | "Heading" | "Error Message" | "Tooltip" | "Body";

interface Annotation {
  id: string;
  screenshotUrl: string;
  x: number;
  y: number;
  width: number;
  height: number;
  type: AnnotationType;
}

interface CopyRequest {
  id: string;
  title: string;
  status: RequestStatus;
  tone: string;
  context: string;
  screenshotURLs: string[];
  annotations?: Annotation[];
  revisionNotes?: string;
  createdAt: Timestamp;
  createdBy: string;
}

export default function RequestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [request, setRequest] = useState<CopyRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const snap = await getDoc(doc(db, "copyRequests", id));
        if (!snap.exists()) {
          setError("Request not found.");
        } else {
          setRequest({ id: snap.id, ...(snap.data() as Omit<CopyRequest, "id">) });
        }
      } catch {
        setError("Failed to load request.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  async function handleSubmit() {
    if (!request) return;
    setSubmitting(true);
    try {
      await updateDoc(doc(db, "copyRequests", id), {
        status: "submitted",
        submittedAt: serverTimestamp(),
      });

      // Notify all admins (Copy Team)
      const adminsSnap = await getDoc(doc(db, "settings", "admins"));
      const adminUids: string[] = adminsSnap.exists()
        ? (adminsSnap.data()?.uids as string[]) ?? []
        : [];

      await Promise.all(
        adminUids
          .filter((uid) => uid !== auth.currentUser?.uid)
          .map((uid) =>
            createNotification(
              uid,
              id,
              request.title,
              `New request "${request.title}" submitted for review`
            )
          )
      );

      setRequest((prev) => prev ? { ...prev, status: "submitted" } : prev);
    } catch {
      setError("Failed to submit. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResubmit() {
    if (!request) return;
    setSubmitting(true);
    try {
      await updateDoc(doc(db, "copyRequests", id), {
        status: "submitted",
        revisionNotes: null,
        submittedAt: serverTimestamp(),
      });

      // Notify admins
      const adminsSnap = await getDoc(doc(db, "settings", "admins"));
      const adminUids: string[] = adminsSnap.exists()
        ? (adminsSnap.data()?.uids as string[]) ?? []
        : [];

      await Promise.all(
        adminUids
          .filter((uid) => uid !== auth.currentUser?.uid)
          .map((uid) =>
            createNotification(
              uid,
              id,
              request.title,
              `"${request.title}" has been revised and resubmitted for review`
            )
          )
      );

      setRequest((prev) =>
        prev ? { ...prev, status: "submitted", revisionNotes: undefined } : prev
      );
    } catch {
      setError("Failed to resubmit. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Loading / error states ──────────────────────────────────────
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

  if (error || !request) {
    return (
      <div className="min-h-screen bg-gray-50">
        <DashboardNav />
        <div className="max-w-2xl mx-auto px-6 py-16 text-center">
          <p className="text-sm text-red-500">{error || "Request not found."}</p>
          <button
            onClick={() => router.push("/dashboard")}
            className="mt-4 text-sm text-gray-400 hover:text-gray-600 underline"
          >
            Back to dashboard
          </button>
        </div>
      </div>
    );
  }

  const cfg = STATUS_CONFIG[request.status] ?? STATUS_CONFIG.draft;
  const totalAnnotations = request.annotations?.length ?? 0;
  const annotationsPerScreenshot = (url: string) =>
    (request.annotations ?? []).filter((a) => a.screenshotUrl === url).length;

  const canSubmit = request.status === "draft" && totalAnnotations > 0;
  const canResubmit = request.status === "changes_requested";
  const isEditable = request.status === "draft" || request.status === "changes_requested";
  const isPending = request.status === "submitted" || request.status === "in_review";

  return (
    <div className="min-h-screen bg-gray-50">
      <DashboardNav />

      <main className="max-w-3xl mx-auto px-6 py-8 space-y-5">
        {/* Breadcrumb + header */}
        <div>
          <button
            onClick={() => router.push("/dashboard")}
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors mb-3 flex items-center gap-1"
          >
            ← All requests
          </button>
          <div className="flex items-start justify-between gap-4">
            <h1 className="text-xl font-bold text-gray-900">{request.title}</h1>
            <span className={`px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap ${cfg.classes}`}>
              {cfg.label}
            </span>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            {request.createdAt?.toDate().toLocaleDateString("en-US", {
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
            {request.tone && ` · ${request.tone}`}
          </p>
        </div>

        {/* Revision notes — shown when changes requested */}
        {request.status === "changes_requested" && request.revisionNotes && (
          <div className="bg-red-50 border border-red-200 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
              <p className="text-sm font-semibold text-red-700">
                Changes requested
              </p>
            </div>
            <p className="text-sm text-red-700 leading-relaxed">
              {request.revisionNotes}
            </p>
          </div>
        )}

        {/* Pending review notice */}
        {isPending && (
          <div className="bg-brand/10 border border-brand/30 rounded-2xl p-5">
            <p className="text-sm font-medium text-ink">
              {request.status === "in_review"
                ? "The Copy Team is reviewing this request."
                : "This request has been submitted and is awaiting review."}
            </p>
          </div>
        )}

        {/* Approved notice */}
        {request.status === "approved" && (
          <div className="bg-green-50 border border-green-200 rounded-2xl p-5">
            <p className="text-sm font-semibold text-green-700">
              This request has been approved by the Copy Team.
            </p>
          </div>
        )}

        {/* Feature context */}
        {request.context && (
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-2">
              Feature context
            </p>
            <p className="text-sm text-gray-700 leading-relaxed">{request.context}</p>
          </div>
        )}

        {/* Screenshots + annotations */}
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm font-medium text-gray-700">Screenshots</p>
              {totalAnnotations > 0 && (
                <p className="text-xs text-gray-400 mt-0.5">
                  {totalAnnotations} annotation{totalAnnotations !== 1 ? "s" : ""} total
                </p>
              )}
            </div>
            {request.screenshotURLs.length > 0 && isEditable && (
              <Link
                href={`/dashboard/${id}/annotate`}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-brand text-ink text-xs font-semibold hover:bg-brand-dark transition-colors"
              >
                {totalAnnotations > 0 ? "Edit annotations" : "Annotate screenshots"}
              </Link>
            )}
          </div>

          {request.screenshotURLs.length === 0 ? (
            <p className="text-sm text-gray-400 py-4 text-center">No screenshots uploaded.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {request.screenshotURLs.map((url, i) => {
                const count = annotationsPerScreenshot(url);
                return (
                  <div key={i} className="relative rounded-xl overflow-hidden border border-gray-100 aspect-video bg-gray-50">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt={`Screenshot ${i + 1}`}
                      className="w-full h-full object-cover"
                    />
                    {count > 0 && (
                      <div className="absolute bottom-1.5 right-1.5 bg-[#F4F5F6] text-ink text-xs font-semibold px-2 py-0.5 rounded-full">
                        {count}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Error */}
        {error && (
          <p className="text-sm text-red-600 bg-red-50 px-4 py-3 rounded-xl border border-red-100">
            {error}
          </p>
        )}

        {/* Actions */}
        <div className="flex gap-3 pb-8 flex-wrap">
          {totalAnnotations > 0 ? (
            <Link
              href={`/dashboard/${id}/generate`}
              className="flex-1 py-3 rounded-xl bg-[#F4F5F6] text-ink font-semibold text-sm hover:bg-gray-200 transition-colors text-center"
            >
              {request.status === "approved" ? "View copy" : "Generate copy"}
            </Link>
          ) : (
            <button
              disabled
              title="Annotate at least one screenshot to generate copy"
              className="flex-1 py-3 rounded-xl bg-[#F4F5F6] text-ink font-semibold text-sm opacity-40 cursor-not-allowed"
            >
              Generate copy
            </button>
          )}

          {canSubmit && (
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="flex-1 py-3 rounded-xl bg-brand text-ink font-semibold text-sm hover:bg-brand-dark transition-colors shadow-sm disabled:opacity-50"
            >
              {submitting ? "Submitting…" : "Submit for review"}
            </button>
          )}

          {canResubmit && (
            <button
              onClick={handleResubmit}
              disabled={submitting}
              className="flex-1 py-3 rounded-xl bg-brand text-ink font-semibold text-sm hover:bg-brand-dark transition-colors shadow-sm disabled:opacity-50"
            >
              {submitting ? "Resubmitting…" : "Resubmit for review"}
            </button>
          )}
        </div>
      </main>
    </div>
  );
}
