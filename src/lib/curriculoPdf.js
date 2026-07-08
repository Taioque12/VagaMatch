// Réplica em jsPDF (client-side) do layout gerado por worker/pdf.js (pdfkit),
// para o usuário poder baixar do site o mesmo currículo que o bot manda no Telegram.

const MARGEM = 50;
const LARGURA_UTIL_PT = 595.28 - MARGEM * 2; // A4 em pt

function novaPagina(doc, y) {
  const alturaPagina = doc.internal.pageSize.getHeight();
  if (y > alturaPagina - MARGEM) {
    doc.addPage();
    return MARGEM;
  }
  return y;
}

function secao(doc, y, titulo) {
  y += 10;
  y = novaPagina(doc, y);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(26, 26, 26);
  doc.text(titulo, MARGEM, y);
  y += 4;
  doc.setDrawColor(204, 204, 204);
  doc.line(MARGEM, y, MARGEM + LARGURA_UTIL_PT, y);
  y += 14;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(26, 26, 26);
  return y;
}

function paragrafo(doc, y, texto) {
  const linhas = doc.splitTextToSize(texto || "", LARGURA_UTIL_PT);
  linhas.forEach((linha) => {
    y = novaPagina(doc, y);
    doc.text(linha, MARGEM, y);
    y += 13;
  });
  return y;
}

function bullet(doc, y, texto) {
  const linhas = doc.splitTextToSize(`•  ${texto}`, LARGURA_UTIL_PT - 10);
  linhas.forEach((linha, i) => {
    y = novaPagina(doc, y);
    doc.text(linha, MARGEM + (i === 0 ? 0 : 10), y);
    y += 13;
  });
  return y;
}

export async function gerarCurriculoPdf(cv, perfil) {
  try {
    console.log("[PDF] Iniciando geração com dados:", { cv, perfil });

    const { jsPDF } = await import("jspdf");
    console.log("[PDF] jsPDF importado");

    const doc = new jsPDF({ unit: "pt", format: "a4" });
    console.log("[PDF] Documento PDF criado");

    let y = MARGEM;

    const subtitulo = [perfil.localizacao, perfil.email].filter(Boolean).join(" · ");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.setTextColor(0, 0, 0);
    doc.text(perfil.nomeCompleto || "Nome não informado", MARGEM + LARGURA_UTIL_PT / 2, y, { align: "center" });
    y += 20;
    console.log("[PDF] Nome adicionado");

    if (subtitulo) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(85, 85, 85);
      doc.text(subtitulo, MARGEM + LARGURA_UTIL_PT / 2, y, { align: "center" });
      y += 16;
    }
    doc.setTextColor(26, 26, 26);

    if (cv.resumo_profissional) {
      y = secao(doc, y, "Resumo Profissional");
      y = paragrafo(doc, y, cv.resumo_profissional);
      console.log("[PDF] Resumo adicionado");
    }

    if (cv.habilidades?.length) {
      y = secao(doc, y, "Habilidades Técnicas");
      y = paragrafo(doc, y, cv.habilidades.join(" · "));
      console.log("[PDF] Habilidades adicionadas");
    }

    if (cv.experiencias?.length) {
      y = secao(doc, y, "Experiência Profissional");
      for (const exp of cv.experiencias) {
        y = novaPagina(doc, y);
        doc.setFont("helvetica", "bold");
        doc.text(`${exp.cargo} | ${exp.empresa} | ${exp.periodo}`, MARGEM, y);
        y += 13;
        doc.setFont("helvetica", "normal");
        for (const b of exp.bullets || []) y = bullet(doc, y, b);
        y += 4;
      }
      console.log(`[PDF] ${cv.experiencias.length} experiência(s) adicionada(s)`);
    }

    if (cv.formacao?.length) {
      y = secao(doc, y, "Formação Acadêmica");
      for (const f of cv.formacao) y = bullet(doc, y, f);
      console.log(`[PDF] ${cv.formacao.length} formação(ões) adicionada(s)`);
    }

    if (cv.cursos?.length) {
      y = secao(doc, y, "Cursos Complementares");
      for (const c of cv.cursos) y = bullet(doc, y, c);
      console.log(`[PDF] ${cv.cursos.length} curso(s) adicionado(s)`);
    }

    if (cv.projetos?.length) {
      y = secao(doc, y, "Projetos");
      for (const pr of cv.projetos) y = bullet(doc, y, pr);
      console.log(`[PDF] ${cv.projetos.length} projeto(s) adicionado(s)`);
    }

    const fileName = `curriculo-${(perfil.nomeCompleto || "vagamatch").replace(/\s+/g, "_")}.pdf`;
    console.log("[PDF] Chamando doc.save com arquivo:", fileName);
    doc.save(fileName);
    console.log("[PDF] PDF salvo com sucesso");
  } catch (error) {
    console.error("[PDF] Erro ao gerar PDF:", error);
    throw new Error(`Erro ao gerar PDF: ${error.message}`);
  }
}
