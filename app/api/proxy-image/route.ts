import { NextRequest, NextResponse } from "next/server";

// Server-side image proxy for OCR — avoids CORS restrictions on Firebase Storage URLs.
// The client cannot fetch firebasestorage.googleapis.com directly (no CORS headers),
// but the server can. Client fetches /api/proxy-image?url=... (same origin), no CORS needed.
export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get("url");

  if (!url) {
    return NextResponse.json({ error: "Missing url param" }, { status: 400 });
  }

  // Allowlist: only proxy Firebase Storage URLs to prevent SSRF
  if (!url.startsWith("https://firebasestorage.googleapis.com/")) {
    return NextResponse.json({ error: "URL not allowed" }, { status: 403 });
  }

  try {
    const upstream = await fetch(url);
    if (!upstream.ok) {
      return NextResponse.json(
        { error: `Upstream ${upstream.status}` },
        { status: upstream.status }
      );
    }
    const buffer = await upstream.arrayBuffer();
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": upstream.headers.get("Content-Type") ?? "image/jpeg",
        "Cache-Control": "public, max-age=3600, immutable",
      },
    });
  } catch (err) {
    console.error("[proxy-image] fetch error:", err);
    return NextResponse.json({ error: "Proxy error" }, { status: 500 });
  }
}
