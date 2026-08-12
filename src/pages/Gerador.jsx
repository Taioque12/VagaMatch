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
  const [vagaNaoEncontrada, setVagaNaoEncontrada] = useState(false);
  const [problemasPerfil, setProblemasPerfil] = useState([]);

  const [textoGerado, setTextoGerado] = useState("");
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState(null);
  const [baixouArquivo, setBaixouArquivo] = useState(null);

  useEffect(() => {
    if (!session) return;
    async function carregar() {
      const userId = session.user.id;
      setCarregando(true);
      setErro(null);
      setVagaNaoEncontrada(false);
      setProblemasPerfil([]);

      try {
        const { data: vagaData, error: errVaga } = await supabase
          .from("vagas_vistas")
          .select("*")
          .eq("id", id)
          .maybeSingle();

        if (errVaga) throw errVaga;
        if (!vagaData) {
          setVagaNaoEncontrada(true);
          return;
        }
        setVaga(vagaData);

        const [resultadoPerfil, resultadoCurriculo] = await Promise.all([
          supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
          supabase.from("curriculos").select("*").eq("user_id", userId).maybeSingle(),
        ]);
        const { data: perfilData, error: erroPerfil } = resultadoPerfil;
        const { data: curriculo, error: erroCurriculo } = resultadoCurriculo;
        const problemas = [];

        if (erroPerfil || !perfilData) {
          problemas.push("Não foi possível carregar seu perfil.");
        }
        if (erroCurriculo || !curriculo) {
          problemas.push("Não foi possível carregar seu currículo.");
        }
        setProblemasPerfil(problemas);

        setPerfil({
          nome: perfilData?.nome_completo || "Nome não informado",
          area_atuacao: curriculo?.resumo_profissional || "",
          resumo: curriculo?.resumo_profissional || "",
          experiencia: (curriculo?.experiencias || []).map(e => `${e.cargo} na ${e.empresa} (${e.periodo}):\n${e.bullets?.join('\n')}`).join("\n\n"),
          skills: (curriculo?.habilidades || []).join(", "),
        });
      } catch (e) {
        setErro(e.message);
      } finally {
        setCarregando(false);
      }
    }

    carregar();
  }, [id, session]);

  async function handleGerar(tipo) {
    if (!vaga) {
      setErro("Esta vaga não está mais disponível para gerar documentos.");
      return;
    }
    if (!perfil || problemasPerfil.length > 0) {
      setErro("Atualize seu perfil e currículo antes de gerar um documento.");
      return;
    }

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

  if (carregando) {
    return (
      <div className="pv2-fundo">
        <main className="onboarding" aria-busy="true">
          <p className="carregando" role="status" aria-live="polite">
            Carregando vaga, perfil e currículo…
          </p>
        </main>
      </div>
    );
  }

  if (vagaNaoEncontrada) {
    return (
      <div className="pv2-fundo">
        <main className="onboarding">
          <h1>Vaga não encontrada</h1>
          <p>Ela pode ter sido removida ou não estar disponível para sua conta.</p>
          <Link to="/dashboard" className="botao-principal" style={{ display: "inline-block", textDecoration: "none", marginTop: "20px" }}>
            Voltar para o Dashboard
          </Link>
        </main>
      </div>
    );
  }

  if (!vaga) {
    return (
      <div className="pv2-fundo">
        <main className="onboarding">
          <h1>Não foi possível abrir esta vaga</h1>
          <p className="erro" role="alert">{erro || "Tente novamente em alguns instantes."}</p>
          <Link to="/dashboard" className="botao-principal" style={{ display: "inline-block", textDecoration: "none", marginTop: "20px" }}>
            Voltar para o Dashboard
          </Link>
        </main>
      </div>
    );
  }

  const podeGerar = Boolean(perfil) && problemasPerfil.length === 0;

  return (
    <div className="pv2-fundo">
      <main className="onboarding">
        <Link to="/dashboard" className="dbv2-btn-ghost" style={{ marginBottom: "20px" }}>
          &larr; Voltar para Dashboard
        </Link>
        <h1>Gerador de Documentos com IA</h1>

        <div className="cartao-experiencia" style={{ marginTop: "20px" }}>
          <span className="pv2-label" style={{ marginBottom: 0 }}>Vaga alvo</span>
          <h2 style={{ margin: 0 }}>{vaga.titulo}</h2>
          <p style={{ margin: 0 }}><strong>Empresa:</strong> {vaga.empresa}</p>
          <p style={{ maxHeight: "150px", overflowY: "auto", margin: 0, fontSize: "0.9rem", color: "var(--text-muted)", lineHeight: 1.55 }}>
            {vaga.descricao || vaga.resumo || "Sem descrição detalhada"}
          </p>
        </div>

        {problemasPerfil.length > 0 && (
          <section className="erro" role="alert" style={{ marginTop: "20px" }}>
            <h2 style={{ marginTop: 0 }}>Complete seu perfil antes de gerar</h2>
            <ul>
              {problemasPerfil.map((problema) => <li key={problema}>{problema}</li>)}
            </ul>
            <Link to="/onboarding">Atualizar perfil</Link>
          </section>
        )}

        <div style={{ marginTop: "20px", display: "flex", flexWrap: "wrap", gap: "10px" }}>
          <button onClick={() => handleGerar("cv")} disabled={gerando || !podeGerar} className="botao-principal" style={{ width: "auto", flex: "1 1 200px" }}>
            {gerando ? "Gerando…" : "Gerar Currículo"}
          </button>
          <button onClick={() => handleGerar("carta")} disabled={gerando || !podeGerar} className="botao-principal" style={{ width: "auto", flex: "1 1 200px" }}>
            {gerando ? "Gerando…" : "Gerar Carta de Apresentação"}
          </button>
        </div>

        {gerando && <p role="status" aria-live="polite" style={{ marginTop: "20px" }}>Gerando documento…</p>}
        {erro && <p className="erro" role="alert" style={{ marginTop: "20px" }}>{erro}</p>}
        {baixouArquivo && <p className="sucesso" role="status" aria-live="polite" style={{ marginTop: "20px" }}>✓ {baixouArquivo.toUpperCase()} baixado com sucesso!</p>}

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
            <label htmlFor="documento-gerado" className="sr-only">Documento gerado</label>
            <textarea
              id="documento-gerado"
              name="documento-gerado"
              rows="25"
              style={{ width: "100%", boxSizing: "border-box", padding: "15px", fontFamily: "monospace", resize: "vertical" }}
              value={textoGerado}
              onChange={(e) => setTextoGerado(e.target.value)}
            />
          </div>
        )}
      </main>
    </div>
  );
}
