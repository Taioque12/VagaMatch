import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase.js";
import { useAuth } from "../lib/AuthContext.jsx";

const linhas = (texto) =>
  texto
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

const csv = (texto) =>
  texto
    .split(",")
    .map((l) => l.trim())
    .filter(Boolean);

const vazioExperiencia = () => ({ cargo: "", empresa: "", periodo: "", bullets: "" });

export function Onboarding() {
  const { session } = useAuth();
  const navigate = useNavigate();

  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState(null);
  const [salvo, setSalvo] = useState(false);

  // Currículo
  const [resumoProfissional, setResumoProfissional] = useState("");
  const [habilidades, setHabilidades] = useState("");
  const [experiencias, setExperiencias] = useState([vazioExperiencia()]);
  const [formacao, setFormacao] = useState("");
  const [cursos, setCursos] = useState("");
  const [projetos, setProjetos] = useState("");

  // Preferências
  const [cargosAlvo, setCargosAlvo] = useState("");
  const [palavrasChave, setPalavrasChave] = useState("");
  const [regioes, setRegioes] = useState("");

  // Perfil
  const [nomeCompleto, setNomeCompleto] = useState("");
  const [localizacao, setLocalizacao] = useState("");
  const [telegramChatId, setTelegramChatId] = useState("");

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
        setNomeCompleto(perfil.nome_completo ?? "");
        setLocalizacao(perfil.localizacao ?? "");
        setTelegramChatId(perfil.telegram_chat_id ?? "");
      }
      if (curriculo) {
        setResumoProfissional(curriculo.resumo_profissional ?? "");
        setHabilidades((curriculo.habilidades ?? []).join(", "));
        setExperiencias(
          (curriculo.experiencias ?? []).length
            ? curriculo.experiencias.map((e) => ({
                cargo: e.cargo ?? "",
                empresa: e.empresa ?? "",
                periodo: e.periodo ?? "",
                bullets: (e.bullets ?? []).join("\n"),
              }))
            : [vazioExperiencia()]
        );
        setFormacao((curriculo.formacao ?? []).join("\n"));
        setCursos((curriculo.cursos ?? []).join("\n"));
        setProjetos((curriculo.projetos ?? []).join("\n"));
      }
      if (prefs) {
        setCargosAlvo((prefs.cargos_alvo ?? []).join("\n"));
        setPalavrasChave((prefs.palavras_chave ?? []).join(", "));
        setRegioes((prefs.regioes ?? []).join(", "));
      }
      setCarregando(false);
    }
    carregar().catch((e) => {
      setErro(e.message);
      setCarregando(false);
    });
  }, [session]);

  function atualizarExperiencia(idx, campo, valor) {
    setExperiencias((prev) => prev.map((e, i) => (i === idx ? { ...e, [campo]: valor } : e)));
  }

  function adicionarExperiencia() {
    setExperiencias((prev) => [...prev, vazioExperiencia()]);
  }

  function removerExperiencia(idx) {
    setExperiencias((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSalvando(true);
    setErro(null);
    setSalvo(false);
    const userId = session.user.id;

    try {
      const { error: e1 } = await supabase
        .from("profiles")
        .update({
          nome_completo: nomeCompleto,
          localizacao,
          telegram_chat_id: telegramChatId || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId);
      if (e1) throw e1;

      const { error: e2 } = await supabase
        .from("curriculos")
        .update({
          resumo_profissional: resumoProfissional,
          habilidades: csv(habilidades),
          experiencias: experiencias
            .filter((exp) => exp.cargo || exp.empresa)
            .map((exp) => ({
              cargo: exp.cargo,
              empresa: exp.empresa,
              periodo: exp.periodo,
              bullets: linhas(exp.bullets),
            })),
          formacao: linhas(formacao),
          cursos: linhas(cursos),
          projetos: linhas(projetos),
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId);
      if (e2) throw e2;

      const { error: e3 } = await supabase
        .from("preferencias")
        .update({
          cargos_alvo: linhas(cargosAlvo),
          palavras_chave: csv(palavrasChave),
          regioes: csv(regioes),
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId);
      if (e3) throw e3;

      setSalvo(true);
    } catch (err) {
      setErro(err.message);
    } finally {
      setSalvando(false);
    }
  }

  if (carregando) return <p className="carregando">Carregando...</p>;

  return (
    <div className="onboarding">
      <h1>Configure seu perfil</h1>
      <p className="ajuda">
        Isso é a fonte fixa de verdade usada para gerar seus currículos — o sistema nunca inventa
        experiência além do que você preencher aqui.
      </p>

      <form onSubmit={handleSubmit}>
        <section>
          <h2>Dados pessoais</h2>
          <label>
            Nome completo
            <input value={nomeCompleto} onChange={(e) => setNomeCompleto(e.target.value)} required />
          </label>
          <label>
            Localização
            <input
              value={localizacao}
              onChange={(e) => setLocalizacao(e.target.value)}
              placeholder="Cidade, UF"
            />
          </label>
          <label>
            Telegram Chat ID
            <input
              value={telegramChatId}
              onChange={(e) => setTelegramChatId(e.target.value)}
              placeholder="Fale com @userinfobot no Telegram pra pegar o seu"
            />
          </label>
        </section>

        <section>
          <h2>Currículo</h2>
          <label>
            Resumo profissional
            <textarea
              rows={4}
              value={resumoProfissional}
              onChange={(e) => setResumoProfissional(e.target.value)}
            />
          </label>
          <label>
            Habilidades técnicas (separadas por vírgula)
            <input value={habilidades} onChange={(e) => setHabilidades(e.target.value)} />
          </label>

          <h3>Experiência profissional</h3>
          {experiencias.map((exp, idx) => (
            <div className="cartao-experiencia" key={idx}>
              <div className="linha-dupla">
                <input
                  placeholder="Cargo"
                  value={exp.cargo}
                  onChange={(e) => atualizarExperiencia(idx, "cargo", e.target.value)}
                />
                <input
                  placeholder="Empresa"
                  value={exp.empresa}
                  onChange={(e) => atualizarExperiencia(idx, "empresa", e.target.value)}
                />
              </div>
              <input
                placeholder="Período (ex: Jul/2023 – Atual)"
                value={exp.periodo}
                onChange={(e) => atualizarExperiencia(idx, "periodo", e.target.value)}
              />
              <textarea
                placeholder="Bullets — um por linha"
                rows={3}
                value={exp.bullets}
                onChange={(e) => atualizarExperiencia(idx, "bullets", e.target.value)}
              />
              {experiencias.length > 1 && (
                <button type="button" className="link-remover" onClick={() => removerExperiencia(idx)}>
                  Remover
                </button>
              )}
            </div>
          ))}
          <button type="button" onClick={adicionarExperiencia}>
            + Adicionar experiência
          </button>

          <label>
            Formação acadêmica (uma por linha)
            <textarea rows={3} value={formacao} onChange={(e) => setFormacao(e.target.value)} />
          </label>
          <label>
            Cursos complementares (um por linha)
            <textarea rows={3} value={cursos} onChange={(e) => setCursos(e.target.value)} />
          </label>
          <label>
            Projetos paralelos (um por linha)
            <textarea rows={2} value={projetos} onChange={(e) => setProjetos(e.target.value)} />
          </label>
        </section>

        <section>
          <h2>Preferências de busca</h2>
          <label>
            Cargos-alvo (um por linha)
            <textarea rows={3} value={cargosAlvo} onChange={(e) => setCargosAlvo(e.target.value)} />
          </label>
          <label>
            Palavras-chave de relevância (separadas por vírgula)
            <textarea rows={2} value={palavrasChave} onChange={(e) => setPalavrasChave(e.target.value)} />
          </label>
          <label>
            Regiões de interesse (separadas por vírgula)
            <input value={regioes} onChange={(e) => setRegioes(e.target.value)} />
          </label>
        </section>

        {erro && <p className="erro">{erro}</p>}
        {salvo && <p className="sucesso">Salvo com sucesso.</p>}

        <button type="submit" disabled={salvando} className="botao-principal">
          {salvando ? "Salvando..." : "Salvar"}
        </button>
      </form>
    </div>
  );
}
