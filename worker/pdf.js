import PDFDocument from "pdfkit";
import { createWriteStream } from "fs";

function secao(doc, titulo) {
  doc.moveDown(0.6);
  doc.fontSize(13).fillColor("#1a1a1a").font("Helvetica-Bold").text(titulo);
  doc.moveTo(doc.x, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).strokeColor("#cccccc").stroke();
  doc.moveDown(0.3);
  doc.font("Helvetica").fillColor("#1a1a1a").fontSize(10);
}

function bullet(doc, texto) {
  doc.text(`•  ${texto}`, { indent: 10 });
}

export function gerarPdf(cv, perfil, caminho) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const stream = createWriteStream(caminho);
    doc.pipe(stream);

    const subtitulo = [perfil.localizacao, perfil.email].filter(Boolean).join(" · ");

    doc.fontSize(20).font("Helvetica-Bold").text(perfil.nomeCompleto, { align: "center" });
    doc.fontSize(10).font("Helvetica").fillColor("#555555").text(subtitulo, { align: "center" });
    doc.fillColor("#1a1a1a");

    secao(doc, "Resumo Profissional");
    doc.text(cv.resumo_profissional, { align: "justify" });

    secao(doc, "Habilidades Técnicas");
    doc.text(cv.habilidades.join(" · "));

    secao(doc, "Experiência Profissional");
    for (const exp of cv.experiencias) {
      doc.font("Helvetica-Bold").text(`${exp.cargo} | ${exp.empresa} | ${exp.periodo}`);
      doc.font("Helvetica");
      for (const b of exp.bullets) bullet(doc, b);
      doc.moveDown(0.3);
    }

    secao(doc, "Formação Acadêmica");
    for (const f of cv.formacao) bullet(doc, f);

    secao(doc, "Cursos Complementares");
    for (const c of cv.cursos) bullet(doc, c);

    if (cv.projetos?.length) {
      secao(doc, "Projetos");
      for (const pr of cv.projetos) bullet(doc, pr);
    }

    doc.end();
    stream.on("finish", () => resolve(caminho));
    stream.on("error", reject);
  });
}
