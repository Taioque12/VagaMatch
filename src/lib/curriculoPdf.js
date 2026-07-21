// Gerador client-side (jsPDF) espelhado do gerarPdfBytes em
// supabase/functions/telegram-webhook/index.ts — mesmo layout, pra o usuário
// baixar do site o mesmo currículo que o bot manda no Telegram. Qualquer
// mudança de estrutura aqui deve ser replicada lá (e vice-versa).
//
// Layout pensado pra ATS (Applicant Tracking Systems): 1 coluna só, fonte
// padrão Helvetica (uma das 14 fontes-base do PDF, sempre embutida e sempre
// legível por parsers), texto real selecionável (não é imagem), sem
// tabelas/caixas/ícones que quebram a extração automática de texto, seções
// com títulos padrão do mercado (Resumo/Experiência/Formação/Habilidades).

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
    // Validações rigorosas
    if (!cv || typeof cv !== "object") {
      throw new Error("Dados do currículo não fornecidos ou inválidos");
    }
    if (!perfil || typeof perfil !== "object") {
      throw new Error("Dados do perfil não fornecidos ou inválidos");
    }
    if (!perfil.nomeCompleto || perfil.nomeCompleto.trim() === "") {
      throw new Error("Nome completo é obrigatório para gerar o PDF");
    }

    // Verifica se há pelo menos algum conteúdo
    const temConteudo =
      cv.resumo_profissional ||
      (Array.isArray(cv.habilidades) && cv.habilidades.length > 0) ||
      (Array.isArray(cv.experiencias) && cv.experiencias.length > 0) ||
      (Array.isArray(cv.formacao) && cv.formacao.length > 0) ||
      (Array.isArray(cv.cursos) && cv.cursos.length > 0) ||
      (Array.isArray(cv.projetos) && cv.projetos.length > 0);

    if (!temConteudo) {
      throw new Error("Nenhum dado de currículo para gerar o PDF. Preencha pelo menos um campo.");
    }

    const { jsPDF } = await import("jspdf");
    const doc = new jsPDF({ unit: "pt", format: "a4" });

    // Metadata do PDF — alguns ATS (Greenhouse, Workday, etc.) leem o
    // título/autor do documento além do texto, e reforça profissionalismo
    // ao abrir o arquivo (nome correto na aba do PDF, não "documento.pdf").
    doc.setProperties({
      title: `Currículo — ${perfil.nomeCompleto}`,
      subject: "Currículo",
      author: perfil.nomeCompleto,
      creator: "VagaMatch",
    });

    let y = MARGEM;

    const subtitulo = [perfil.localizacao, perfil.email].filter(Boolean).join(" · ");

    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.setTextColor(0, 0, 0);
    doc.text(perfil.nomeCompleto, MARGEM + LARGURA_UTIL_PT / 2, y, { align: "center" });
    y += 20;

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
    }

    if (cv.habilidades && Array.isArray(cv.habilidades) && cv.habilidades.length > 0) {
      y = secao(doc, y, "Habilidades Técnicas");
      const habilidadesValidas = cv.habilidades.filter(h => h && String(h).trim());
      if (habilidadesValidas.length > 0) {
        y = paragrafo(doc, y, habilidadesValidas.join(" · "));
      }
    }

    if (cv.experiencias && Array.isArray(cv.experiencias) && cv.experiencias.length > 0) {
      y = secao(doc, y, "Experiência Profissional");
      for (const exp of cv.experiencias) {
        if (!exp || typeof exp !== "object") continue;
        y = novaPagina(doc, y);
        doc.setFont("helvetica", "bold");
        doc.text(`${exp.cargo || ""} | ${exp.empresa || ""} | ${exp.periodo || ""}`, MARGEM, y);
        y += 13;
        doc.setFont("helvetica", "normal");
        if (exp.bullets && Array.isArray(exp.bullets)) {
          for (const b of exp.bullets) {
            if (b && String(b).trim()) y = bullet(doc, y, String(b));
          }
        }
        y += 4;
      }
    }

    if (cv.formacao && Array.isArray(cv.formacao) && cv.formacao.length > 0) {
      y = secao(doc, y, "Formação Acadêmica");
      for (const f of cv.formacao) {
        if (f && String(f).trim()) y = bullet(doc, y, String(f));
      }
    }

    if (cv.cursos && Array.isArray(cv.cursos) && cv.cursos.length > 0) {
      y = secao(doc, y, "Cursos Complementares");
      for (const c of cv.cursos) {
        if (c && String(c).trim()) y = bullet(doc, y, String(c));
      }
    }

    if (cv.projetos && Array.isArray(cv.projetos) && cv.projetos.length > 0) {
      y = secao(doc, y, "Projetos");
      for (const pr of cv.projetos) {
        if (pr && String(pr).trim()) y = bullet(doc, y, String(pr));
      }
    }

    const fileName = `curriculo-${perfil.nomeCompleto.replace(/\s+/g, "_")}.pdf`;

    // Gera blob e cria link de download
    const pdfBlob = doc.output("blob");
    const url = URL.createObjectURL(pdfBlob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (error) {
    throw new Error(`Erro ao gerar PDF: ${error.message}`);
  }
}
