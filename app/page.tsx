import Link from "next/link";
import Image from "next/image";
import FloatingLetters from "@/components/FloatingLetters";

function HeartIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
    </svg>
  );
}

const FEATURES = [
  {
    icon: "✦",
    title: "For Designers",
    body: "Submit copy requests without leaving your workflow",
  },
  {
    icon: "◎",
    title: "For Copy Team",
    body: "Review, approve, and give feedback in one place",
  },
  {
    icon: "⇄",
    title: "For Everyone",
    body: "Bilingual by default: EN and AR generated together",
  },
];

export default function LandingPage() {
  return (
    <div className="animated-gradient min-h-screen relative overflow-hidden">
      <FloatingLetters />
      <div className="relative z-10 min-h-screen flex flex-col">
      {/* Nav */}
      <nav className="flex items-center justify-between px-8 py-5 border-b border-white/30">
        <div className="flex items-center gap-3">
          <Image src="/hs-logo.png" alt="HungerStation" height={24} width={52} className="object-contain" />
          <span className="w-px h-5 bg-gray-400/40 shrink-0" />
          <span className="logo-arabic text-2xl text-ink">لهجة</span>
        </div>
        <div className="flex items-center gap-6">
          <Link
            href="/login"
            className="text-sm font-medium text-gray-700 hover:text-ink transition-colors"
          >
            Sign in
          </Link>
          <Link
            href="/login"
            className="inline-flex items-center px-4 py-2 rounded-lg bg-brand text-ink text-sm font-medium hover:bg-brand-dark transition-colors shadow-sm"
          >
            Get started
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-4xl mx-auto px-8 pt-24 pb-20 text-center">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/70 text-ink text-xs font-medium mb-8 shadow-sm">
          <HeartIcon />
          Built by HS Product Design Team
        </div>
        <h1 className="text-5xl font-bold text-gray-900 leading-tight mb-6">
          The copy tool built for HungerStation teams
        </h1>
        <p className="text-xl text-gray-700 max-w-2xl mx-auto mb-10">
          Generate and review product copy, in English and Arabic, in minutes.
        </p>
        <Link
          href="/login"
          className="inline-flex px-6 py-3 rounded-xl bg-brand text-ink font-semibold text-base hover:bg-brand-dark transition-colors shadow-sm"
        >
          Start generating copy
        </Link>
        <p className="mt-4 text-sm text-gray-600">
          Available to all HungerStation employees. Sign in with your Google account.
        </p>
      </section>

      {/* Features */}
      <section className="max-w-5xl mx-auto px-8 pb-24">
        <h2 className="text-3xl font-bold text-center text-gray-900 mb-14">
          Faster copy. Less back and forth.
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="p-6 rounded-2xl backdrop-blur-md bg-white/70 border border-white/80 hover:bg-white/85 transition-colors"
            >
              <div className="w-10 h-10 rounded-xl bg-white/80 text-ink flex items-center justify-center text-lg font-bold mb-4 shadow-sm">
                {f.icon}
              </div>
              <h3 className="font-semibold text-gray-900 mb-2">{f.title}</h3>
              <p className="text-sm text-gray-600 leading-relaxed">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-auto border-t border-white/30 px-8 py-6 flex items-center justify-between text-sm text-gray-600">
        <span className="logo-arabic text-ink">لهجة · Lahjah</span>
        <a href="/adapt" className="underline underline-offset-2 hover:text-ink transition-colors">
          Adapt Lahjah for your entity
        </a>
      </footer>
      </div>{/* end z-10 */}
    </div>
  );
}
