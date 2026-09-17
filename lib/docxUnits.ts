import JSZip from "jszip";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";

/**
 * Este módulo permite editar SOMENTE o texto de um .docx, mantendo intacto
 * tudo o que é visual: fontes, cores, tamanhos, espaçamento, marcadores,
 * tabelas, colunas, imagens etc.
 *
 * Como funciona:
 * - Cada parágrafo (<w:p>) do documento (incluindo os que estão dentro de
 *   tabelas) vira uma "unidade editável" com um id estável (p0, p1, p2...).
 * - Mandamos só o TEXTO dessas unidades para a IA reescrever.
 * - Na hora de remontar o arquivo, pegamos o .docx ORIGINAL (não recriamos
 *   do zero) e trocamos apenas o conteúdo de texto de cada parágrafo,
 *   mantendo toda a árvore XML original (estilos, propriedades de parágrafo,
 *   numeração, tabelas etc.) exatamente como estava.
 */

export type DocxUnit = {
  id: string;
  text: string;
};

const DOCUMENT_XML_PATH = "word/document.xml";

function parseXml(xml: string) {
  return new DOMParser().parseFromString(xml, "text/xml");
}

function serializeXml(doc: Document) {
  return new XMLSerializer().serializeToString(doc);
}

/**
 * Retorna, em ordem de documento, todos os parágrafos (<w:p>) do corpo,
 * incluindo os que estão dentro de tabelas. Ignora headers/footers
 * (são partes XML separadas e não são tocados, então mantêm o texto original).
 */
function getParagraphNodes(doc: Document): Element[] {
  const nodeList = doc.getElementsByTagName("w:p");
  const result: Element[] = [];
  for (let i = 0; i < nodeList.length; i++) {
    result.push(nodeList[i] as unknown as Element);
  }
  return result;
}

/** Concatena o texto de todos os <w:t> dentro de um parágrafo. */
function getParagraphText(p: Element): string {
  const tNodes = p.getElementsByTagName("w:t");
  let text = "";
  for (let i = 0; i < tNodes.length; i++) {
    text += tNodes[i].textContent || "";
  }
  return text;
}

/**
 * Extrai as unidades editáveis de um .docx. Ignora parágrafos vazios ou
 * puramente decorativos (sem nenhum texto), já que não há nada a melhorar
 * neles e preservá-los intactos é o comportamento correto.
 */
export async function extractDocxUnits(buffer: Buffer): Promise<DocxUnit[]> {
  const zip = await JSZip.loadAsync(new Uint8Array(buffer));
  const documentXmlFile = zip.file(DOCUMENT_XML_PATH);
  if (!documentXmlFile) {
    throw new Error("Arquivo .docx inválido: word/document.xml não encontrado.");
  }
  const xml = await documentXmlFile.async("string");
  const doc = parseXml(xml);
  const paragraphs = getParagraphNodes(doc);

  const units: DocxUnit[] = [];
  paragraphs.forEach((p, index) => {
    const text = getParagraphText(p).trim();
    if (text.length === 0) return;
    units.push({ id: `p${index}`, text });
  });

  return units;
}

/**
 * Aplica um mapa { id -> novo texto } de volta no .docx original.
 *
 * Regra de preservação visual: se o parágrafo tiver um único "run" de texto
 * (<w:r><w:t>), o novo texto substitui esse run e herda 100% da formatação
 * dele (negrito, cor, fonte, tamanho etc. — sem qualquer perda).
 * Se o parágrafo tiver múltiplos runs com formatações diferentes (ex:
 * "Cargo" em negrito seguido de " — Empresa" normal), o novo texto é
 * colocado no primeiro run (herdando a formatação dele) e os runs
 * seguintes são esvaziados — o parágrafo continua com a mesma fonte,
 * tamanho, cor, marcador, recuo e espaçamento, só pode perder uma
 * variação de estilo NO MEIO da própria linha.
 * Parágrafos sem texto, headers, footers, imagens e qualquer outra parte
 * do arquivo não são tocados.
 */
export async function applyDocxUnits(
  buffer: Buffer,
  edits: Record<string, string>
): Promise<Buffer> {
  const zip = await JSZip.loadAsync(new Uint8Array(buffer));
  const documentXmlFile = zip.file(DOCUMENT_XML_PATH);
  if (!documentXmlFile) {
    throw new Error("Arquivo .docx inválido: word/document.xml não encontrado.");
  }
  const xml = await documentXmlFile.async("string");
  const doc = parseXml(xml);
  const paragraphs = getParagraphNodes(doc);

  paragraphs.forEach((p, index) => {
    const id = `p${index}`;
    const newText = edits[id];
    if (newText === undefined) return; // unidade sem texto original / sem edição: não mexe

    const tNodes = p.getElementsByTagName("w:t");
    if (tNodes.length === 0) return;

    // Primeiro <w:t> com texto recebe o conteúdo novo inteiro.
    tNodes[0].textContent = newText;
    // Garante que o Word não colapse espaços nas bordas do texto.
    (tNodes[0] as unknown as Element).setAttribute("xml:space", "preserve");

    // Demais runs de texto do mesmo parágrafo são esvaziados (mantêm a
    // formatação do run, só ficam sem conteúdo) para não duplicar texto.
    for (let i = 1; i < tNodes.length; i++) {
      tNodes[i].textContent = "";
    }
  });

  const newXml = serializeXml(doc);
  zip.file(DOCUMENT_XML_PATH, newXml);

  const outBuffer = await zip.generateAsync({ type: "nodebuffer" });
  return outBuffer;
}
