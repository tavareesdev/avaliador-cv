import { NextRequest, NextResponse } from "next/server";
import { generateDocx, CurriculoEditado } from "@/lib/generateDocx";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const data = (await req.json()) as CurriculoEditado;

    if (!data || !data.nome) {
      return NextResponse.json(
        { error: "Dados do currículo editado ausentes ou inválidos." },
        { status: 400 }
      );
    }

    const buffer = await generateDocx(data);

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="curriculo_melhorado.docx"`,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Erro ao gerar o arquivo .docx." },
      { status: 500 }
    );
  }
}
