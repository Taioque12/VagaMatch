import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase.js";
import { useAuth } from "../lib/AuthContext.jsx";
import { ThemeToggle } from "../components/ThemeToggle.jsx";
import { PRECOS, PLANO_FEATURES, PLANO_PLUS_FEATURES } from "../lib/planos.js";

const PLANO_LABEL = {
  match: "Match",
  match_plus: "Match Plus",
};

const cardStyle = {
  flex: "1 1 280px",
  maxWidth: 380,
  padding: "1.8rem",
  backgroundColor: "var(--bg-glass)",
  borderRadius: "16px",
  border: "1px solid var(--border-glass)",
  display: "flex",
  flexDirection: "column",
  textAlign: "left",
};

function PlanoCard({ nome, descricao, preco, features, destaque, onAssinar, loading, loadingPlano }) {
  const esteCarregando = loading && loadingPlano;
  return (
    <div style={{ ...cardStyle, ...(destaque ? { border: "1.5px solid var(--brand-green, #22c55e)" } : {}) }}>
      {destaque && (
        <span className="badge" style={{ alignSelf: "flex-start", marginBottom: "0.6rem" }}>Recomendado</span>
      )}
      <h2 style={{ margin: "0 0 0.3rem", fontSize: "1.4rem" }}>{nome}</h2>
      <p className="ajuda" style={{ margin: "0 0 1rem" }}>{descricao}</p>
      <p style={{ margin: "0 0 1.2rem", fontSize: "2rem", fontWeight: 800 }}>
        R$ {preco}
        <span style={{ fontSize: "0.9rem", fontWeight: 500 }}>/mês</span>
      </p>
      <ul style={{ listStyle: "none", padding: 0, margin: "0 0 1.5rem", display: "grid", gap: "0.5rem", fontSize: "0.92rem" }}>
        {features.map((f) => (
          <li key={f}>✓ {f}</li>
        ))}
      </ul>
      <button
        className={destaque ? "acao" : "acao secundaria"}
        style={{ width: "100%", marginTop: "auto" }}
        onClick={onAssinar}
        disabled={loading}
      >
        {esteCarregando ? "Redirecionando..." : `Assinar ${nome}`}
      </button>
    </div>
  );
}

export function Upgrade() {
  const { session } = useAuth();
  const [recorrencia, setRecorrencia] = useState("mensal");
  const [carregandoPlano, setCarregandoPlano] = useState(null); // 'match' | 'match_plus' | null
  const [erro, setErro] = useState(null);
  const [perfil, setPerfil] = useState(null);

  useEffect(() => {
    if (!session) return;
    supabase
      .from("profiles")
      .select("plano, assinatura_status")
      .eq("id", session.user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) setErro(error.message);
        else setPerfil(data ?? {});
      });
  }, [session]);

  const preco = recorrencia === "mensal" ? PRECOS.monthlyPrice : PRECOS.annualMonthlyEquivalent;
  const precoPlus = recorrencia === "mensal" ? PRECOS.monthlyPricePlus : PRECOS.annualMonthlyEquivalentPlus;

  const assinanteAtivo =
    perfil && perfil.assinatura_status === "ativa" && (perfil.plano === "match" || perfil.plano === "match_plus");

  async function assinar(plano) {
    setErro(null);
    setCarregandoPlano(plano);
    try {
      const resp = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mp-checkout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ plano, recorrencia }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok || data?.error) {
        throw new Error(data?.error || `Erro ${resp.status}`);
      }
      if (!data?.init_point) throw new Error("Resposta inesperada do servidor.");
      window.location.href = data.init_point;
    } catch (e) {
      setErro("Não foi possível iniciar o pagamento. Tente novamente em instantes. (" + e.message + ")");
      setCarregandoPlano(null);
    }
  }

  return (
    <div className="lp lp-hero-bloco" style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <nav className="lp-nav">
        <Link to="/dashboard" className="lp-logo" style={{ textDecoration: "none" }}>
          <span className="lp-logo-marca" />
          VagaMatch
        </Link>
        <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
          <ThemeToggle />
          <Link to="/dashboard" className="lp-botao-claro">Voltar ao dashboard</Link>
        </div>
      </nav>

      <div className="onboarding onboarding-simples" style={{ textAlign: "center", marginTop: "4vh", paddingBottom: "4rem" }}>
        <h1>Faça upgrade do seu plano</h1>
        <p className="ajuda" style={{ maxWidth: 520, margin: "0.8rem auto 2rem" }}>
          Deixe o robô buscar vagas para você o dia inteiro, com currículo e mensagem prontos para cada oportunidade.
        </p>

        {erro && <p className="erro">{erro}</p>}

        {perfil === null && !erro && <p className="ajuda">Carregando...</p>}

        {assinanteAtivo && (
          <div style={{ ...cardStyle, margin: "0 auto", textAlign: "center" }}>
            <h2 style={{ margin: "0 0 0.5rem" }}>Você já é assinante 🎉</h2>
            <p style={{ margin: 0, fontSize: "1.1rem" }}>
              Plano atual: <strong>{PLANO_LABEL[perfil.plano] ?? perfil.plano}</strong>
            </p>
            <p className="ajuda" style={{ margin: "0.4rem 0 1.2rem" }}>
              Status da assinatura: <strong>{perfil.assinatura_status}</strong>
            </p>
            <Link to="/dashboard" className="botao-principal" style={{ textDecoration: "none", display: "inline-block" }}>
              Ir para o Dashboard
            </Link>
          </div>
        )}

        {perfil !== null && !assinanteAtivo && (
          <>
            <div style={{ display: "inline-flex", gap: "0.5rem", marginBottom: "2rem" }}>
              <button
                type="button"
                className={recorrencia === "mensal" ? "filtro ativo" : "filtro"}
                onClick={() => setRecorrencia("mensal")}
              >
                Mensal
              </button>
              <button
                type="button"
                className={recorrencia === "anual" ? "filtro ativo" : "filtro"}
                onClick={() => setRecorrencia("anual")}
              >
                Anual (-18%)
              </button>
            </div>

            <div style={{ display: "flex", gap: "1.5rem", justifyContent: "center", flexWrap: "wrap" }}>
              <PlanoCard
                nome="Match"
                descricao="Para quem quer testar sem compromisso"
                preco={preco}
                features={PLANO_FEATURES}
                onAssinar={() => assinar("match")}
                loading={carregandoPlano !== null}
                loadingPlano={carregandoPlano === "match"}
              />
              <PlanoCard
                nome="Match Plus"
                descricao="Mais fontes de vagas, velocidade máxima"
                preco={precoPlus}
                features={PLANO_PLUS_FEATURES}
                destaque
                onAssinar={() => assinar("match_plus")}
                loading={carregandoPlano !== null}
                loadingPlano={carregandoPlano === "match_plus"}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
