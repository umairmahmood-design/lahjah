import { NextRequest, NextResponse } from "next/server";
// pdf-parse is CJS — require() is the reliable interop path in Node.js API routes
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdf = require("pdf-parse") as (buf: Buffer) => Promise<{ text: string }>;

export async function POST(req: NextRequest) {
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data." }, { status: 400 });
  }

  const file = formData.get("file") as File | null;
  if (!file) {
    return NextResponse.json({ error: "No file provided." }, { status: 400 });
  }

  const type = file.type;
  const isPdf = type === "application/pdf" || file.name.endsWith(".pdf");
  const isTxt = type === "text/plain" || file.name.endsWith(".txt");

  if (!isPdf && !isTxt) {
    return NextResponse.json(
      { error: "Only PDF and plain text files are supported." },
      { status: 400 }
    );
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());

    let text: string;
    if (isPdf) {
      const result = await pdf(buffer);
      text = result.text.trim();
    } else {
      text = buffer.toString("utf-8").trim();
    }

    if (!text) {
      return NextResponse.json(
        { error: "No text could be extracted from the document." },
        { status: 422 }
      );
    }

    return NextResponse.json({ text });
  } catch (err) {
    console.error("[/api/extract-guidelines] Error:", err);
    return NextResponse.json(
      { error: "Failed to extract text from document." },
      { status: 500 }
    );
  }
}
