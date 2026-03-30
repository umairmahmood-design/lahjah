"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { doc, getDoc, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import DashboardNav from "@/components/DashboardNav";

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
  status: "draft" | "submitted" | "approved" | "rejected";
  tone: string;
  context: string;
  screenshotURLs: string[];
  annotations?: Annotation[];
  createdAt: Timestamp;
}

const STATUS_CONFIG: Record<
  CopyRequest["status"],
  { label: string; classes: string }
> = {
  draft: { label: "Draft", classes: "bg-gray-100 text-gray-500" },
  submitted: { label: "Submitted", classes: "bg-brand/20 text-ink" },
  approved: { label: "Approved", classes: "bg-green-100 text-green-700" },
  rejected: { label: "Changes requested", classes: "bg-red-50 text-red-600" },
};

export default function RequestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [request, setRequest] = useState<CopyRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
            {request.screenshotURLs.length > 0 && (
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
                      <div className="absolute bottom-1.5 right-1.5 bg-brand text-ink text-xs font-semibold px-2 py-0.5 rounded-full">
                        {count}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3 pb-8">
          {totalAnnotations > 0 ? (
            <Link
              href={`/dashboard/${id}/generate`}
              className="flex-1 py-3 rounded-xl bg-brand text-ink font-semibold text-sm hover:bg-brand-dark transition-colors shadow-sm text-center"
            >
              Generate copy
            </Link>
          ) : (
            <button
              disabled
              title="Annotate at least one screenshot to generate copy"
              className="flex-1 py-3 rounded-xl bg-brand text-ink font-semibold text-sm opacity-40 cursor-not-allowed"
            >
              Generate copy
            </button>
          )}
        </div>
      </main>
    </div>
  );
}
