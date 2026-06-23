import { NextRequest, NextResponse } from "next/server";

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

  const isPdf =
    file.type === "application/pdf" || file.name.endsWith(".pdf");
  const isDocx =
    file.type ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    file.name.endsWith(".docx");
  const isTxt = file.type === "text/plain" || file.name.endsWith(".txt");

  if (!isPdf && !isDocx && !isTxt) {
    return NextResponse.json(
      { error: "Only PDF, DOCX, and plain text files are supported." },
      { status: 400 }
    );
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    let text: string;

    if (isPdf) {
      // Lazy-load inside handler: pdf-parse uses fs internally and must
      // not be bundled by webpack (see serverExternalPackages in next.config.mjs)
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require("pdf-parse") as (
        buf: Buffer
      ) => Promise<{ text: string }>;
      console.log("[/api/extract-guidelines] Extracting PDF:", file.name, `${buffer.length} bytes`);
      const result = await pdfParse(buffer);
      text = result.text.trim();
      console.log("[/api/extract-guidelines] PDF extracted, chars:", text.length);
    } else if (isDocx) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mammoth = require("mammoth") as {
        extractRawText: (opts: { buffer: Buffer }) => Promise<{ value: string }>;
      };
      console.log("[/api/extract-guidelines] Extracting DOCX:", file.name, `${buffer.length} bytes`);
      const result = await mammoth.extractRawText({ buffer });
      text = result.value.trim();
      console.log("[/api/extract-guidelines] DOCX extracted, chars:", text.length);
    } else {
      console.log("[/api/extract-guidelines] Reading TXT:", file.name, `${buffer.length} bytes`);
      text = buffer.toString("utf-8").trim();
      console.log("[/api/extract-guidelines] TXT read, chars:", text.length);
    }

    if (!text) {
      return NextResponse.json(
        { error: "No text could be extracted from the document." },
        { status: 422 }
      );
    }

    return NextResponse.json({ text });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[/api/extract-guidelines] Extraction failed:", message, err);
    return NextResponse.json(
      { error: `Failed to extract text from document: ${message}` },
      { status: 500 }
    );
  }
}
