import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "../lib/supabase.js";
import { useAuth } from "../lib/AuthContext.jsx";

import { extrairDadosCurriculo, gerarEmbedding } from "../lib/gemini.js";
import { gerarCurriculoPdf } from "../lib/curriculoPdf.js";
import "../dashboard-premium-v2.css";

export function Onboarding() {
  const { session } = useAuth();
  const navigate = useNavigate();

  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState(null);
  const [salvo, setSalvo] = useState(false);
  const [analisandoPdf, setAnalisandoPdf] = useState(false);
  const [nomeArquivo, setNomeArquivo] = useState(null);
  const [baixandoPdf, setBaixandoPdf] = useState(false);
  const [pdfBaixado, setPdfBaixado] = useState(false);

  const [telegramChatId, setTelegramChatId] = useState("");
  const [dadosExtraidos, setDadosExtraidos] = useState(null);

  const [novoCargo, setNovoCargo] = useState("");
  const [novaPalavra, setNovaPalavra] = useState("");

  useEffect(() => {
    if (!session) return;
    async function carregar() {
      const userId = session.user.id;
      const [{ data: perfil }, { data: curriculo }, { data: prefs }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
        supabase.from("curriculos").select("*").eq("user_id", userId).maybeSingle(),
        supabase.from("preferencias").select("*").eq("user_id", userId).maybeSingle(),
      ]);

      if (perfil) setTelegramChatId(perfil.telegram_chat_id ?? "");

      if (perfil?.nome_completo?.trim() || curriculo?.habilidades?.length > 0) {
        setDadosExtraidos({
          nome_completo: perfil?.nome_completo ?? "",
          localizacao: perfil?.localizacao ?? "",
          resumo_profissional: curriculo?.resumo_profissional ?? "",
          habilidades: curriculo?.habilidades ?? [],
          experiencias: curriculo?.experiencias ?? [],
          formacao: curriculo?.formacao ?? [],
          cursos: curriculo?.cursos ?? [],
          projetos: curriculo?.projetos ?? [],
          cargos_alvo: prefs?.cargos_alvo ?? [],
          palavras_chave: prefs?.palavras_chave ?? [],
          regioes: prefs?.regioes ?? [],
          modalidade_trabalho: prefs?.modalidade_trabalho ?? "qualquer",
        });
      }

      setCarregando(false);
    }
    carregar().catch((e) => {
      setErro(e.message);
      setCarregando(false);
    });

    // Configura o listener do Realtime para mudanças no telegram_chat_id
    const channel = supabase
      .channel('schema-db-changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${session.user.id}`
        },
        (payload) => {
          if (payload.new.telegram_chat_id) {
            setTelegramChatId(payload.new.telegram_chat_id);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [session]);

  function handleAddCargo(e) {
    if (e.key === "Enter" && novoCargo.trim()) {
      e.preventDefault();
      setDadosExtraidos(d => ({ ...d, cargos_alvo: [...(d.cargos_alvo || []), novoCargo.trim()] }));
      setNovoCargo("");
    }
  }
  function handleRemCargo(idx) {
    setDadosExtraidos(d => ({ ...d, cargos_alvo: d.cargos_alvo.filter((_, i) => i !== idx) }));
  }
  
  function handleAddPalavra(e) {
    if (e.key === "Enter" && novaPalavra.trim()) {
      e.preventDefault();
      setDadosExtraidos(d => ({ ...d, palavras_chave: [...(d.palavras_chave || []), novaPalavra.trim()] }));
      setNovaPalavra("");
    }
  }
  function handleRemPalavra(idx) {
    setDadosExtraidos(d => ({ ...d, palavras_chave: d.palavras_chave.filter((_, i) => i !== idx) }));
  }

  async function handleUploadPdf(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setAnalisandoPdf(true);
    setErro(null);
    setSalvo(false);
    setNomeArquivo(file.name);

    try {
      const reader = new FileReader();
      reader.onload = async (evt) => {
        try {
          const base64 = evt.target.result.split(",")[1];
          const mimeType = file.type || "application/pdf";

          if (!base64) {
            throw new Error("Arquivo PDF vazio ou inválido.");
          }

          const dados = await extrairDadosCurriculo(base64, mimeType);
          setDadosExtraidos(dados);
        } catch (err) {
          setErro(`Erro ao processar o PDF: ${err.message}`);
          setNomeArquivo(null);
        } finally {
          setAnalisandoPdf(false);
          e.target.value = null;
        }
      };
      // Sem onerror o estado "analisandoPdf" nunca resolve se a leitura falhar
      // (arquivo corrompido/removido) — spinner ficaria travado pra sempre.
      reader.onerror = () => {
        setErro(`Erro ao ler o arquivo: ${reader.error?.message || "falha desconhecida na leitura"}`);
        setAnalisandoPdf(false);
        setNomeArquivo(null);
        e.target.value = null;
      };
      reader.readAsDataURL(file);
    } catch (err) {
      setErro(`Erro ao processar o PDF: ${err.message}`);
      setAnalisandoPdf(false);
      setNomeArquivo(null);
      e.target.value = null;
    }
  }

  async function handleSalvar() {
    setSalvando(true);
    setErro(null);
    setSalvo(false);
    const userId = session.user.id;
    const d = dadosExtraidos;

    try {
      // Valida telegram_chat_id: deve ser numérico se fornecido
      let validChatId = null;
      if (telegramChatId?.trim()) {
        if (!/^-?\d+$/.test(telegramChatId)) {
          throw new Error("Chat ID do Telegram deve ser um número (sem espaços/símbolos).");
        }
        validChatId = telegramChatId;
      }

      const { error: e1 } = await supabase.from("profiles").upsert({
        id: userId,
        nome_completo: d.nome_completo || "",
        localizacao: d.localizacao || "",
        telegram_chat_id: validChatId,
        updated_at: new Date().toISOString(),
      });
      if (e1) throw e1;

      const { error: e2 } = await supabase.from("curriculos").upsert(
        {
          user_id: userId,
          resumo_profissional: d.resumo_profissional || "",
          habilidades: d.habilidades || [],
          experiencias: d.experiencias || [],
          formacao: d.formacao || [],
          cursos: d.cursos || [],
          projetos: d.projetos || [],
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );
      if (e2) throw e2;

      const { error: e3 } = await supabase.from("preferencias").upsert(
        {
          user_id: userId,
          ativo: true,
          cargos_alvo: d.cargos_alvo || [],
          palavras_chave: d.palavras_chave || [],
          regioes: d.regioes || [],
          modalidade_trabalho: d.modalidade_trabalho || "qualquer",
          busca_solicitada: true, // Aciona a busca prioritária automática no próximo ciclo do worker
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );
      if (e3) throw e3;

      // ─── Fase A (V3): embedding do currículo-base (best-effort) ─────────
      // Falha aqui não bloqueia o onboarding — o pré-filtro vetorial é
      // fail-open no worker (currículo sem embedding = fluxo normal).
      try {
        const textoConsolidado = [
          d.resumo_profissional,
          (d.habilidades || []).join(", "),
          ...(d.experiencias || []).map(
            (exp) => `${exp.cargo} | ${exp.empresa} | ${(exp.bullets || []).join("; ")}`
          ),
          ...(d.formacao || []),
          (d.cargos_alvo || []).join(", "),
        ].filter(Boolean).join("\n");

        if (textoConsolidado.trim()) {
          const embedding = await gerarEmbedding(textoConsolidado);
          const { error: eEmb } = await supabase
            .from("curriculos")
            .update({ embedding })
            .eq("user_id", userId);
          if (eEmb) throw eEmb;
        }
      } catch (embErr) {
        console.warn("Embedding do currículo falhou (perfil salvo mesmo assim):", embErr.message);
      }

      setSalvo(true);
      setTimeout(() => {
        navigate("/dashboard");
      }, 3000);
    } catch (err) {
      setErro(err.message);
    } finally {
      setSalvando(false);
    }
  }

  async function handleBaixarPdf() {
    if (!dadosExtraidos) {
      setErro("Nenhum dado de currículo para baixar. Importe um PDF primeiro.");
      return;
    }
    setBaixandoPdf(true);
    setErro(null);
    setPdfBaixado(false);
    try {
      await gerarCurriculoPdf(dadosExtraidos, {
        nomeCompleto: dadosExtraidos.nome_completo,
        localizacao: dadosExtraidos.localizacao,
        email: session?.user?.email,
      });
      setPdfBaixado(true);
      setTimeout(() => setPdfBaixado(false), 4000);
    } catch (err) {
      setErro(err.message);
    } finally {
      setBaixandoPdf(false);
    }
  }

  if (carregando) return <p className="carregando">Carregando...</p>;

  const pronto = !!dadosExtraidos;

  return (
    <div className="pv2-fundo" style={{ display: "flex", flexDirection: "column" }}>
      <nav className="lp-nav">
        <Link to="/dashboard" className="lp-logo" style={{ textDecoration: "none" }}>
          <span className="lp-logo-marca" />
          VagaMatch
        </Link>
        <div style={{ display: "flex", gap: "20px", alignItems: "center" }}>
          <Link to="/dashboard" className="lp-botao-claro">
            Ir para Vagas
          </Link>
        </div>
      </nav>

      <div className="onboarding onboarding-simples">
        <h1 style={{ textAlign: "center", marginBottom: "0.5rem" }}>Configure seu perfil</h1>
        <p className="ajuda" style={{ textAlign: "center", maxWidth: 520, margin: "0 auto" }}>
          Envie seu currículo em PDF — a IA lê tudo e preenche seu perfil, currículo-base e
          preferências de busca sozinha. Sem formulário pra preencher.
        </p>

        <section className="zona-upload">
          <input
            type="file"
            accept="application/pdf"
            onChange={handleUploadPdf}
            disabled={analisandoPdf}
            id="upload-cv"
            style={{ display: "none" }}
          />
          <label htmlFor="upload-cv" className="zona-upload-label">
            <span className="zona-upload-icone">{analisandoPdf ? "⏳" : "📄"}</span>
            <span className="zona-upload-titulo">
              {analisandoPdf
                ? "Lendo seu currículo com IA..."
                : pronto
                ? "Trocar currículo em PDF"
                : "Importar currículo em PDF"}
            </span>
            <span className="zona-upload-sub">
              {nomeArquivo ? nomeArquivo : "Clique para selecionar o arquivo"}
            </span>
          </label>
        </section>

        {pronto && (
          <section className="cartao-resumo">
            <div className="cartao-resumo-check">✓ Perfil extraído com sucesso</div>
            <h2>{dadosExtraidos.nome_completo || "Nome não identificado"}</h2>
            {dadosExtraidos.localizacao && <p className="ajuda">{dadosExtraidos.localizacao}</p>}

            <div style={{ marginTop: "1rem" }}>
              <strong className="pv2-label">Cargos-alvo</strong>
              <div className="tags" style={{ marginBottom: 8 }}>
                {(dadosExtraidos.cargos_alvo || []).map((c, i) => (
                  <span className="tag" key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    {c}
                    <button type="button" onClick={() => handleRemCargo(i)} style={{ background: "none", border: "none", color: "currentColor", cursor: "pointer", padding: 0, fontSize: "0.9rem" }}>×</button>
                  </span>
                ))}
              </div>
              <input 
                type="text" 
                value={novoCargo} 
                onChange={e => setNovoCargo(e.target.value)} 
                onKeyDown={handleAddCargo}
                placeholder="Adicionar cargo (pressione Enter)" 
                style={{ fontSize: "0.85rem", padding: "6px 12px", width: "100%", maxWidth: 300 }}
              />
            </div>

            <div style={{ marginTop: "1rem", marginBottom: "1.5rem" }}>
              <strong className="pv2-label">Palavras-chave (Tecnologias)</strong>
              <div className="tags" style={{ marginBottom: 8 }}>
                {(dadosExtraidos.palavras_chave || []).map((p, i) => (
                  <span className="tag" key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    {p}
                    <button type="button" onClick={() => handleRemPalavra(i)} style={{ background: "none", border: "none", color: "currentColor", cursor: "pointer", padding: 0, fontSize: "0.9rem" }}>×</button>
                  </span>
                ))}
              </div>
              <input 
                type="text" 
                value={novaPalavra} 
                onChange={e => setNovaPalavra(e.target.value)} 
                onKeyDown={handleAddPalavra}
                placeholder="Adicionar tecnologia (pressione Enter)" 
                style={{ fontSize: "0.85rem", padding: "6px 12px", width: "100%", maxWidth: 300 }}
              />
            </div>

            <div style={{ marginTop: "1rem", marginBottom: "1.5rem" }}>
              <strong className="pv2-label">Modalidade de trabalho</strong>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                {[
                  { valor: "qualquer", label: "Qualquer" },
                  { valor: "remoto", label: "🏠 Home Office" },
                  { valor: "hibrido", label: "Híbrido" },
                  { valor: "presencial", label: "Presencial" },
                ].map((opt) => (
                  <button
                    key={opt.valor}
                    type="button"
                    className={(dadosExtraidos.modalidade_trabalho || "qualquer") === opt.valor ? "dbv2-filtro ativo" : "dbv2-filtro"}
                    onClick={() => setDadosExtraidos((d) => ({ ...d, modalidade_trabalho: opt.valor }))}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {dadosExtraidos.resumo_profissional && (
              <p className="resumo-preview">{dadosExtraidos.resumo_profissional}</p>
            )}

            <button
              type="button"
              onClick={handleBaixarPdf}
              disabled={baixandoPdf}
              className="dbv2-btn-ghost"
              style={{ marginTop: "1rem" }}
            >
              {baixandoPdf ? "Gerando PDF..." : "Baixar currículo em PDF"}
            </button>
          </section>
        )}

        {pronto && (
          <section className="cartao-telegram">
            <h2>Notificações no Telegram</h2>
            <p className="ajuda" style={{ marginBottom: 12 }}>
              Receba as vagas no seu celular assim que a IA aprovar.
            </p>
            {telegramChatId ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "14px 18px", background: "linear-gradient(135deg, rgba(16,185,129,0.08), rgba(255,255,255,0.02))", border: "1px solid rgba(16,185,129,0.18)", borderRadius: 14, color: "#34d399", fontWeight: 700 }}>
                <span>✅ Telegram Conectado!</span>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <a 
                  href={`https://t.me/vagamatchbr_bot?start=${session.user.id}`} 
                  target="_blank" 
                  rel="noreferrer"
                  className="botao-principal"
                  style={{ textDecoration: "none", textAlign: "center", display: "inline-block" }}
                >
                  Conectar Telegram (1-clique)
                </a>
                <p className="ajuda" style={{ fontSize: "0.85rem", textAlign: "center", margin: 0 }}>
                  Clique no botão, depois em "Começar" lá no Telegram. Essa tela vai atualizar sozinha!
                </p>
              </div>
            )}
          </section>
        )}

        {erro && <p className="erro" style={{ textAlign: "center" }}>{erro}</p>}
        {pdfBaixado && <p className="sucesso" style={{ textAlign: "center" }}>✓ PDF baixado com sucesso! Verifique sua pasta de downloads.</p>}
        {salvo && <p className="sucesso" style={{ textAlign: "center" }}>✓ Preparando suas vagas exclusivas... Redirecionando para o painel em instantes.</p>}

        {pronto && (
          <button
            type="button"
            onClick={handleSalvar}
            disabled={salvando}
            className="botao-principal"
          >
            {salvando ? "Salvando..." : "Salvar e continuar"}
          </button>
        )}
      </div>
    </div>
  );
}
