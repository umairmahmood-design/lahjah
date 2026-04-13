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
    characterLimit?: "approximately_same" | "exactly_same" | "no_limit";
    task?: "revise_and_translate" | "arabic_only" | "english_only";
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const {
    title,
    description,
    context,
    tone = "professional",
    lockedTerms = [],
    existingCopy,
    characterLimit = "no_limit",
    task = "revise_and_translate",
  } = body;

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

  const characterLimitRule =
    characterLimit === "approximately_same" && existingCopy
      ? `\n- CHARACTER LIMIT — each suggestion must be within ±10 characters of the existing copy length (${existingCopy.length} characters)`
      : characterLimit === "exactly_same" && existingCopy
      ? `\n- CHARACTER LIMIT — each suggestion must be exactly ${existingCopy.length} characters long`
      : "";

  const taskInstructions: Record<typeof task, string> = {
    revise_and_translate: "Generate 3 distinct suggestions for both English and Arabic.",
    arabic_only: `Arabic translation only. The 'en' array must contain the original English text repeated 3 times unchanged: ["${existingCopy ?? description}", "${existingCopy ?? description}", "${existingCopy ?? description}"]. Generate 3 distinct Arabic translations in the 'ar' array.`,
    english_only: `English revision only. Generate 3 distinct English suggestions in the 'en' array. The 'ar' array must contain 3 empty strings: ["", "", ""].`,
  };

  const systemPrompt = `You are Lahjah, an expert bilingual copywriter specialising in Arabic and English product copy for MENA markets.

Rules:
- Each suggestion must differ meaningfully in phrasing, length, or tone approach
- Keep all copy concise and impactful
- Arabic copy must be natural and idiomatic — never a literal translation
- Respect RTL reading direction and Arabic UX conventions
- Match the requested tone precisely across all suggestions${lockedTermsRule}${characterLimitRule}
- Return ONLY valid JSON in this exact shape — no markdown, no extra keys:
  { "en": ["option 1", "option 2", "option 3"], "ar": ["خيار 1", "خيار 2", "خيار 3"] }${guidelinesSection}`;

  const userPrompt = `Request title: ${title}

UI element: ${description}${existingCopy ? `\n\nCurrent text on this element: "${existingCopy}" — please revise it.` : ""}${context ? `\n\nBrand/product context: ${context}` : ""}

Tone: ${tone}

Task: ${taskInstructions[task]}`;

  try {
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
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
    const message = err instanceof Error ? err.message : String(err);
    console.error("[/api/generate] Error:", message);
    return NextResponse.json(
      { error: `Copy generation failed: ${message}` },
      { status: 500 }
    );
  }
}
