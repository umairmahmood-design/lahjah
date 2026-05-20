import Link from "next/link";
import Image from "next/image";

function HeartIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
    </svg>
  );
}

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Gradient hero area */}
      <div className="animated-gradient">
      {/* Nav */}
      <nav className="flex items-center justify-between px-8 py-5 border-b border-white/30">
        <div className="flex items-center gap-3">
          <Image src="/hs-logo.png" alt="HungerStation" height={24} width={52} className="object-contain" />
          <span className="w-px h-5 bg-gray-200 shrink-0" />
          <span className="logo-arabic text-2xl text-ink">لهجة</span>
        </div>
        <div className="flex items-center gap-6">
          <Link
            href="/login"
            className="text-sm font-medium text-gray-600 hover:text-ink transition-colors"
          >
            Sign in
          </Link>
          <Link
            href="/login"
            className="inline-flex items-center px-4 py-2 rounded-lg bg-brand text-ink text-sm font-medium hover:bg-brand-dark transition-colors"
          >
            Get started
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-4xl mx-auto px-8 pt-24 pb-20 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/70 text-ink text-xs font-medium mb-8 shadow-sm">
          <HeartIcon />
          Built by Product Design Team
        </div>
        <h1 className="text-5xl font-bold text-gray-900 leading-tight mb-6">
          The copy tool built for HungerStation teams
        </h1>
        <p className="text-xl text-gray-600 max-w-2xl mx-auto mb-10">
          Generate and review product copy — in English and Arabic, in minutes.
        </p>
        <Link
          href="/login"
          className="inline-flex px-6 py-3 rounded-xl bg-brand text-ink font-semibold text-base hover:bg-brand-dark transition-colors shadow-sm"
        >
          Start generating copy
        </Link>
      </section>
      </div>{/* end animated-gradient */}

      {/* Features */}
      <section id="features" className="max-w-5xl mx-auto px-8 py-20">
        <h2 className="text-3xl font-bold text-center text-gray-900 mb-4">
          Everything your team needs
        </h2>
        <p className="text-center text-gray-500 mb-14 max-w-xl mx-auto">
          From first draft to final review, Lahjah keeps your copy consistent,
          on-brand, and culturally relevant.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {[
            {
              icon: "✦",
              title: "AI-Powered Generation",
              body: "Describe what you need — Lahjah generates polished EN + AR copy in seconds using Claude.",
            },
            {
              icon: "⇄",
              title: "Bilingual by Default",
              body: "Every request returns English and Arabic side-by-side, with RTL support baked in.",
            },
            {
              icon: "◎",
              title: "Team Review Workflow",
              body: "Comment, approve, or request revisions — keep your whole team aligned before shipping.",
            },
          ].map((f) => (
            <div
              key={f.title}
              className="p-6 rounded-2xl border border-gray-100 bg-white hover:shadow-md transition-shadow"
            >
              <div className="w-10 h-10 rounded-xl bg-brand/20 text-ink flex items-center justify-center text-lg font-bold mb-4">
                {f.icon}
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">{f.title}</h3>
              <p className="text-sm text-gray-500 leading-relaxed">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="bg-ink">
        <div className="max-w-4xl mx-auto px-8 py-20 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">
            Ready to ship better copy, faster?
          </h2>
          <p className="text-gray-400 mb-8 text-lg">
            Join product and design teams using Lahjah to move at the speed of
            their ideas.
          </p>
          <Link
            href="/login"
            className="inline-flex items-center px-6 py-3 rounded-xl bg-brand text-ink font-semibold text-base hover:bg-brand-dark transition-colors"
          >
            Get started free
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-100 px-8 py-6 flex items-center justify-between text-sm text-gray-400">
        <span className="logo-arabic text-ink">لهجة · Lahjah</span>
        <span>© {new Date().getFullYear()} Lahjah. All rights reserved.</span>
      </footer>
    </div>
  );
}
