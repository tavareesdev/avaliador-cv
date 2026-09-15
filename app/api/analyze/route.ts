import { NextRequest, NextResponse } from "next/server";
import { extractText } from "@/lib/parseFile";
import { buildPrompt } from "@/lib/prompts";

export const runtime = "nodejs";

// Modelo gratuito do Gemini (verifique modelos disponíveis em aistudio.google.com)
const GEMINI_MODEL = "gemini-3.6-flash";

/**
 * Chama a API do Gemini com retry automático (backoff exponencial) quando
 * o servidor responde 503 (sobrecarregado). Erros como chave inválida (400/401)
 * ou modelo inexistente (404) não são re-tentados, pois tentar de novo não resolve.
 */
async function fetchWithRetry(
  url: string,
  body: string,
  maxRetries = 3
): Promise<Response> {
  let lastRes: Response | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });

    if (res.ok || res.status !== 503) {
      return res;
    }

    lastRes = res;

    // Não espera depois da última tentativa
    if (attempt < maxRetries - 1) {
      const delayMs = 1000 * 2 ** attempt; // 1s, 2s, 4s
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  // Esgotou as tentativas, devolve a última resposta (503) recebida
  return lastRes as Response;
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("resume") as File | null;
    const jobDescription = (formData.get("jobDescription") as string) || "";

    if (!file) {
      return NextResponse.json(
        { error: "Nenhum arquivo de currículo foi enviado." },
        { status: 400 }
      );
    }

    const resumeText = await extractText(file);

    if (!resumeText || resumeText.trim().length < 30) {
      return NextResponse.json(
        {
          error:
            "Não foi possível extrair texto suficiente do arquivo. Tente um PDF com texto selecionável ou um DOCX.",
        },
        { status: 400 }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "GEMINI_API_KEY não configurada no servidor." },
        { status: 500 }
      );
    }

    const prompt = buildPrompt(resumeText, jobDescription);

    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
    const geminiBody = JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.4,
        responseMimeType: "application/json",
      },
    });

    const geminiRes = await fetchWithRetry(geminiUrl, geminiBody);

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();

      // 503 = modelo do Gemini sobrecarregado no momento (erro temporário do Google,
      // não do nosso código). Damos uma mensagem mais amigável pro usuário.
      if (geminiRes.status === 503) {
        return NextResponse.json(
          {
            error:
              "O modelo de IA está sobrecarregado no momento. Tentamos algumas vezes automaticamente, mas ainda assim não deu certo. Aguarde alguns segundos e tente novamente.",
          },
          { status: 503 }
        );
      }

      return NextResponse.json(
        { error: `Erro ao chamar a API do Gemini: ${errText}` },
        { status: 502 }
      );
    }

    const geminiData = await geminiRes.json();
    const rawText: string | undefined =
      geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!rawText) {
      return NextResponse.json(
        { error: "A IA retornou uma resposta vazia. Tente novamente." },
        { status: 502 }
      );
    }

    let parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch {
      return NextResponse.json(
        {
          error:
            "Não foi possível interpretar a resposta da IA como JSON.",
          raw: rawText,
        },
        { status: 502 }
      );
    }

    return NextResponse.json(parsed);
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Erro interno no servidor." },
      { status: 500 }
    );
  }
}