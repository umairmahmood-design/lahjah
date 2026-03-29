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
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { title, description, context, tone = "professional" } = body;

  if (!title || !description) {
    return NextResponse.json(
      { error: "title and description are required." },
      { status: 400 }
    );
  }

  const systemPrompt = `You are Lahjah, an expert bilingual copywriter specialising in Arabic and English product copy for MENA markets.

Your task is to generate compelling, culturally-appropriate copy in BOTH English and Arabic.

Rules:
- Keep copy concise and impactful
- Arabic copy must be natural and idiomatic — not a literal translation
- Respect RTL reading direction and Arabic UX conventions
- Match the requested tone precisely
- Return ONLY valid JSON in this exact shape — no markdown, no extra keys:
  { "en": "English copy here", "ar": "النص العربي هنا" }`;

  const userPrompt = `Request title: ${title}

What to write: ${description}${
    context ? `\n\nBrand/product context: ${context}` : ""
  }

Tone: ${tone}

Generate the copy now.`;

  try {
    const response = await client.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    const rawText =
      response.content[0].type === "text" ? response.content[0].text : "";

    // Strip any accidental markdown fences before parsing
    const cleaned = rawText.replace(/```(?:json)?/g, "").trim();
    const parsed = JSON.parse(cleaned) as { en: string; ar: string };

    if (typeof parsed.en !== "string" || typeof parsed.ar !== "string") {
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
