import { NextRequest, NextResponse } from "next/server";
import { applyDocxUnits, DocxUnit } from "@/lib/docxUnits";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("resume") as File | null;
    const unidadesRaw = formData.get("unidades_editadas") as string | null;

    if (!file) {
      return NextResponse.json(
        { error: "Arquivo .docx original não foi enviado." },
        { status: 400 }
      );
    }
    if (!unidadesRaw) {
      return NextResponse.json(
        { error: "Texto editado pela IA não foi enviado." },
        { status: 400 }
      );
    }

    let unidades: { id: string; texto: string }[];
    try {
      unidades = JSON.parse(unidadesRaw);
    } catch {
      return NextResponse.json(
        { error: "Não foi possível interpretar as unidades editadas." },
        { status: 400 }
      );
    }

    const edits: Record<string, string> = {};
    for (const u of unidades) {
      if (u && typeof u.id === "string" && typeof u.texto === "string") {
        edits[u.id] = u.texto;
      }
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const outputBuffer = await applyDocxUnits(buffer, edits);

    return new NextResponse(new Uint8Array(outputBuffer), {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": 'attachment; filename="curriculo_melhorado.docx"',
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Erro ao gerar o arquivo .docx." },
      { status: 500 }
    );
  }
}

export type { DocxUnit };
