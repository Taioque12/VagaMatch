import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from "docx";
import { writeFileSync } from "fs";

const h = (texto) =>
  new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 240, after: 120 },
    children: [new TextRun({ text: texto, bold: true })],
  });

// TextRun não quebra "\n" sozinho — precisa de um run por linha com "break" entre eles.
// Necessário pro resumo_profissional (5 linhas) do currículo gerado pelo Gemini.
const p = (texto, opts = {}) => {
  const linhas = texto.split("\n");
  const children = linhas.flatMap((linha, i) => {
    const run = new TextRun({ text: linha, bold: opts.bold ?? false, break: i > 0 ? 1 : 0 });
    return [run];
  });
  return new Paragraph({
    spacing: { after: 80 },
    bullet: opts.bullet ? { level: 0 } : undefined,
    children,
  });
};

export async function gerarDocx(cv, perfil, caminho) {
  const subtitulo = [perfil.localizacao, perfil.email].filter(Boolean).join(" · ");

  const children = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: perfil.nomeCompleto, bold: true, size: 32 })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [new TextRun({ text: subtitulo, size: 20 })],
    }),
    h("Resumo Profissional"),
    p(cv.resumo_profissional),
    h("Habilidades Técnicas"),
    p(cv.habilidades.join(" · ")),
    h("Experiência Profissional"),
  ];

  for (const exp of cv.experiencias) {
    children.push(p(`${exp.cargo} | ${exp.empresa} | ${exp.periodo}`, { bold: true }));
    for (const b of exp.bullets) children.push(p(b, { bullet: true }));
  }

  children.push(h("Formação Acadêmica"));
  for (const f of cv.formacao) children.push(p(f, { bullet: true }));

  children.push(h("Cursos Complementares"));
  for (const c of cv.cursos) children.push(p(c, { bullet: true }));

  if (cv.projetos?.length) {
    children.push(h("Projetos"));
    for (const pr of cv.projetos) children.push(p(pr, { bullet: true }));
  }

  const doc = new Document({ sections: [{ children }] });
  const buffer = await Packer.toBuffer(doc);
  writeFileSync(caminho, buffer);
  return caminho;
}
