"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import NotificationBell from "@/components/NotificationBell";

export default function DashboardNav() {
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);
  const [uid, setUid] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) return;
      setUid(user.uid);
      const adminsSnap = await getDoc(doc(db, "settings", "admins"));
      // No admins doc = bootstrap mode, treat as admin
      const adminUids = adminsSnap.exists()
        ? (adminsSnap.data()?.uids as string[]) ?? []
        : null;
      setIsAdmin(adminUids === null || adminUids.includes(user.uid));
    });
    return unsub;
  }, []);

  async function handleSignOut() {
    await signOut(auth);
    router.replace("/login");
  }

  return (
    <header className="bg-white border-b border-gray-100 px-8 py-4 flex items-center justify-between">
      <Link href="/dashboard" className="flex items-center gap-3">
        <Image src="/hs-logo.png" alt="HungerStation" height={24} width={52} className="object-contain" />
        <span className="w-px h-5 bg-gray-200 shrink-0" />
        <span className="text-2xl font-bold text-ink">لهجة</span>
      </Link>
      <nav className="flex items-center gap-4 sm:gap-6">
        <Link
          href="/dashboard"
          className="text-sm font-medium text-gray-600 hover:text-ink transition-colors"
        >
          Requests
        </Link>
        {isAdmin && (
          <>
            <Link
              href="/dashboard/review"
              className="text-sm font-medium text-gray-600 hover:text-ink transition-colors"
            >
              Review queue
            </Link>
            <Link
              href="/dashboard/guidelines"
              className="text-sm font-medium text-gray-600 hover:text-ink transition-colors"
            >
              Guidelines
            </Link>
          </>
        )}
        <Link
          href="/dashboard/new"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand text-ink text-sm font-medium hover:bg-brand-dark transition-colors"
        >
          <span className="text-lg leading-none">+</span>
          New request
        </Link>
        {uid && <NotificationBell uid={uid} />}
        <button
          onClick={handleSignOut}
          className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
        >
          Sign out
        </button>
      </nav>
    </header>
  );
}
