"use client";

import { useState } from "react";

type AnaliseResultado = {
  ats: {
    score: number;
    resumo: string;
    palavras_chave_encontradas: string[];
    palavras_chave_faltando: string[];
    problemas_formatacao: string[];
  };
  recrutador: {
    primeira_impressao: string;
    pontos_fortes: string[];
    pontos_fracos: string[];
    sugestoes_melhoria: string[];
  };
  adaptacao_vaga: {
    compatibilidade_percentual: number;
    principais_ajustes: string[];
    frases_sugeridas: string[];
  } | null;
  curriculo_editado?: {
    nome: string;
    contato: string;
    resumo_profissional: string;
    experiencias: {
      cargo: string;
      empresa: string;
      periodo: string;
      descricao: string[];
    }[];
    educacao: { curso: string; instituicao: string; periodo: string }[];
    habilidades: string[];
    idiomas?: string[];
    certificacoes?: string[];
    outras_secoes?: { titulo: string; itens: string[] }[];
  };
  /**
   * "docx_preservado": o arquivo original era .docx e o texto foi reescrito
   * mantendo o layout original intacto (unidades_editadas).
   * "texto_reconstruido": o currículo foi remontado do zero a partir do
   * schema fixo (curriculo_editado) — usado para PDF/TXT, onde não dá para
   * preservar o layout original.
   */
  modo?: "docx_preservado" | "texto_reconstruido";
  unidades_editadas?: { id: string; texto: string }[];
};

function scoreClass(score: number) {
  if (score >= 75) return "score-good";
  if (score >= 50) return "score-mid";
  return "score-bad";
}

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [jobDescription, setJobDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<AnaliseResultado | null>(null);
  const [baixando, setBaixando] = useState(false);

  async function handleDownloadDocx() {
    if (!resultado) return;
    setBaixando(true);
    setError(null);
    try {
      let res: Response;

      if (resultado.modo === "docx_preservado" && resultado.unidades_editadas) {
        // Preserva o layout original: reenviamos o arquivo .docx original
        // junto com o texto reescrito, e o backend só troca o texto.
        if (!file) {
          setError(
            "O arquivo original não está mais disponível nesta sessão. Envie o currículo novamente para baixar com o layout preservado."
          );
          return;
        }
        const formData = new FormData();
        formData.append("resume", file);
        formData.append(
          "unidades_editadas",
          JSON.stringify(resultado.unidades_editadas)
        );
        res = await fetch("/api/download-docx-preservado", {
          method: "POST",
          body: formData,
        });
      } else if (resultado.curriculo_editado) {
        res = await fetch("/api/download-docx", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(resultado.curriculo_editado),
        });
      } else {
        setError("Não há currículo editado para baixar.");
        return;
      }

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error || "Erro ao gerar o arquivo .docx.");
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "curriculo_melhorado.docx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err.message || "Erro inesperado ao baixar o arquivo.");
    } finally {
      setBaixando(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setError("Selecione um arquivo de currículo (PDF ou DOCX).");
      return;
    }

    setLoading(true);
    setError(null);
    setResultado(null);

    try {
      const formData = new FormData();
      formData.append("resume", file);
      formData.append("jobDescription", jobDescription);

      const res = await fetch("/api/analyze", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Erro ao analisar o currículo.");
        return;
      }

      setResultado(data);
    } catch (err: any) {
      setError(err.message || "Erro inesperado.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container">
      <div className="header">
        <h1>📄 Avaliador de Currículo com IA</h1>
        <p>
          Simula um ATS e um recrutador para te dar feedback real — e adapta
          seu currículo a uma vaga específica.
        </p>
      </div>

      <form className="card" onSubmit={handleSubmit}>
        <label htmlFor="resume">Seu currículo (PDF ou DOCX)</label>
        <input
          id="resume"
          type="file"
          accept=".pdf,.docx,.txt"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
        />

        <label htmlFor="job">Descrição da vaga (opcional)</label>
        <div className="hint">
          Cole aqui o texto da vaga para uma análise focada em compatibilidade
          e palavras-chave. Deixe em branco para uma avaliação geral.
        </div>
        <textarea
          id="job"
          placeholder="Cole aqui a descrição da vaga..."
          value={jobDescription}
          onChange={(e) => setJobDescription(e.target.value)}
        />

        <button type="submit" disabled={loading}>
          {loading ? "Analisando..." : "Analisar currículo"}
        </button>
      </form>

      {error && <div className="error-box">{error}</div>}

      {loading && (
        <div className="loading card">
          Lendo seu currículo e consultando a IA... isso pode levar alguns
          segundos.
        </div>
      )}

      {resultado && (
        <>
          {(resultado.curriculo_editado || resultado.unidades_editadas) && (
            <div className="card">
              <div className="section-title">✨ Currículo melhorado</div>
              <p>
                A IA já reescreveu o texto do seu currículo aplicando as
                sugestões abaixo (sem inventar experiências novas).{" "}
                {resultado.modo === "docx_preservado"
                  ? "O layout original do seu arquivo .docx é mantido — só o texto muda."
                  : "O arquivo é remontado em um layout padrão de Word."}{" "}
                Baixe e revise antes de enviar.
              </p>
              <button onClick={handleDownloadDocx} disabled={baixando}>
                {baixando ? "Gerando arquivo..." : "⬇️ Baixar currículo melhorado (.docx)"}
              </button>
            </div>
          )}

          <div className="card">
            <div className="section-title">🤖 Visão do ATS</div>
            <div className={`score ${scoreClass(resultado.ats.score)}`}>
              {resultado.ats.score}/100
            </div>
            <p>{resultado.ats.resumo}</p>

            {resultado.ats.palavras_chave_encontradas.length > 0 && (
              <>
                <p>
                  <strong>Palavras-chave encontradas:</strong>
                </p>
                <div className="tag-list">
                  {resultado.ats.palavras_chave_encontradas.map((p, i) => (
                    <span className="tag tag-found" key={i}>
                      {p}
                    </span>
                  ))}
                </div>
              </>
            )}

            {resultado.ats.palavras_chave_faltando.length > 0 && (
              <>
                <p>
                  <strong>Palavras-chave faltando:</strong>
                </p>
                <div className="tag-list">
                  {resultado.ats.palavras_chave_faltando.map((p, i) => (
                    <span className="tag tag-missing" key={i}>
                      {p}
                    </span>
                  ))}
                </div>
              </>
            )}

            {resultado.ats.problemas_formatacao.length > 0 && (
              <>
                <p>
                  <strong>Problemas de formatação para ATS:</strong>
                </p>
                <ul>
                  {resultado.ats.problemas_formatacao.map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ul>
              </>
            )}
          </div>

          <div className="card">
            <div className="section-title">🧑‍💼 Visão do recrutador</div>
            <p>{resultado.recrutador.primeira_impressao}</p>

            <div className="two-col">
              <div>
                <p>
                  <strong>Pontos fortes</strong>
                </p>
                <ul>
                  {resultado.recrutador.pontos_fortes.map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ul>
              </div>
              <div>
                <p>
                  <strong>Pontos fracos</strong>
                </p>
                <ul>
                  {resultado.recrutador.pontos_fracos.map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ul>
              </div>
            </div>

            <p style={{ marginTop: 16 }}>
              <strong>Sugestões de melhoria</strong>
            </p>
            <ul>
              {resultado.recrutador.sugestoes_melhoria.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          </div>

          {resultado.adaptacao_vaga && (
            <div className="card">
              <div className="section-title">🎯 Adaptação à vaga</div>
              <div
                className={`score ${scoreClass(
                  resultado.adaptacao_vaga.compatibilidade_percentual
                )}`}
              >
                {resultado.adaptacao_vaga.compatibilidade_percentual}%
                compatível
              </div>

              <p>
                <strong>Principais ajustes recomendados</strong>
              </p>
              <ul>
                {resultado.adaptacao_vaga.principais_ajustes.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>

              <p style={{ marginTop: 16 }}>
                <strong>Frases sugeridas para o currículo</strong>
              </p>
              <ul>
                {resultado.adaptacao_vaga.frases_sugeridas.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
