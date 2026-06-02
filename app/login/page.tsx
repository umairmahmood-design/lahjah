"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  onAuthStateChanged,
} from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import FloatingLetters from "@/components/FloatingLetters";

// TODO: Replace email/password with Google Sign-In after OKTA approval
// Use signInWithRedirect + getRedirectResult (NOT signInWithPopup)
// Restrict to @hungerstation.com domain only

type Mode = "signin" | "create" | "forgot" | "success";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  // Redirect already-signed-in users
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setLoading(false);
        return;
      }
      try {
        const userSnap = await getDoc(doc(db, "users", user.uid));
        if (userSnap.exists() && userSnap.data().onboardingCompleted === true) {
          router.push("/dashboard");
        } else {
          router.push("/onboarding");
        }
      } catch (err) {
        console.error("[login] Firestore error:", err);
        setLoading(false);
      }
    });
    return unsub;
  }, [router]);

  async function handleSignIn() {
    if (!email || !password) {
      setError("Please enter your email and password.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      // onAuthStateChanged handles the redirect
    } catch (err: unknown) {
      setLoading(false);
      const msg = err instanceof Error ? err.message : "";
      if (
        msg.includes("user-not-found") ||
        msg.includes("wrong-password") ||
        msg.includes("invalid-credential")
      ) {
        setError("Incorrect email or password.");
      } else {
        setError("Sign in failed. Please try again.");
      }
    }
  }

  async function handleCreate() {
    if (!email || !password || !confirmPassword) {
      setError("Please fill in all fields.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await setDoc(doc(db, "users", cred.user.uid), {
        uid: cred.user.uid,
        email: cred.user.email,
        role: null,
        createdAt: serverTimestamp(),
        onboardingCompleted: false,
      });
      router.push("/onboarding");
    } catch (err: unknown) {
      setLoading(false);
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("email-already-in-use")) {
        setError("An account with this email already exists.");
      } else if (msg.includes("invalid-email")) {
        setError("Please enter a valid email address.");
      } else {
        setError("Failed to create account. Please try again.");
      }
    }
  }

  async function handleForgotPassword() {
    if (!email) {
      setError("Please enter your email address.");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, email);
      setMode("success");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("user-not-found") || msg.includes("invalid-credential")) {
        setError("No account found with that email.");
      } else {
        setError("Failed to send reset link. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  function switchMode(next: Mode) {
    setMode(next);
    setError("");
    setConfirmPassword("");
  }

  if (loading) {
    return (
      <div className="animated-gradient-bg relative overflow-hidden flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-ink border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="animated-gradient-bg relative overflow-hidden">
      <FloatingLetters />
      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center px-4">
        <Link href="/" className="logo-arabic text-3xl text-ink mb-10">
          لهجة
        </Link>

        <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl border border-gray-100 p-8">

          {/* ── Success state ── */}
          {mode === "success" && (
            <>
              <h1 className="text-xl font-semibold text-gray-900 mb-3 text-center">
                Check your email
              </h1>
              <p className="text-sm text-gray-500 text-center mb-6">
                We sent a reset link to {email}. Check your inbox.
              </p>
              <p className="text-center text-sm text-gray-400">
                <button
                  onClick={() => switchMode("signin")}
                  className="text-ink font-medium hover:underline"
                >
                  Back to sign in
                </button>
              </p>
            </>
          )}

          {/* ── Forgot password state ── */}
          {mode === "forgot" && (
            <>
              <h1 className="text-xl font-semibold text-gray-900 mb-1 text-center">
                Reset your password
              </h1>
              <p className="text-sm text-gray-400 text-center mb-6">
                Enter your email and we&apos;ll send you a reset link.
              </p>

              {error && (
                <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg mb-4 text-center">
                  {error}
                </p>
              )}

              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleForgotPassword()}
                className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent mb-4"
              />

              <button
                onClick={handleForgotPassword}
                className="w-full py-2.5 rounded-lg bg-brand text-ink font-semibold text-sm hover:bg-brand-dark transition-colors mb-4"
              >
                Send reset link
              </button>

              <p className="text-center text-sm text-gray-400">
                <button
                  onClick={() => switchMode("signin")}
                  className="text-ink font-medium hover:underline"
                >
                  Back to sign in
                </button>
              </p>
            </>
          )}

          {/* ── Sign in / Create account states ── */}
          {(mode === "signin" || mode === "create") && (
            <>
              <h1 className="text-xl font-semibold text-gray-900 mb-6 text-center">
                {mode === "signin" ? "Sign in to Lahjah" : "Create your account"}
              </h1>

              {error && (
                <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg mb-4 text-center">
                  {error}
                </p>
              )}

              <div className="space-y-3 mb-1">
                <input
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
                />
                <input
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) =>
                    mode === "signin" && e.key === "Enter" && handleSignIn()
                  }
                  className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
                />
                {mode === "create" && (
                  <input
                    type="password"
                    placeholder="Confirm password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent"
                  />
                )}
              </div>

              {mode === "signin" && (
                <div className="flex justify-end mb-4 mt-1.5">
                  <button
                    onClick={() => switchMode("forgot")}
                    className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    Forgot password?
                  </button>
                </div>
              )}

              {mode === "create" && <div className="mb-4" />}

              <button
                onClick={mode === "signin" ? handleSignIn : handleCreate}
                className="w-full py-2.5 rounded-lg bg-brand text-ink font-semibold text-sm hover:bg-brand-dark transition-colors mb-4"
              >
                {mode === "signin" ? "Sign in" : "Create account"}
              </button>

              <p className="text-center text-sm text-gray-400">
                {mode === "signin" ? (
                  <>
                    No account?{" "}
                    <button
                      onClick={() => switchMode("create")}
                      className="text-ink font-medium hover:underline"
                    >
                      Create one
                    </button>
                  </>
                ) : (
                  <>
                    Already have an account?{" "}
                    <button
                      onClick={() => switchMode("signin")}
                      className="text-ink font-medium hover:underline"
                    >
                      Sign in
                    </button>
                  </>
                )}
              </p>
            </>
          )}

        </div>
      </div>
    </div>
  );
}
