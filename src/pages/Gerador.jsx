import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "../lib/supabase.js";
import { useAuth } from "../lib/AuthContext.jsx";
import { gerarDocumentoIA } from "../lib/gemini.js";

export function Gerador() {
  const { id } = useParams();
  const { session } = useAuth();
  
  const [vaga, setVaga] = useState(null);
  const [perfil, setPerfil] = useState(null);
  const [carregando, setCarregando] = useState(true);
  
  const [textoGerado, setTextoGerado] = useState("");
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState(null);

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
  }

  if (carregando) return <p className="carregando">Carregando informações...</p>;

  return (
    <div className="onboarding">
      <Link to="/dashboard" className="acao" style={{ display: "inline-block", marginBottom: "20px" }}>
        &larr; Voltar para Dashboard
      </Link>
      <h1>Gerador de Documentos com IA</h1>
      
      {vaga && (
        <div className="cartao-experiencia">
          <h2>Vaga Alvo: {vaga.titulo}</h2>
          <p><strong>Empresa:</strong> {vaga.empresa}</p>
          <p style={{ maxHeight: "150px", overflowY: "auto", marginTop: "10px", fontSize: "0.9rem", color: "#666" }}>
            {vaga.descricao || vaga.resumo || "Sem descrição detalhada"}
          </p>
        </div>
      )}

      <div style={{ marginTop: "20px", display: "flex", flexWrap: "wrap", gap: "10px" }}>
        <button onClick={() => handleGerar("cv")} disabled={gerando} className="botao-principal" style={{ width: "auto", flex: "1 1 200px" }}>
          {gerando ? "Gerando..." : "Gerar Currículo"}
        </button>
        <button onClick={() => handleGerar("carta")} disabled={gerando} className="botao-principal" style={{ width: "auto", flex: "1 1 200px", backgroundColor: "#10b981" }}>
          {gerando ? "Gerando..." : "Gerar Carta de Apresentação"}
        </button>
      </div>

      {erro && <p className="erro" style={{ marginTop: "20px" }}>{erro}</p>}

      {textoGerado && (
        <div style={{ marginTop: "30px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2>Documento Gerado:</h2>
            <button onClick={baixarTxt} className="acao">Baixar como TXT</button>
          </div>
          <p className="ajuda">Revise o texto abaixo e copie-o, ou faça pequenos ajustes antes de salvar.</p>
          <textarea 
            rows="25" 
            style={{ width: "100%", padding: "15px", fontFamily: "monospace", borderRadius: "8px", border: "1px solid #ccc" }}
            value={textoGerado}
            onChange={(e) => setTextoGerado(e.target.value)}
          />
        </div>
      )}
    </div>
  );
}
