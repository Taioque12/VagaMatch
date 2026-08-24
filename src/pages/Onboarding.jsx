import { useEffect, useRef, useState } from "react";
import { BriefcaseBusiness, CheckCircle2, FileDown, FileText, House, Send, ShieldCheck } from "lucide-react";
import { useNavigate, Link } from "react-router-dom";
import { AuthenticatedNav } from "../components/AuthenticatedNav.jsx";
import { supabase } from "../lib/supabase.js";
import { useAuth } from "../lib/AuthContext.jsx";

import { extrairDadosCurriculo } from "../lib/gemini.js";
import { gerarCurriculoPdf } from "../lib/curriculoPdf.js";
import {
  criarPreferenciasParaSalvar,
  deveConfirmarSaida,
  deveExibirSucessoPerfil,
} from "../lib/onboardingUx.js";
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
  const [gerandoLinkTelegram, setGerandoLinkTelegram] = useState(false);
  const [confirmandoSaida, setConfirmandoSaida] = useState(false);
  const [destinoSaida, setDestinoSaida] = useState("/dashboard");
  const [ehAdmin, setEhAdmin] = useState(false);

  const [telegramChatId, setTelegramChatId] = useState("");
  const [dadosExtraidos, setDadosExtraidos] = useState(null);

  const [novoCargo, setNovoCargo] = useState("");
  const [novaPalavra, setNovaPalavra] = useState("");
  const inputCurriculoRef = useRef(null);
  const dadosSalvosRef = useRef(null);
  const buscaAtivaRef = useRef(true);
  const dialogSaidaRef = useRef(null);

  const temAlteracoesNaoSalvas = Boolean(dadosExtraidos) &&
    JSON.stringify(dadosExtraidos) !== dadosSalvosRef.current;

  useEffect(() => {
    if (!session) return;
    async function carregar() {
      const userId = session.user.id;
      const [{ data: perfil }, { data: curriculo }, { data: prefs }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", userId).maybeSingle(),
        supabase.from("curriculos").select("*").eq("user_id", userId).maybeSingle(),
        supabase.from("preferencias").select("*").eq("user_id", userId).maybeSingle(),
      ]);

      if (perfil) {
        setTelegramChatId(perfil.telegram_chat_id ?? "");
        setEhAdmin(perfil.role === "admin");
      }
      buscaAtivaRef.current = prefs?.ativo ?? true;

      if (perfil?.nome_completo?.trim() || curriculo?.habilidades?.length > 0) {
        const dadosCarregados = {
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
        };
        setDadosExtraidos(dadosCarregados);
        dadosSalvosRef.current = JSON.stringify(dadosCarregados);
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

  useEffect(() => {
    if (!temAlteracoesNaoSalvas) return;

    function avisarAntesDeSair(event) {
      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", avisarAntesDeSair);
    return () => window.removeEventListener("beforeunload", avisarAntesDeSair);
  }, [temAlteracoesNaoSalvas]);

  useEffect(() => {
    const dialog = dialogSaidaRef.current;
    if (!dialog) return;

    if (confirmandoSaida && !dialog.open) dialog.showModal();
    if (!confirmandoSaida && dialog.open) dialog.close();
  }, [confirmandoSaida]);

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
      const { error: e1 } = await supabase.from("profiles").upsert({
        id: userId,
        nome_completo: d.nome_completo || "",
        localizacao: d.localizacao || "",
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
        criarPreferenciasParaSalvar(userId, d, buscaAtivaRef.current),
        { onConflict: "user_id" }
      );
      if (e3) throw e3;

      // ─── Fase A (V3): embedding do currículo-base (best-effort) ─────────
      // Falha aqui não bloqueia o onboarding — o pré-filtro vetorial é
      // fail-open no worker (currículo sem embedding = fluxo normal).
      try {
        const { error: eEmb } = await supabase.functions.invoke("curriculo-embedding");
        if (eEmb) throw eEmb;
      } catch (embErr) {
        console.warn("Embedding do currículo falhou (perfil salvo mesmo assim):", embErr.message);
      }

      dadosSalvosRef.current = JSON.stringify(d);
      setSalvo(true);
    } catch (err) {
      setErro(err.message);
    } finally {
      setSalvando(false);
    }
  }

  function solicitarSaida(destino = "/dashboard") {
    if (deveConfirmarSaida(temAlteracoesNaoSalvas, destino)) {
      setDestinoSaida(destino);
      setConfirmandoSaida(true);
      return;
    }
    navigate(destino);
  }

  function protegerNavegacao(event, destino) {
    if (!deveConfirmarSaida(temAlteracoesNaoSalvas, destino)) return;
    event.preventDefault();
    setDestinoSaida(destino);
    setConfirmandoSaida(true);
  }

  function confirmarSaida() {
    setConfirmandoSaida(false);
    navigate(destinoSaida);
  }

  async function conectarTelegram() {
    setErro(null);
    setGerandoLinkTelegram(true);
    const janelaTelegram = window.open("about:blank", "_blank");
    try {
      const { data, error } = await supabase.functions.invoke("telegram-link-token");
      if (error || !data?.token) throw new Error("Não foi possível criar um link seguro para o Telegram.");
      const url = `https://t.me/vagamatchbr_bot?start=${encodeURIComponent(data.token)}`;
      if (janelaTelegram) {
        janelaTelegram.opener = null;
        janelaTelegram.location.href = url;
      } else {
        window.location.assign(url);
      }
    } catch (err) {
      if (janelaTelegram && !janelaTelegram.closed) janelaTelegram.close();
      setErro(err.message);
    } finally {
      setGerandoLinkTelegram(false);
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
    <div className="dbv2-page app-page app-page-profile">
      <AuthenticatedNav
        activePath="/onboarding"
        email={session?.user?.email}
        isAdmin={ehAdmin}
        onNavigate={protegerNavegacao}
        accountActionLabel="Voltar para vagas"
        accountActionIcon={<BriefcaseBusiness size={16} />}
        onAccountAction={() => solicitarSaida("/dashboard")}
      />

      <dialog
        ref={dialogSaidaRef}
        className="onboarding-exit-dialog"
        aria-labelledby="saida-sem-salvar-titulo"
        aria-describedby="saida-sem-salvar-descricao"
        onCancel={(event) => {
          event.preventDefault();
          setConfirmandoSaida(false);
        }}
        onClose={() => setConfirmandoSaida(false)}
      >
        <h2 id="saida-sem-salvar-titulo">Sair sem salvar?</h2>
        <p id="saida-sem-salvar-descricao">
          As alterações feitas no seu perfil serão perdidas.
        </p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <button type="button" className="dbv2-btn-ghost" onClick={() => setConfirmandoSaida(false)}>
            Continuar editando
          </button>
          <button type="button" className="dbv2-btn-primario" onClick={confirmarSaida}>
            Sair sem salvar
          </button>
        </div>
      </dialog>

      <main className="dbv2-coluna app-content onboarding onboarding-simples">
        <header className="dbv2-page-header app-page-heading">
          <p className="dbv2-page-kicker">Perfil de empregabilidade</p>
          <h1>Seu perfil profissional</h1>
          <p className="app-page-description">
          Envie seu currículo em PDF — a IA lê tudo e preenche seu perfil, currículo-base e
          preferências de busca sozinha. Sem formulário pra preencher.
          </p>
        </header>

        <section className="zona-upload">
          <input
            type="file"
            accept="application/pdf"
            onChange={handleUploadPdf}
            disabled={analisandoPdf}
            id="upload-cv"
            style={{ display: "none" }}
            ref={inputCurriculoRef}
          />
          <label
            htmlFor="upload-cv"
            className="zona-upload-label"
            tabIndex="0"
            role="button"
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                inputCurriculoRef.current?.click();
              }
            }}
          >
            <span className="zona-upload-icone"><FileText size={26} aria-hidden="true" /></span>
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
            <div className="cartao-resumo-check"><CheckCircle2 size={17} /> Perfil extraído com sucesso</div>
            <h2>Revise seu perfil</h2>

            <div style={{ display: "grid", gap: "1rem", marginTop: "1rem" }}>
              <label htmlFor="nome-completo">
                Nome completo
                <input
                  id="nome-completo"
                  name="name"
                  type="text"
                  autoComplete="name"
                  value={dadosExtraidos.nome_completo || ""}
                  onChange={(event) => setDadosExtraidos((d) => ({ ...d, nome_completo: event.target.value }))}
                />
              </label>
              <label htmlFor="localizacao">
                Localização
                <input
                  id="localizacao"
                  name="localizacao"
                  type="text"
                  autoComplete="address-level2"
                  value={dadosExtraidos.localizacao || ""}
                  onChange={(event) => setDadosExtraidos((d) => ({ ...d, localizacao: event.target.value }))}
                />
              </label>
              <label htmlFor="resumo-profissional">
                Resumo profissional
                <textarea
                  id="resumo-profissional"
                  name="resumo_profissional"
                  rows="5"
                  value={dadosExtraidos.resumo_profissional || ""}
                  onChange={(event) => setDadosExtraidos((d) => ({ ...d, resumo_profissional: event.target.value }))}
                />
              </label>
            </div>

            <div style={{ marginTop: "1rem" }}>
              <strong className="pv2-label">Cargos-alvo</strong>
              <div className="tags" style={{ marginBottom: 8 }}>
                {(dadosExtraidos.cargos_alvo || []).map((c, i) => (
                  <span className="tag" key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    {c}
                    <button type="button" aria-label={`Remover cargo ${c}`} onClick={() => handleRemCargo(i)} style={{ background: "none", border: "none", color: "currentColor", cursor: "pointer", padding: 0, fontSize: "0.9rem" }}>×</button>
                  </span>
                ))}
              </div>
              <label htmlFor="novo-cargo" className="sr-only">Adicionar cargo</label>
              <input 
                id="novo-cargo"
                name="novo-cargo"
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
                    <button type="button" aria-label={`Remover tecnologia ${p}`} onClick={() => handleRemPalavra(i)} style={{ background: "none", border: "none", color: "currentColor", cursor: "pointer", padding: 0, fontSize: "0.9rem" }}>×</button>
                  </span>
                ))}
              </div>
              <label htmlFor="nova-tecnologia" className="sr-only">Adicionar tecnologia</label>
              <input 
                id="nova-tecnologia"
                name="nova-tecnologia"
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
                  { valor: "remoto", label: "Home office", icon: House },
                  { valor: "hibrido", label: "Híbrido" },
                  { valor: "presencial", label: "Presencial" },
                ].map((opt) => (
                  <button
                    key={opt.valor}
                    type="button"
                    className={(dadosExtraidos.modalidade_trabalho || "qualquer") === opt.valor ? "dbv2-filtro ativo" : "dbv2-filtro"}
                    onClick={() => setDadosExtraidos((d) => ({ ...d, modalidade_trabalho: opt.valor }))}
                    aria-pressed={(dadosExtraidos.modalidade_trabalho || "qualquer") === opt.valor}
                  >
                    {opt.icon && <House size={16} />} {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={handleBaixarPdf}
              disabled={baixandoPdf}
              className="dbv2-btn-ghost"
              style={{ marginTop: "1rem" }}
            >
              <FileDown size={16} /> {baixandoPdf ? "Gerando PDF..." : "Baixar currículo em PDF"}
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
              <div className="app-telegram-connected" role="status" aria-live="polite" aria-atomic="true">
                <CheckCircle2 size={18} /><span>Telegram conectado</span>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <button
                  type="button"
                  onClick={conectarTelegram}
                  disabled={gerandoLinkTelegram}
                  className="dbv2-btn-primario"
                  style={{ textDecoration: "none", textAlign: "center", display: "inline-block" }}
                >
                  <Send size={16} /> {gerandoLinkTelegram ? "Preparando link seguro..." : "Conectar Telegram"}
                </button>
                <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
                  {gerandoLinkTelegram ? "Preparando link seguro para conectar o Telegram." : "Telegram ainda não conectado."}
                </p>
                <p className="ajuda" style={{ fontSize: "0.85rem", textAlign: "center", margin: 0 }}>
                  Clique no botão, depois em "Começar" lá no Telegram. Essa tela vai atualizar sozinha!
                </p>
              </div>
            )}
          </section>
        )}

        {erro && <p className="erro" role="alert" style={{ textAlign: "center" }}>{erro}</p>}
        {pdfBaixado && <p className="sucesso" role="status" aria-live="polite" style={{ textAlign: "center" }}>✓ PDF baixado com sucesso! Verifique sua pasta de downloads.</p>}
        {deveExibirSucessoPerfil(salvo, temAlteracoesNaoSalvas) && (
          <div className="sucesso" role="status" aria-live="polite" style={{ textAlign: "center" }}>
            <p style={{ marginTop: 0 }}>Perfil salvo. A busca usará essas informações nos próximos ciclos.</p>
            <button type="button" className="dbv2-btn-primario" onClick={solicitarSaida}>
              Ir para vagas
            </button>
          </div>
        )}

        {pronto && (
          <button
            type="button"
            onClick={handleSalvar}
            disabled={salvando}
            className="dbv2-btn-primario app-save-button"
          >
            {salvando ? "Salvando…" : "Salvar perfil"}
          </button>
        )}
        <section className="profile-privacy-link">
          <div><ShieldCheck size={20} /><div><h2>Privacidade e seus dados</h2><p>Exporte suas informações ou acompanhe uma solicitação de exclusão.</p></div></div>
          <Link className="dbv2-btn-ghost" to="/meus-dados" onClick={(event) => protegerNavegacao(event, "/meus-dados")}>Gerenciar meus dados</Link>
        </section>
      </main>
    </div>
  );
}
