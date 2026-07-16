import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase.js";
import { useAuth } from "../lib/AuthContext.jsx";
import { PRECOS, PLANO_FEATURES, PLANO_PLUS_FEATURES } from "../lib/planos.js";
import "../dashboard-premium-v2.css";

const PLANO_LABEL = {
  match: "Match",
  match_plus: "Match Plus",
};

const cardBase = {
  flex: "1 1 280px",
  maxWidth: 380,
  textAlign: "left",
  gap: 0,
};

const cardDestaque = {
  border: "1px solid rgba(16, 185, 129, 0.35)",
  boxShadow:
    "0 20px 60px -18px rgba(16, 185, 129, 0.4), 0 8px 32px -12px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(236, 253, 245, 0.12), inset 0 0 60px -20px rgba(16, 185, 129, 0.18)",
};

const precoStyle = {
  margin: "0 0 1.2rem",
  fontFamily: "'Outfit', sans-serif",
  fontSize: "2.4rem",
  fontWeight: 800,
  letterSpacing: "-0.03em",
  fontVariantNumeric: "tabular-nums",
  color: "#f8fafc",
};

function PlanoCard({ nome, descricao, preco, features, destaque, onAssinar, loading, loadingPlano }) {
  const esteCarregando = loading && loadingPlano;
  return (
    <div className="dbv2-card" style={{ ...cardBase, ...(destaque ? cardDestaque : {}) }}>
      {destaque && (
        <span className="badge" style={{ alignSelf: "flex-start", marginBottom: "0.6rem" }}>Recomendado</span>
      )}
      <h2 className="dbv2-card-titulo" style={{ margin: "0 0 0.3rem" }}>{nome}</h2>
      <p className="dbv2-metric-sub" style={{ margin: "0 0 1rem" }}>{descricao}</p>
      <p style={precoStyle}>
        R$ {preco}
        <span style={{ fontSize: "0.9rem", fontWeight: 600, letterSpacing: 0, color: "#94a3b8" }}>/mês</span>
      </p>
      <ul style={{ listStyle: "none", padding: 0, margin: "0 0 1.5rem", display: "grid", gap: "0.6rem", fontSize: "0.92rem" }}>
        {features.map((f) => (
          <li key={f} style={{ display: "flex", gap: "0.5rem", alignItems: "baseline" }}>
            <span style={{ color: "#10b981", fontWeight: 700 }}>✓</span>
            <span>{f}</span>
          </li>
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
    <div className="dbv2-page">
      <nav className="lp-nav" style={{ width: "100%" }}>
        <Link to="/dashboard" className="lp-logo" style={{ textDecoration: "none" }}>
          <span className="lp-logo-marca" />
          VagaMatch
        </Link>
        <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
          <Link to="/dashboard" className="dbv2-btn-ghost">Voltar ao dashboard</Link>
        </div>
      </nav>

      <div className="dbv2-coluna" style={{ marginTop: "4vh", textAlign: "center", alignItems: "center" }}>
        <div>
          <h1 style={{ margin: 0, fontFamily: "'Outfit', sans-serif", fontWeight: 800, letterSpacing: "-0.02em", fontSize: "clamp(28px, 6vw, 40px)", color: "#f8fafc" }}>
            Faça upgrade do seu plano
          </h1>
          <p className="dbv2-metric-sub" style={{ maxWidth: 520, margin: "0.8rem auto 0", fontSize: 15 }}>
            Deixe o robô buscar vagas para você o dia inteiro, com currículo e mensagem prontos para cada oportunidade.
          </p>
        </div>

        {erro && <p className="erro">{erro}</p>}

        {perfil === null && !erro && <p className="dbv2-metric-sub">Carregando...</p>}

        {assinanteAtivo && (
          <div className="dbv2-card" style={{ maxWidth: 420, width: "100%", textAlign: "center", gap: 0 }}>
            <h2 className="dbv2-card-titulo" style={{ margin: "0 0 0.5rem" }}>Você já é assinante 🎉</h2>
            <p style={{ margin: 0, fontSize: "1.1rem" }}>
              Plano atual: <strong style={{ color: "#10b981" }}>{PLANO_LABEL[perfil.plano] ?? perfil.plano}</strong>
            </p>
            <p className="dbv2-metric-sub" style={{ margin: "0.4rem 0 1.2rem" }}>
              Status da assinatura: <strong>{perfil.assinatura_status}</strong>
            </p>
            <Link to="/dashboard" className="botao-principal" style={{ textDecoration: "none", display: "inline-block", alignSelf: "center" }}>
              Ir para o Dashboard
            </Link>
          </div>
        )}

        {perfil !== null && !assinanteAtivo && (
          <>
            <div style={{ display: "inline-flex", gap: "0.5rem" }}>
              <button
                type="button"
                className={recorrencia === "mensal" ? "dbv2-filtro ativo" : "dbv2-filtro"}
                onClick={() => setRecorrencia("mensal")}
              >
                Mensal
              </button>
              <button
                type="button"
                className={recorrencia === "anual" ? "dbv2-filtro ativo" : "dbv2-filtro"}
                onClick={() => setRecorrencia("anual")}
              >
                Anual (-18%)
              </button>
            </div>

            <div style={{ display: "flex", gap: "1.5rem", justifyContent: "center", flexWrap: "wrap", width: "100%" }}>
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
