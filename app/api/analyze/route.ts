import { NextRequest, NextResponse } from "next/server";
import { extractTextFromBuffer, isDocxFile } from "@/lib/parseFile";
import { buildPrompt, buildPromptDocxUnits } from "@/lib/prompts";
import { extractDocxUnits } from "@/lib/docxUnits";

export const runtime = "nodejs";

/**
 * Cadeia de modelos a tentar, do preferido para os fallbacks.
 * Se o primeiro estiver sobrecarregado (503) ou com cota estourada (429),
 * tentamos os próximos antes de desistir — modelos diferentes usam pools
 * de capacidade diferentes no Google, então isso reduz bastante a chance
 * de falhar quando um modelo específico está sob alta demanda.
 */
const MODEL_CHAIN = ["gemini-3.6-flash", "gemini-3.5-flash", "gemini-3.1-flash-lite"];

const RETRIES_PER_MODEL = 3;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

type GeminiCallResult = {
  ok: boolean;
  data?: any;
  modelUsed?: string;
  /** true quando esgotamos todos os modelos e todas as tentativas por causa de 503/429 */
  overloaded?: boolean;
  status?: number;
  errText?: string;
};

/**
 * Chama a API do Gemini com retry (backoff exponencial + jitter) e, se um
 * modelo continuar retornando erro transitório (503 sobrecarregado / 429
 * cota excedida) mesmo após todas as tentativas, passa para o próximo
 * modelo da cadeia antes de desistir de vez.
 * Erros não-transitórios (400/401/404 etc.) não são re-tentados, pois
 * indicam um problema de configuração e tentar de novo não resolve.
 */
async function callGeminiWithRetries(
  prompt: string,
  apiKey: string
): Promise<GeminiCallResult> {
  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.4,
      responseMimeType: "application/json",
    },
  });

  let lastTransientStatus = 0;
  let lastTransientBody = "";

  for (const model of MODEL_CHAIN) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    for (let attempt = 0; attempt < RETRIES_PER_MODEL; attempt++) {
      let res: Response;
      try {
        res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
        });
      } catch (networkErr: any) {
        // Falha de rede/DNS pontual: também vale a pena tentar de novo.
        lastTransientStatus = 0;
        lastTransientBody = networkErr?.message || "Falha de rede ao chamar a IA.";
        console.error(
          `[analyze] Falha de rede chamando ${model} (tentativa ${attempt + 1}):`,
          lastTransientBody
        );
        if (attempt < RETRIES_PER_MODEL - 1) {
          await sleep(1000 * 2 ** attempt + Math.random() * 300);
        }
        continue;
      }

      if (res.ok) {
        const data = await res.json();
        return { ok: true, data, modelUsed: model };
      }

      const transient = res.status === 503 || res.status === 429;

      if (!transient) {
        // Erro que não é de sobrecarga/cota (ex: chave inválida, modelo
        // desconhecido, payload malformado): tentar de novo não ajuda.
        const errText = await res.text();
        console.error(
          `[analyze] Erro não-transitório do Gemini (${model}, status ${res.status}):`,
          errText
        );
        return { ok: false, status: res.status, errText, modelUsed: model };
      }

      lastTransientStatus = res.status;
      lastTransientBody = await res.text();
      console.error(
        `[analyze] Gemini ${model} sobrecarregado/cota (status ${res.status}), tentativa ${
          attempt + 1
        }/${RETRIES_PER_MODEL}:`,
        lastTransientBody
      );

      if (attempt < RETRIES_PER_MODEL - 1) {
        const delayMs = 1000 * 2 ** attempt + Math.random() * 300; // 1s, 2s, 4s (+jitter)
        await sleep(delayMs);
      }
    }
    // Esgotou as tentativas nesse modelo por erro transitório: tenta o próximo da cadeia.
  }

  return {
    ok: false,
    overloaded: true,
    status: lastTransientStatus,
    errText: lastTransientBody,
  };
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

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const docx = isDocxFile(file.name);

    const resumeText = await extractTextFromBuffer(buffer, file.name);

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

    // Se o arquivo original é .docx, tentamos extrair as unidades editáveis
    // para poder devolver um arquivo final com o MESMO layout do original.
    // Se algo der errado nessa extração (docx malformado, etc.), caímos de
    // volta no modo antigo (reconstrói do zero) em vez de quebrar o pedido.
    let docxUnits: Awaited<ReturnType<typeof extractDocxUnits>> = [];
    let modo: "docx_preservado" | "texto_reconstruido" = "texto_reconstruido";

    if (docx) {
      try {
        docxUnits = await extractDocxUnits(buffer);
        if (docxUnits.length > 0) {
          modo = "docx_preservado";
        }
      } catch (err) {
        console.error("[analyze] Falha ao extrair unidades do .docx, usando modo reconstruído:", err);
      }
    }

    const prompt =
      modo === "docx_preservado"
        ? buildPromptDocxUnits(resumeText, jobDescription, docxUnits)
        : buildPrompt(resumeText, jobDescription);

    const result = await callGeminiWithRetries(prompt, apiKey);

    if (!result.ok) {
      if (result.overloaded) {
        return NextResponse.json(
          {
            error:
              "O modelo de IA está sobrecarregado no momento. Já tentamos automaticamente com múltiplas tentativas e mais de um modelo, mas nenhum respondeu. Aguarde um pouco e tente novamente — isso costuma se resolver em poucos minutos.",
          },
          { status: 503 }
        );
      }

      if (result.status === 429) {
        return NextResponse.json(
          {
            error:
              "A cota gratuita da API de IA foi atingida no momento (limite de requisições por minuto/dia). Aguarde um pouco antes de tentar de novo, ou considere aumentar a cota no Google AI Studio.",
          },
          { status: 429 }
        );
      }

      return NextResponse.json(
        { error: `Erro ao chamar a API do Gemini: ${result.errText || "erro desconhecido"}` },
        { status: 502 }
      );
    }

    const rawText: string | undefined =
      result.data?.candidates?.[0]?.content?.parts?.[0]?.text;

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
          error: "Não foi possível interpretar a resposta da IA como JSON.",
          raw: rawText,
        },
        { status: 502 }
      );
    }

    return NextResponse.json({ ...parsed, modo });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Erro interno no servidor." },
      { status: 500 }
    );
  }
}
