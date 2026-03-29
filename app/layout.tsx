import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lahjah — AI Copy Generation & Review",
  description:
    "AI-powered copy generation and review platform for product and design teams.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900 antialiased">{children}</body>
    </html>
  );
}
