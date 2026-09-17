import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
} from "docx";

export type CurriculoEditado = {
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

function heading(text: string) {
  return new Paragraph({
    text,
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 260, after: 120 },
  });
}

export async function generateDocx(data: CurriculoEditado): Promise<Buffer> {
  const children: Paragraph[] = [];

  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
      children: [
        new TextRun({ text: data.nome || "Nome não identificado", bold: true, size: 32 }),
      ],
    })
  );

  if (data.contato) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
        children: [new TextRun({ text: data.contato, size: 20, color: "555555" })],
      })
    );
  }

  if (data.resumo_profissional) {
    children.push(heading("Resumo Profissional"));
    children.push(new Paragraph({ text: data.resumo_profissional }));
  }

  if (data.experiencias?.length) {
    children.push(heading("Experiência Profissional"));
    for (const exp of data.experiencias) {
      children.push(
        new Paragraph({
          spacing: { before: 160 },
          children: [
            new TextRun({ text: exp.cargo, bold: true }),
            new TextRun({ text: exp.empresa ? `  —  ${exp.empresa}` : "" }),
          ],
        })
      );
      if (exp.periodo) {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: exp.periodo, italics: true, size: 20, color: "666666" })],
          })
        );
      }
      for (const bullet of exp.descricao || []) {
        children.push(
          new Paragraph({
            text: bullet,
            bullet: { level: 0 },
          })
        );
      }
    }
  }

  if (data.educacao?.length) {
    children.push(heading("Formação Acadêmica"));
    for (const edu of data.educacao) {
      children.push(
        new Paragraph({
          spacing: { before: 100 },
          children: [
            new TextRun({ text: edu.curso, bold: true }),
            new TextRun({ text: edu.instituicao ? `  —  ${edu.instituicao}` : "" }),
          ],
        })
      );
      if (edu.periodo) {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: edu.periodo, italics: true, size: 20, color: "666666" })],
          })
        );
      }
    }
  }

  if (data.habilidades?.length) {
    children.push(heading("Habilidades"));
    children.push(new Paragraph({ text: data.habilidades.join(" • ") }));
  }

  if (data.idiomas?.length) {
    children.push(heading("Idiomas"));
    children.push(new Paragraph({ text: data.idiomas.join(" • ") }));
  }

  if (data.certificacoes?.length) {
    children.push(heading("Certificações"));
    children.push(new Paragraph({ text: data.certificacoes.join(" • ") }));
  }

  // Qualquer seção do currículo original que não se encaixe nos campos fixos
  // acima (Projetos, Publicações, Voluntariado, Cursos, Objetivo etc.) entra
  // aqui, para nada ser perdido na conversão.
  for (const secao of data.outras_secoes || []) {
    if (!secao?.titulo || !secao.itens?.length) continue;
    children.push(heading(secao.titulo));
    for (const item of secao.itens) {
      children.push(new Paragraph({ text: item, bullet: { level: 0 } }));
    }
  }

  const doc = new Document({
    sections: [{ children }],
  });

  return Packer.toBuffer(doc);
}
