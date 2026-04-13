"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  collection,
  query,
  where,
  onSnapshot,
  Timestamp,
  doc,
  getDoc,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import DashboardNav from "@/components/DashboardNav";
import { STATUS_CONFIG, type RequestStatus } from "@/lib/status";
import { useRouter } from "next/navigation";

interface CopyRequest {
  id: string;
  title: string;
  status: RequestStatus;
  createdAt: Timestamp;
  tone?: string;
  screenshotURLs?: string[];
}

const REVIEW_STATUSES: RequestStatus[] = ["submitted", "in_review", "approved", "changes_requested"];

export default function ReviewQueuePage() {
  const router = useRouter();
  const [requests, setRequests] = useState<CopyRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { router.replace("/login"); return; }

      const adminsSnap = await getDoc(doc(db, "settings", "admins"));
      const adminUids = adminsSnap.exists()
        ? (adminsSnap.data()?.uids as string[]) ?? []
        : null;
      const admin = adminUids === null || adminUids.includes(user.uid);
      setIsAdmin(admin);

      if (!admin) { setLoading(false); return; }

      const q = query(
        collection(db, "copyRequests"),
        where("status", "in", REVIEW_STATUSES)
      );

      const unsubSnap = onSnapshot(q, (snap) => {
        const docs = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<CopyRequest, "id">) }))
          .sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0));
        setRequests(docs);
        setLoading(false);
      });

      return unsubSnap;
    });
    return unsub;
  }, [router]);

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

  if (isAdmin === false) {
    return (
      <div className="min-h-screen bg-gray-50">
        <DashboardNav />
        <div className="max-w-2xl mx-auto px-6 py-16 text-center">
          <p className="text-2xl mb-3">🔒</p>
          <h1 className="text-lg font-semibold text-gray-900 mb-2">Access restricted</h1>
          <p className="text-sm text-gray-500 mb-6">Only Copy Team members can access the review queue.</p>
          <button onClick={() => router.push("/dashboard")} className="text-sm text-gray-400 hover:text-gray-600 underline">
            Back to dashboard
          </button>
        </div>
      </div>
    );
  }

  const pending = requests.filter((r) => r.status === "submitted" || r.status === "in_review");
  const resolved = requests.filter((r) => r.status === "approved" || r.status === "changes_requested");

  return (
    <div className="min-h-screen bg-gray-50">
      <DashboardNav />

      <main className="max-w-5xl mx-auto px-6 sm:px-8 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Review queue</h1>
          <p className="text-sm text-gray-400 mt-1">
            {pending.length} pending · {resolved.length} resolved
          </p>
        </div>

        {requests.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-gray-200">
            <p className="text-sm text-gray-400">No requests submitted for review yet.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {pending.length > 0 && (
              <section>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                  Needs review
                </p>
                <div className="space-y-2">
                  {pending.map((req) => (
                    <RequestRow key={req.id} req={req} />
                  ))}
                </div>
              </section>
            )}

            {resolved.length > 0 && (
              <section>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                  Resolved
                </p>
                <div className="space-y-2">
                  {resolved.map((req) => (
                    <RequestRow key={req.id} req={req} />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function RequestRow({ req }: { req: CopyRequest }) {
  const cfg = STATUS_CONFIG[req.status] ?? STATUS_CONFIG.draft;
  return (
    <Link
      href={`/dashboard/${req.id}`}
      className="bg-white rounded-xl border border-gray-100 px-4 py-3 flex items-center gap-4 hover:shadow-sm transition-shadow cursor-pointer group"
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

      <span className={`ml-2 shrink-0 px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap ${cfg.classes}`}>
        {cfg.label}
      </span>
    </Link>
  );
}
