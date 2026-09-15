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
          Simula um ATS e um recrutador para te dar feedback real, além de adaptar
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
