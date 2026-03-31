import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function POST(req: NextRequest) {
  let body: {
    title?: string;
    description?: string;
    context?: string;
    tone?: string;
    lockedTerms?: string[];
    existingCopy?: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { title, description, context, tone = "professional", lockedTerms = [], existingCopy } = body;

  if (!title || !description) {
    return NextResponse.json(
      { error: "title and description are required." },
      { status: 400 }
    );
  }

  // Fetch brand guidelines (best-effort — generation still works without them)
  let guidelinesSection = "";
  try {
    const { adminDb } = await import("@/lib/firebase-admin");
    const snap = await adminDb.doc("settings/guidelines").get();
    if (snap.exists) {
      const content = (snap.data()?.content as string | undefined)?.trim();
      if (content) {
        guidelinesSection = `\n\nBRAND GUIDELINES (follow these for every suggestion):\n${content}`;
      }
    }
  } catch {
    // Non-fatal — proceed without guidelines
  }

  const lockedTermsRule =
    lockedTerms.length > 0
      ? `\n- LOCKED TERMS — preserve these exactly as written in every suggestion, in both languages, never translate, paraphrase, or alter them: ${lockedTerms.map((t) => `"${t}"`).join(", ")}`
      : "";

  const systemPrompt = `You are Lahjah, an expert bilingual copywriter specialising in Arabic and English product copy for MENA markets.

Your task is to generate 3 distinct copy suggestions in BOTH English and Arabic for a specific UI element.

Rules:
- Each suggestion must differ meaningfully in phrasing, length, or tone approach
- Keep all copy concise and impactful
- Arabic copy must be natural and idiomatic — never a literal translation
- Respect RTL reading direction and Arabic UX conventions
- Match the requested tone precisely across all suggestions${lockedTermsRule}
- Return ONLY valid JSON in this exact shape — no markdown, no extra keys:
  { "en": ["option 1", "option 2", "option 3"], "ar": ["خيار 1", "خيار 2", "خيار 3"] }${guidelinesSection}`;

  const userPrompt = `Request title: ${title}

UI element: ${description}${existingCopy ? `\n\nCurrent text on this element: "${existingCopy}" — please revise it.` : ""}${context ? `\n\nBrand/product context: ${context}` : ""}

Tone: ${tone}

Generate 3 distinct suggestions for this UI element now.`;

  try {
    const response = await client.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    const rawText =
      response.content[0].type === "text" ? response.content[0].text : "";

    const cleaned = rawText.replace(/```(?:json)?/g, "").trim();
    const parsed = JSON.parse(cleaned) as { en: string[]; ar: string[] };

    if (
      !Array.isArray(parsed.en) ||
      !Array.isArray(parsed.ar) ||
      parsed.en.length === 0 ||
      parsed.ar.length === 0
    ) {
      throw new Error("Unexpected response shape from model.");
    }

    return NextResponse.json(parsed);
  } catch (err: unknown) {
    console.error("[/api/generate] Error:", err);
    return NextResponse.json(
      { error: "Copy generation failed. Please try again." },
      { status: 500 }
    );
  }
}
