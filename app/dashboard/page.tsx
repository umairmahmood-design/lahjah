"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  Timestamp,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import DashboardNav from "@/components/DashboardNav";

interface CopyRequest {
  id: string;
  title: string;
  status: "pending" | "generated" | "approved" | "rejected";
  createdAt: Timestamp;
  copyEn?: string;
  copyAr?: string;
}

const STATUS_COLORS: Record<CopyRequest["status"], string> = {
  pending: "bg-yellow-100 text-yellow-700",
  generated: "bg-blue-100 text-brand",
  approved: "bg-green-100 text-green-700",
  rejected: "bg-red-100 text-red-600",
};

export default function DashboardPage() {
  const [requests, setRequests] = useState<CopyRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [uid, setUid] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setUid(user?.uid ?? null);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!uid) return;

    const q = query(
      collection(db, "copyRequests"),
      where("uid", "==", uid),
      orderBy("createdAt", "desc")
    );

    const unsub = onSnapshot(q, (snap) => {
      const docs = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<CopyRequest, "id">),
      }));
      setRequests(docs);
      setLoading(false);
    });

    return unsub;
  }, [uid]);

  return (
    <div className="min-h-screen bg-gray-50">
      <DashboardNav />

      <main className="max-w-5xl mx-auto px-8 py-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Copy Requests</h1>
            <p className="text-sm text-gray-500 mt-1">
              {requests.length} request{requests.length !== 1 ? "s" : ""}
            </p>
          </div>
          <Link
            href="/dashboard/new"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand text-white font-semibold text-sm hover:bg-brand-dark transition-colors shadow-sm"
          >
            <span className="text-lg leading-none">+</span>
            New request
          </Link>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-4 border-brand border-t-transparent rounded-full animate-spin" />
          </div>
        ) : requests.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-gray-200">
            <p className="text-4xl mb-4">✦</p>
            <h3 className="font-semibold text-gray-900 mb-2">
              No requests yet
            </h3>
            <p className="text-sm text-gray-500 mb-6">
              Create your first copy request and let Lahjah do the writing.
            </p>
            <Link
              href="/dashboard/new"
              className="inline-flex items-center px-4 py-2 rounded-lg bg-brand text-white text-sm font-medium hover:bg-brand-dark transition-colors"
            >
              + New request
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {requests.map((req) => (
              <div
                key={req.id}
                className="bg-white rounded-xl border border-gray-100 px-6 py-4 flex items-center justify-between hover:shadow-sm transition-shadow"
              >
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium text-gray-900 truncate">
                    {req.title}
                  </h3>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {req.createdAt?.toDate().toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </p>
                </div>

                <div className="flex items-center gap-4 ml-4">
                  {req.copyEn && (
                    <div className="hidden sm:flex gap-3 text-xs text-gray-400">
                      <span>EN ✓</span>
                      <span>AR ✓</span>
                    </div>
                  )}
                  <span
                    className={`px-2.5 py-1 rounded-full text-xs font-medium capitalize ${
                      STATUS_COLORS[req.status]
                    }`}
                  >
                    {req.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
