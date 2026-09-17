import { DocxUnit } from "./docxUnits";

/**
 * Bloco de avaliação (ATS + recrutador + adaptação à vaga), compartilhado
 * pelos dois modos de prompt (com ou sem preservação de layout).
 */
function buildAvaliacaoSchema(temVaga: boolean): string {
  return `{
  "ats": {
    "score": <número de 0 a 100>,
    "resumo": "<resumo curto de como um ATS real leria este currículo>",
    "palavras_chave_encontradas": ["..."],
    "palavras_chave_faltando": ["..."],
    "problemas_formatacao": ["..."]
  },
  "recrutador": {
    "primeira_impressao": "<parágrafo curto>",
    "pontos_fortes": ["..."],
    "pontos_fracos": ["..."],
    "sugestoes_melhoria": ["..."]
  },
  "adaptacao_vaga": ${
    temVaga
      ? `{
    "compatibilidade_percentual": <número de 0 a 100>,
    "principais_ajustes": ["..."],
    "frases_sugeridas": ["..."]
  }`
      : "null"
  }`;
}

function buildContextoVaga(temVaga: boolean, jobDescription: string): string {
  return temVaga
    ? `O candidato forneceu também a DESCRIÇÃO DA VAGA abaixo. Você deve comparar o currículo com essa vaga,
identificar palavras-chave e requisitos da vaga que aparecem ou não no currículo, e sugerir como
adaptar o currículo para aumentar as chances de passar no ATS e impressionar o recrutador PARA ESSA VAGA ESPECÍFICA.`
    : `O candidato NÃO forneceu uma vaga específica. Faça uma avaliação geral do currículo, sem comparação com vaga nenhuma.`;
}

const PERSONAS = `Você é um sistema que combina DUAS personas para avaliar currículos:

1) Um ATS (Applicant Tracking System) real, do tipo usado por empresas grandes:
   analisa o texto de forma literal, procura palavras-chave, cargos, habilidades técnicas,
   formatação problemática (tabelas, colunas, ícones, texto em imagem, falta de seções padrão),
   e calcula uma pontuação de compatibilidade.

2) Um recrutador humano sênior, especialista em RH e recrutamento no mercado brasileiro:
   avalia clareza, impacto das realizações, uso de verbos de ação, quantificação de resultados,
   organização visual, adequação ao cargo pretendido e first impression em ~7 segundos de leitura.`;

/**
 * Prompt usado quando o arquivo original é um .docx: preservamos o layout
 * original e pedimos à IA para reescrever SÓ O TEXTO de cada unidade
 * (parágrafo), uma a uma, sem mudar estrutura nenhuma.
 */
export function buildPromptDocxUnits(
  resumeText: string,
  jobDescription: string,
  units: DocxUnit[]
): string {
  const temVaga = Boolean(jobDescription && jobDescription.trim().length > 20);

  const unidadesJson = JSON.stringify(
    units.map((u) => ({ id: u.id, texto: u.text })),
    null,
    0
  );

  return `
${PERSONAS}

${buildContextoVaga(temVaga, jobDescription)}

Além da avaliação, você vai reescrever o TEXTO do currículo mantendo o layout original 100% intacto.
O currículo original foi dividido em "unidades" (uma por parágrafo/linha do arquivo .docx original,
na ordem em que aparecem). Cada unidade tem um "id" fixo que você NÃO pode mudar.

Responda SOMENTE em formato JSON válido, sem markdown, sem texto fora do JSON, seguindo exatamente este schema:

${buildAvaliacaoSchema(temVaga)},
  "unidades_editadas": [
    { "id": "<mesmo id da unidade original>", "texto": "<texto reescrito dessa unidade>" }
  ]
}

Regras importantes para "unidades_editadas":
- Devolva uma entrada para TODAS as unidades recebidas, com os MESMOS ids, na mesma ordem. Não pule, não junte, não crie ids novos.
- Cada unidade é só um trecho de texto (uma linha/parágrafo). NUNCA junte duas unidades numa só, nem quebre uma em várias.
- Se a unidade for um título de seção (ex: "Experiência Profissional", "Formação", "Habilidades"), um nome próprio, e-mail, telefone, link, data isolada ou algo que não deva mudar de conteúdo, devolva o texto praticamente igual (pode corrigir só erro de digitação óbvio).
- Se a unidade for um parágrafo/bullet descritivo (resumo profissional, experiência, formação, projeto etc.), melhore a redação: verbos de ação, clareza, remover redundância, incorporar palavra-chave da vaga quando fizer sentido genuíno.
- NUNCA invente fatos, empresas, cargos, períodos, números ou resultados que não estejam no texto original daquela unidade ou claramente no restante do currículo.
- Mantenha o mesmo idioma do texto original de cada unidade (português do Brasil, salvo se a unidade já estiver em outro idioma no original).
- Não inclua nenhum texto antes ou depois do JSON.

Regras importantes para a avaliação (ats, recrutador, adaptacao_vaga):
- Seja específico e prático, cite trechos ou seções do currículo quando fizer sentido.
- "palavras_chave_faltando" deve conter termos relevantes que faltam (do mercado em geral, ou da vaga se houver).

--- CURRÍCULO (texto extraído, só para contexto/avaliação) ---
${resumeText}
--- FIM DO CURRÍCULO ---

--- UNIDADES A REESCREVER (json) ---
${unidadesJson}
--- FIM DAS UNIDADES ---

${
  temVaga
    ? `--- DESCRIÇÃO DA VAGA ---\n${jobDescription}\n--- FIM DA VAGA ---`
    : ""
}
`.trim();
}

export function buildPrompt(resumeText: string, jobDescription: string): string {
  const temVaga = Boolean(jobDescription && jobDescription.trim().length > 20);

  return `
${PERSONAS}

${buildContextoVaga(temVaga, jobDescription)}

Responda SOMENTE em formato JSON válido, sem markdown, sem texto fora do JSON, seguindo exatamente este schema:

${buildAvaliacaoSchema(temVaga)},
  "curriculo_editado": {
    "nome": "<nome do candidato, extraído do currículo original>",
    "contato": "<linha única com telefone, e-mail, cidade, linkedin etc., como estiver no original>",
    "resumo_profissional": "<resumo profissional reescrito, 2-4 frases, com melhor impacto>",
    "experiencias": [
      {
        "cargo": "...",
        "empresa": "...",
        "periodo": "...",
        "descricao": ["<bullet reescrito com verbo de ação e, quando possível, número/resultado>", "..."]
      }
    ],
    "educacao": [
      { "curso": "...", "instituicao": "...", "periodo": "..." }
    ],
    "habilidades": ["..."],
    "idiomas": ["..."],
    "certificacoes": ["..."],
    "outras_secoes": [
      { "titulo": "<nome da seção como aparece no currículo original, ex: Projetos, Publicações, Voluntariado, Cursos>", "itens": ["..."] }
    ]
  }
}

Regras importantes:
- Seja específico e prático, cite trechos ou seções do currículo quando fizer sentido.
- "palavras_chave_faltando" deve conter termos relevantes que faltam (do mercado em geral, ou da vaga se houver).
- Nunca invente experiência, cargo, empresa, período ou resultado que não está no currículo original.
  Em "curriculo_editado" você pode MELHORAR a redação (verbos de ação, clareza, remover redundância,
  incorporar palavras-chave da vaga quando fizerem sentido genuíno) mas NUNCA inventar fatos, números
  ou experiências novas. Se um dado estiver ausente (ex: sem período), deixe string vazia "".
- Em "curriculo_editado.experiencias" e "educacao", preserve TODAS as experiências/formações que
  existirem no currículo original, apenas reescritas/melhoradas — não corte nenhuma.
- IMPORTANTE: se o currículo original tiver QUALQUER seção que não se encaixe em nome/contato/
  resumo_profissional/experiencias/educacao/habilidades/idiomas/certificacoes (ex: "Projetos",
  "Publicações", "Voluntariado", "Cursos extras", "Resumo de qualificações", "Objetivo" etc.),
  NÃO descarte esse conteúdo: coloque em "outras_secoes", um item por seção, preservando o
  título original da seção e todos os itens/linhas que ela continha (reescritos/melhorados,
  sem cortar nenhum). Se não houver seções extras, devolva "outras_secoes": [].
- Escreva tudo em português do Brasil.
- Não inclua nenhum texto antes ou depois do JSON.

--- CURRÍCULO (texto extraído) ---
${resumeText}
--- FIM DO CURRÍCULO ---

${
  temVaga
    ? `--- DESCRIÇÃO DA VAGA ---\n${jobDescription}\n--- FIM DA VAGA ---`
    : ""
}
`.trim();
}
