"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import DashboardNav from "@/components/DashboardNav";

interface GeneratedCopy {
  en: string;
  ar: string;
}

export default function NewRequestPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [context, setContext] = useState("");
  const [tone, setTone] = useState("professional");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GeneratedCopy | null>(null);
  const [error, setError] = useState("");

  async function handleGenerate(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    setResult(null);

    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description, context, tone }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Generation failed.");
      }

      const data: GeneratedCopy = await res.json();
      setResult(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!result) return;
    const uid = auth.currentUser?.uid;
    if (!uid) return;

    try {
      await addDoc(collection(db, "copyRequests"), {
        uid,
        title,
        description,
        context,
        tone,
        copyEn: result.en,
        copyAr: result.ar,
        status: "generated",
        createdAt: serverTimestamp(),
      });
      router.push("/dashboard");
    } catch {
      setError("Failed to save request. Please try again.");
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <DashboardNav />

      <main className="max-w-3xl mx-auto px-8 py-10">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">New Copy Request</h1>
          <p className="text-sm text-gray-500 mt-1">
            Describe what you need — Lahjah will generate EN + AR copy instantly.
          </p>
        </div>

        <form onSubmit={handleGenerate} className="space-y-5">
          <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-5">
            {/* Title */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Request title <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Checkout CTA button"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition"
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                What copy do you need? <span className="text-red-400">*</span>
              </label>
              <textarea
                required
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="e.g. A short, punchy CTA for the checkout button that encourages users to complete their order."
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition resize-none"
              />
            </div>

            {/* Context */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Brand / product context{" "}
                <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <textarea
                value={context}
                onChange={(e) => setContext(e.target.value)}
                rows={2}
                placeholder="e.g. Fast-delivery food app targeting Saudi Arabia. Brand voice: friendly, energetic."
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition resize-none"
              />
            </div>

            {/* Tone */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Tone
              </label>
              <select
                value={tone}
                onChange={(e) => setTone(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition bg-white"
              >
                <option value="professional">Professional</option>
                <option value="friendly">Friendly</option>
                <option value="playful">Playful</option>
                <option value="urgent">Urgent</option>
                <option value="formal">Formal</option>
                <option value="conversational">Conversational</option>
              </select>
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 px-4 py-3 rounded-xl">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-xl bg-brand text-white font-semibold text-sm hover:bg-brand-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
          >
            {loading ? "Generating…" : "✦ Generate copy"}
          </button>
        </form>

        {/* Results */}
        {result && (
          <div className="mt-8 space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">
              Generated Copy
            </h2>

            {/* English */}
            <div className="bg-white rounded-2xl border border-gray-100 p-6">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                  English
                </span>
              </div>
              <p className="text-gray-900 leading-relaxed whitespace-pre-wrap">
                {result.en}
              </p>
            </div>

            {/* Arabic */}
            <div className="bg-white rounded-2xl border border-gray-100 p-6">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                  Arabic (عربي)
                </span>
              </div>
              <p
                dir="rtl"
                className="text-gray-900 leading-relaxed whitespace-pre-wrap font-medium"
              >
                {result.ar}
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleSave}
                className="flex-1 py-3 rounded-xl bg-brand text-white font-semibold text-sm hover:bg-brand-dark transition-colors"
              >
                Save to dashboard
              </button>
              <button
                onClick={() => setResult(null)}
                className="px-6 py-3 rounded-xl border border-gray-200 text-gray-600 font-semibold text-sm hover:bg-gray-50 transition-colors"
              >
                Regenerate
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
