"use client";

import { useState, FormEvent } from "react";
import FloatingLetters from "@/components/FloatingLetters";

export default function AdaptPage() {
  const [form, setForm] = useState({
    entityName: "",
    requesterName: "",
    requesterSlack: "",
    email: "",
    languages: "",
    reason: "",
  });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/adapt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      if (!res.ok) throw new Error("send_failed");
      setSuccess(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="animated-gradient min-h-screen relative overflow-hidden">
      <FloatingLetters />
      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center px-4 py-16">
        <div className="logo-arabic text-3xl text-ink mb-10">لهجة</div>

        <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl border border-gray-100 p-8">
          {success ? (
            <div className="text-center py-8">
              <div className="w-12 h-12 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-4">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <h2 className="text-lg font-semibold text-gray-900 mb-2">Request sent!</h2>
              <p className="text-sm text-gray-500">Thanks! We&apos;ll be in touch soon.</p>
            </div>
          ) : (
            <>
              <h1 className="text-xl font-semibold text-gray-900 mb-1">
                Adapt Lahjah for Your Entity
              </h1>
              <p className="text-sm text-gray-400 mb-8">
                Interested in bringing Lahjah to your team across Delivery Hero? Fill in the details below.
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <Field label="Entity Name" required>
                  <input
                    name="entityName"
                    type="text"
                    required
                    placeholder="e.g. Talabat, Hungerz"
                    value={form.entityName}
                    onChange={handleChange}
                    className={inputCls}
                  />
                </Field>

                <Field label="Requester Name" required>
                  <input
                    name="requesterName"
                    type="text"
                    required
                    placeholder="Your full name"
                    value={form.requesterName}
                    onChange={handleChange}
                    className={inputCls}
                  />
                </Field>

                <Field label="Requester Slack" required>
                  <input
                    name="requesterSlack"
                    type="text"
                    required
                    placeholder="@username"
                    value={form.requesterSlack}
                    onChange={handleChange}
                    className={inputCls}
                  />
                </Field>

                <Field label="Official DH Email" required>
                  <input
                    name="email"
                    type="email"
                    required
                    placeholder="name@deliveryhero.com"
                    value={form.email}
                    onChange={handleChange}
                    className={inputCls}
                  />
                </Field>

                <Field label="Languages Required" required>
                  <input
                    name="languages"
                    type="text"
                    required
                    placeholder="e.g. English, Arabic, German"
                    value={form.languages}
                    onChange={handleChange}
                    className={inputCls}
                  />
                </Field>

                <Field label="Why do you need Lahjah?" required>
                  <textarea
                    name="reason"
                    required
                    rows={4}
                    placeholder="Describe your copy workflow and what problem you're trying to solve"
                    value={form.reason}
                    onChange={handleChange}
                    className={`${inputCls} resize-none`}
                  />
                </Field>

                {error && (
                  <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
                    {error}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 rounded-lg bg-brand text-ink font-semibold text-sm hover:bg-brand-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? "Sending…" : "Submit Request"}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5">
        {label}
        {required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

const inputCls =
  "w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition text-gray-700 placeholder-gray-300";
