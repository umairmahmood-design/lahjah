"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import type { User } from "firebase/auth";

type Role = "designer" | "copy_team";

const ROLES: { value: Role; label: string; description: string }[] = [
  {
    value: "designer",
    label: "Designer",
    description: "Create copy requests, upload screenshots, and generate copy.",
  },
  {
    value: "copy_team",
    label: "Copy Team",
    description: "Review submitted requests, approve or request revisions.",
  },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [selected, setSelected] = useState<Role>("designer");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (!u) {
        router.replace("/login");
      } else {
        setUser(u);
      }
    });
    return unsub;
  }, [router]);

  async function handleConfirm() {
    if (!user) return;
    setSaving(true);
    setError("");
    try {
      await setDoc(doc(db, "users", user.uid), {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
        role: selected,
        createdAt: serverTimestamp(),
        onboardingCompleted: true,
      });
      router.push("/dashboard");
    } catch (err) {
      console.error("[onboarding] Firestore error writing users doc:", err);
      setError("Failed to save your profile. Please try again.");
      setSaving(false);
    }
  }

  async function handleSignOut() {
    await signOut(auth);
    router.push("/login");
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-brand border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="animated-gradient min-h-screen flex flex-col items-center justify-center px-4">
      <div className="text-3xl font-bold text-ink mb-10">لهجة</div>

      <div className="w-full max-w-md bg-white/90 backdrop-blur-md rounded-2xl shadow-xl border border-white/60 p-8">
        {/* User info */}
        <div className="flex items-center gap-3 mb-8">
          {user.photoURL ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={user.photoURL}
              alt={user.displayName ?? ""}
              className="w-10 h-10 rounded-full"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-brand/20 flex items-center justify-center text-ink font-semibold text-sm">
              {user.displayName?.[0] ?? user.email?.[0] ?? "?"}
            </div>
          )}
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">
              {user.displayName ?? user.email}
            </p>
            <p className="text-xs text-gray-400 truncate">{user.email}</p>
          </div>
        </div>

        <h1 className="text-xl font-semibold text-gray-900 mb-1">
          Welcome to Lahjah
        </h1>
        <p className="text-sm text-gray-400 mb-6">
          Choose your role to get started.
        </p>

        <div className="space-y-3 mb-6">
          {ROLES.map(({ value, label, description }) => (
            <button
              key={value}
              onClick={() => setSelected(value)}
              className={`w-full text-left px-4 py-4 rounded-xl border-2 transition-all ${
                selected === value
                  ? "border-ink bg-gray-50"
                  : "border-gray-100 hover:border-gray-200"
              }`}
            >
              <p className={`text-sm font-semibold ${selected === value ? "text-ink" : "text-gray-900"}`}>
                {label}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">{description}</p>
            </button>
          ))}
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg mb-4">
            {error}
          </p>
        )}

        <button
          onClick={handleConfirm}
          disabled={saving}
          className="w-full py-2.5 rounded-lg bg-brand text-ink font-semibold text-sm hover:bg-brand-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? "Saving…" : "Get started"}
        </button>

        <button
          onClick={handleSignOut}
          className="w-full mt-3 py-2 text-sm text-gray-400 hover:text-gray-600 transition-colors"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
