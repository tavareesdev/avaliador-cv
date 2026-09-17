import pdfParse from "pdf-parse/lib/pdf-parse.js";
import mammoth from "mammoth";

/**
 * Extrai o texto de um currículo já em memória (PDF, DOCX ou TXT),
 * dado o buffer e o nome original do arquivo.
 */
export async function extractTextFromBuffer(
  buffer: Buffer,
  fileName: string
): Promise<string> {
  const name = fileName.toLowerCase();

  if (name.endsWith(".pdf")) {
    const data = await pdfParse(buffer);
    return data.text;
  }

  if (name.endsWith(".docx")) {
    const { value } = await mammoth.extractRawText({ buffer });
    return value;
  }

  // .txt ou fallback: tenta ler como texto puro
  return buffer.toString("utf-8");
}

/**
 * Extrai o texto de um currículo enviado (PDF, DOCX ou TXT).
 */
export async function extractText(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  return extractTextFromBuffer(buffer, file.name);
}

export function isDocxFile(fileName: string): boolean {
  return fileName.toLowerCase().endsWith(".docx");
}
