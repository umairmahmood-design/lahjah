"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";

export default function DashboardNav() {
  const router = useRouter();

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
      <nav className="flex items-center gap-6">
        <Link
          href="/dashboard"
          className="text-sm font-medium text-gray-600 hover:text-ink transition-colors"
        >
          Requests
        </Link>
        <Link
          href="/dashboard/new"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-brand text-ink text-sm font-medium hover:bg-brand-dark transition-colors"
        >
          <span className="text-lg leading-none">+</span>
          New request
        </Link>
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
