import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "../lib/supabase.js";
import { useAuth } from "../lib/AuthContext.jsx";
import { gerarDocumentoIA } from "../lib/gemini.js";
import "../dashboard-premium-v2.css";

export function Gerador() {
  const { id } = useParams();
  const { session } = useAuth();
  
  const [vaga, setVaga] = useState(null);
  const [perfil, setPerfil] = useState(null);
  const [carregando, setCarregando] = useState(true);

  const [textoGerado, setTextoGerado] = useState("");
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState(null);
  const [baixouArquivo, setBaixouArquivo] = useState(null);

  useEffect(() => {
    if (!session) return;
    async function carregar() {
      const userId = session.user.id;
      
      const { data: vagaData, error: errVaga } = await supabase
        .from("vagas_vistas")
        .select("*")
        .eq("id", id)
        .maybeSingle();

      if (errVaga) throw errVaga;
      setVaga(vagaData);

      const [{ data: perfilData }, { data: curriculo }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
        supabase.from("curriculos").select("*").eq("user_id", userId).maybeSingle()
      ]);

      setPerfil({
        nome: perfilData?.nome_completo || "Nome não informado",
        area_atuacao: curriculo?.resumo_profissional || "",
        resumo: curriculo?.resumo_profissional || "",
        experiencia: (curriculo?.experiencias || []).map(e => `${e.cargo} na ${e.empresa} (${e.periodo}):\n${e.bullets?.join('\n')}`).join("\n\n"),
        skills: (curriculo?.habilidades || []).join(", ")
      });

      setCarregando(false);
    }
    
    carregar().catch(e => {
      setErro(e.message);
      setCarregando(false);
    });
  }, [id, session]);

  async function handleGerar(tipo) {
    setGerando(true);
    setErro(null);
    setTextoGerado("");
    
    try {
      const texto = await gerarDocumentoIA(tipo, vaga, perfil);
      setTextoGerado(texto);
    } catch (err) {
      setErro(err.message);
    } finally {
      setGerando(false);
    }
  }

  function baixarTxt() {
    if (!textoGerado) return;
    const blob = new Blob([textoGerado], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `documento-${vaga?.empresa || 'gerado'}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setBaixouArquivo("txt");
    setTimeout(() => setBaixouArquivo(null), 3000);
  }

  async function baixarPdf() {
    if (!textoGerado) return;
    try {
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF({ unit: "pt", format: "a4" });
      const margem = 48;
      const larguraUtil = doc.internal.pageSize.getWidth() - margem * 2;
      const alturaPagina = doc.internal.pageSize.getHeight();

      doc.setFont("helvetica", "normal");
      doc.setFontSize(11);

      const linhas = doc.splitTextToSize(textoGerado, larguraUtil);
      let y = margem;
      const alturaLinha = 14;

      linhas.forEach((linha) => {
        if (y > alturaPagina - margem) {
          doc.addPage();
          y = margem;
        }
        doc.text(linha, margem, y);
        y += alturaLinha;
      });

      const fileName = `documento-${vaga?.empresa || "gerado"}.pdf`;
      const pdfBlob = doc.output("blob");
      const url = URL.createObjectURL(pdfBlob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      setBaixouArquivo("pdf");
      setTimeout(() => setBaixouArquivo(null), 3000);
    } catch (err) {
      setErro(err.message);
    }
  }

  if (carregando) return <p className="carregando">Carregando informações...</p>;

  return (
    <div className="pv2-fundo">
      <div className="onboarding">
        <Link to="/dashboard" className="dbv2-btn-ghost" style={{ marginBottom: "20px" }}>
          &larr; Voltar para Dashboard
        </Link>
        <h1>Gerador de Documentos com IA</h1>

        {vaga && (
          <div className="cartao-experiencia" style={{ marginTop: "20px" }}>
            <span className="pv2-label" style={{ marginBottom: 0 }}>Vaga alvo</span>
            <h2 style={{ margin: 0 }}>{vaga.titulo}</h2>
            <p style={{ margin: 0 }}><strong>Empresa:</strong> {vaga.empresa}</p>
            <p style={{ maxHeight: "150px", overflowY: "auto", margin: 0, fontSize: "0.9rem", color: "var(--text-muted)", lineHeight: 1.55 }}>
              {vaga.descricao || vaga.resumo || "Sem descrição detalhada"}
            </p>
          </div>
        )}

        <div style={{ marginTop: "20px", display: "flex", flexWrap: "wrap", gap: "10px" }}>
          <button onClick={() => handleGerar("cv")} disabled={gerando} className="botao-principal" style={{ width: "auto", flex: "1 1 200px" }}>
            {gerando ? "Gerando..." : "Gerar Currículo"}
          </button>
          <button onClick={() => handleGerar("carta")} disabled={gerando} className="botao-principal" style={{ width: "auto", flex: "1 1 200px" }}>
            {gerando ? "Gerando..." : "Gerar Carta de Apresentação"}
          </button>
        </div>

        {erro && <p className="erro" style={{ marginTop: "20px" }}>{erro}</p>}
        {baixouArquivo && <p className="sucesso" style={{ marginTop: "20px" }}>✓ {baixouArquivo.toUpperCase()} baixado com sucesso!</p>}

        {textoGerado && (
          <div className="cartao-resumo" style={{ marginTop: "30px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px" }}>
              <h2 style={{ margin: 0 }}>Documento Gerado</h2>
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                <button onClick={baixarPdf} className="dbv2-btn-ghost">Baixar como PDF</button>
                <button onClick={baixarTxt} className="dbv2-btn-ghost">Baixar como TXT</button>
              </div>
            </div>
            <div className="dbv2-insight" style={{ margin: "16px 0" }}>
              <div>
                <div className="dbv2-insight-label">Revisão</div>
                <p>Revise o texto abaixo e copie-o, ou faça pequenos ajustes antes de salvar.</p>
              </div>
            </div>
            <textarea
              rows="25"
              style={{ width: "100%", boxSizing: "border-box", padding: "15px", fontFamily: "monospace", resize: "vertical" }}
              value={textoGerado}
              onChange={(e) => setTextoGerado(e.target.value)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
