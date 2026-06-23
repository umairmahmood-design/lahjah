import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const BASE_SYSTEM_PROMPT = `You are Lahjah, an AI copy assistant for HungerStation's product and design teams. You help designers and writers create clear, on-brand UI copy in English and Arabic. You understand HungerStation's tone: friendly, clear, and culturally relevant for MENA markets. When given a screenshot, describe what UI elements you see and suggest copy for them. Always provide suggestions in the language the user requests (EN or AR). For Arabic, use Gulf dialect that feels natural for a food delivery app.`;

async function buildSystemPrompt(): Promise<string> {
  try {
    const { adminDb } = await import("@/lib/firebase-admin");
    const snap = await adminDb.doc("settings/brandGuidelines").get();
    if (snap.exists) {
      const content = (snap.data()?.content as string | undefined)?.trim();
      if (content) {
        return `${BASE_SYSTEM_PROMPT}\n\nBRAND GUIDELINES (follow these for all copy suggestions):\n${content}`;
      }
    }
  } catch {
    // Non-fatal — proceed without guidelines
  }
  return BASE_SYSTEM_PROMPT;
}

interface MessageInput {
  role: "user" | "assistant";
  content: string;
  imageBase64?: string;
  mimeType?: string;
}

export async function POST(req: NextRequest) {
  let body: { messages: MessageInput[]; language: "en" | "ar" };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { messages, language } = body;
  if (!messages?.length) {
    return NextResponse.json({ error: "messages is required." }, { status: 400 });
  }

  const langInstruction = language === "ar" ? " [Respond in Arabic]" : " [Respond in English]";

  const anthropicMessages: Anthropic.MessageParam[] = messages.map((msg, i) => {
    const isLast = i === messages.length - 1;

    if (msg.role === "assistant") {
      return { role: "assistant" as const, content: msg.content };
    }

    // Last user message — append language instruction + optional image
    if (isLast && msg.imageBase64) {
      const base64Data = msg.imageBase64.replace(/^data:image\/\w+;base64,/, "");
      const mediaType = (msg.mimeType ?? "image/jpeg") as
        | "image/jpeg"
        | "image/png"
        | "image/gif"
        | "image/webp";
      return {
        role: "user" as const,
        content: [
          {
            type: "image" as const,
            source: { type: "base64" as const, media_type: mediaType, data: base64Data },
          },
          { type: "text" as const, text: msg.content + langInstruction },
        ],
      };
    }

    return {
      role: "user" as const,
      content: msg.content + (isLast ? langInstruction : ""),
    };
  });

  const systemPrompt = await buildSystemPrompt();

  try {
    const stream = await client.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      system: systemPrompt,
      messages: anthropicMessages,
    });

    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            if (
              chunk.type === "content_block_delta" &&
              chunk.delta.type === "text_delta"
            ) {
              controller.enqueue(encoder.encode(chunk.delta.text));
            }
          }
        } finally {
          controller.close();
        }
      },
    });

    return new Response(readable, {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[/api/chat] Error:", message);
    return NextResponse.json({ error: `Chat failed: ${message}` }, { status: 500 });
  }
}
