import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { supabase } from "../lib/supabase.js";
import { useAuth } from "../lib/AuthContext.jsx";
import { ThemeToggle } from "../components/ThemeToggle.jsx";

import { extrairDadosCurriculo } from "../lib/gemini.js";
import { gerarCurriculoPdf } from "../lib/curriculoPdf.js";

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

  const [telegramChatId, setTelegramChatId] = useState("");
  const [dadosExtraidos, setDadosExtraidos] = useState(null);

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

      if (perfil?.nome_completo || curriculo) {
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
        });
      }

      setCarregando(false);
    }
    carregar().catch((e) => {
      setErro(e.message);
      setCarregando(false);
    });
  }, [session]);

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
          const dados = await extrairDadosCurriculo(base64, file.type);
          setDadosExtraidos(dados);
        } catch (err) {
          setErro(err.message);
          setNomeArquivo(null);
        } finally {
          setAnalisandoPdf(false);
          e.target.value = null;
        }
      };
      reader.readAsDataURL(file);
    } catch (err) {
      setErro(err.message);
      setAnalisandoPdf(false);
      setNomeArquivo(null);
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
        telegram_chat_id: telegramChatId || null,
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
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );
      if (e3) throw e3;

      setSalvo(true);
    } catch (err) {
      setErro(err.message);
    } finally {
      setSalvando(false);
    }
  }

  async function handleBaixarPdf() {
    if (!dadosExtraidos) return;
    setBaixandoPdf(true);
    setErro(null);
    try {
      await gerarCurriculoPdf(dadosExtraidos, {
        nomeCompleto: dadosExtraidos.nome_completo,
        localizacao: dadosExtraidos.localizacao,
        email: session?.user?.email,
      });
    } catch (err) {
      setErro(err.message);
    } finally {
      setBaixandoPdf(false);
    }
  }

  if (carregando) return <p className="carregando">Carregando...</p>;

  const pronto = !!dadosExtraidos;

  return (
    <div className="lp lp-hero-bloco" style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <nav className="lp-nav">
        <Link to="/dashboard" className="lp-logo" style={{ textDecoration: "none" }}>
          <span className="lp-logo-marca" />
          VagaMatch
        </Link>
        <div style={{ display: "flex", gap: "20px", alignItems: "center" }}>
          <ThemeToggle />
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

            {!!dadosExtraidos.cargos_alvo?.length && (
              <div className="tags">
                {dadosExtraidos.cargos_alvo.map((c, i) => (
                  <span className="tag" key={i}>
                    {c}
                  </span>
                ))}
              </div>
            )}

            {dadosExtraidos.resumo_profissional && (
              <p className="resumo-preview">{dadosExtraidos.resumo_profissional}</p>
            )}

            <button
              type="button"
              onClick={handleBaixarPdf}
              disabled={baixandoPdf}
              className="acao"
              style={{ marginTop: "1rem" }}
            >
              {baixandoPdf ? "Gerando PDF..." : "Baixar currículo em PDF"}
            </button>
          </section>
        )}

        {pronto && (
          <section className="cartao-telegram">
            <h2>Notificações no Telegram</h2>
            <p className="ajuda">
              Fale com{" "}
              <a href="https://t.me/userinfobot" target="_blank" rel="noreferrer">
                @userinfobot
              </a>{" "}
              no Telegram pra pegar seu Chat ID e receber as vagas compatíveis automaticamente.
            </p>
            <input
              value={telegramChatId}
              onChange={(e) => setTelegramChatId(e.target.value)}
              placeholder="Cole seu Telegram Chat ID"
            />
          </section>
        )}

        {erro && <p className="erro" style={{ textAlign: "center" }}>{erro}</p>}
        {salvo && <p className="sucesso" style={{ textAlign: "center" }}>Salvo com sucesso.</p>}

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
