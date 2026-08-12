import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase.js";
import { useAuth } from "../lib/AuthContext.jsx";
import "../dashboard-premium-v2.css";

const PLANO_LABEL = {
  match: "Match",
  match_plus: "Match Plus",
};

export function Upgrade() {
  const { session } = useAuth();
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

  const assinanteAtivo =
    perfil && perfil.assinatura_status === "ativa" && (perfil.plano === "match" || perfil.plano === "match_plus");

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
          <div className="dbv2-card" style={{ maxWidth: 500, width: "100%", textAlign: "center", gap: "0.8rem" }}>
            <h2 className="dbv2-card-titulo" style={{ margin: 0 }}>Assinaturas em breve</h2>
            <p className="dbv2-metric-sub" style={{ margin: 0 }}>
              A contratação online está temporariamente indisponível. Você continua com acesso ao seu dashboard.
            </p>
            <Link to="/dashboard" className="botao-principal" style={{ textDecoration: "none", alignSelf: "center" }}>
              Voltar ao Dashboard
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
