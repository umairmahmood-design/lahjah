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
  const shown = req.screenshotURLs?.slice(0, 4) ?? [];
  const extra = (req.screenshotURLs?.length ?? 0) - 4;

  return (
    <Link
      href={`/dashboard/${req.id}`}
      className="block bg-white rounded-xl border border-gray-100 hover:shadow-sm transition-shadow cursor-pointer group overflow-hidden"
    >
      {/* Top row: title + meta + status */}
      <div className="flex items-center gap-3 px-5 py-4">
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
        <span className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap ${cfg.classes}`}>
          {cfg.label}
        </span>
      </div>

      {/* Bottom row: screenshot thumbnails (only if any exist) */}
      {shown.length > 0 && (
        <div className="flex gap-2 px-5 pb-4">
          {shown.map((url, i) => (
            <div key={i} className="relative shrink-0 w-[180px] h-[180px] rounded-lg overflow-hidden bg-gray-100">
              <Image src={url} alt="" fill className="object-cover" sizes="180px" />
            </div>
          ))}
          {extra > 0 && (
            <div className="shrink-0 w-[180px] h-[180px] rounded-lg bg-gray-100 flex items-center justify-center">
              <span className="text-sm font-semibold text-gray-400">+{extra} more</span>
            </div>
          )}
        </div>
      )}
    </Link>
  );
}
