// Teste simples do jsPDF
async function testarPDF() {
  try {
    const { jsPDF } = await import("jspdf");
    console.log("jsPDF carregado:", jsPDF);

    const doc = new jsPDF({ unit: "pt", format: "a4" });
    console.log("PDF criado:", doc);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("Teste de PDF", 50, 50);

    console.log("Texto adicionado");

    // Tenta salvar
    doc.save("teste.pdf");
    console.log("PDF salvo com sucesso");

    return true;
  } catch (error) {
    console.error("Erro ao testar PDF:", error);
    throw error;
  }
}

testarPDF().then(() => console.log("Teste concluído")).catch(e => console.error("Teste falhou:", e));
