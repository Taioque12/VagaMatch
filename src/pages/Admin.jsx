import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase.js";
import { useAuth } from "../lib/AuthContext.jsx";
import { ThemeToggle } from "../components/ThemeToggle.jsx";
import "../dashboard-premium-v2.css";

export function Admin() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);
  const [metricas, setMetricas] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!session) {
      navigate("/login");
      return;
    }

    async function carregar() {
      // Verifica se usuário é admin
      const { data: perfil, error: erroRoleCheck } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", session.user.id)
        .maybeSingle();

      if (erroRoleCheck || perfil?.role !== "admin") {
        setErro("Acesso negado. Você não é admin.");
        setTimeout(() => navigate("/dashboard"), 1500);
        setCarregando(false);
        return;
      }
      setIsAdmin(true);

      setCarregando(true);
      setErro(null);
      try {
        const [{ data: perfis, error: e1 }, { data: prefs, error: e2 }, { data: vagas, error: e3 }] =
          await Promise.all([
            supabase.from("profiles").select("id, plano, role, assinatura_status, assinatura_recorrencia, created_at"),
            supabase.from("preferencias").select("user_id, ativo, disparo_manual"),
            supabase.from("vagas_vistas").select("status, data_encontrada"),
          ]);
        if (e1) throw e1;
        if (e2) throw e2;
        if (e3) throw e3;

        const totalUsuarios = perfis.length;
        const buscaAtiva = prefs.filter((p) => p.ativo).length;
        const disparoManual = prefs.filter((p) => p.disparo_manual).length;

        const porAssinatura = perfis.reduce((acc, p) => {
          acc[p.assinatura_status] = (acc[p.assinatura_status] ?? 0) + 1;
          return acc;
        }, {});

        const porRecorrencia = perfis.reduce((acc, p) => {
          const chave = p.assinatura_recorrencia ?? "sem_recorrencia";
          acc[chave] = (acc[chave] ?? 0) + 1;
          return acc;
        }, {});

        const seteDiasAtras = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const cadastrosUltimos7Dias = perfis.filter((p) => p.created_at >= seteDiasAtras).length;

        const vagasNotificadas7Dias = vagas.filter(
          (v) => v.status === "notificada" && v.data_encontrada >= seteDiasAtras
        ).length;
        const vagasComErro = vagas.filter((v) => v.status === "erro").length;

        setMetricas({
          totalUsuarios,
          buscaAtiva,
          disparoManual,
          porAssinatura,
          porRecorrencia,
          cadastrosUltimos7Dias,
          vagasNotificadas7Dias,
          vagasComErro,
        });
      } catch (e) {
        setErro(e.message);
      } finally {
        setCarregando(false);
      }
    }
    carregar();
  }, [session, navigate]);

  if (!session || !isAdmin) return null; // Aguarda validação
  if (carregando) {
    return (
      <div className="dbv2-page" style={{ justifyContent: "center" }}>
        <p className="dbv2-metric-sub">Carregando métricas...</p>
      </div>
    );
  }
  if (erro) {
    return (
      <div className="dbv2-page" style={{ justifyContent: "center" }}>
        <p className="erro">Erro ao carregar métricas: {erro}</p>
      </div>
    );
  }

  const m = metricas;

  const linhaLista = {
    padding: "10px 0",
    borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "12px",
  };

  return (
    <div className="dbv2-page">
      <nav className="lp-nav" style={{ width: "100%", justifyContent: "space-between" }}>
        <Link to="/dashboard" className="lp-logo" style={{ textDecoration: "none" }}>
          <span className="lp-logo-marca" />
          VagaMatch (Admin)
        </Link>
        <div style={{ display: "flex", gap: "16px", alignItems: "center" }}>
          <ThemeToggle />
          <Link to="/dashboard" className="dbv2-btn-ghost">Voltar ao dashboard</Link>
        </div>
      </nav>

      <div className="dbv2-coluna" style={{ marginTop: 36 }}>
        <div>
          <h1 style={{ margin: "0 0 8px", fontFamily: "'Outfit', sans-serif", fontWeight: 800, letterSpacing: "-0.02em", fontSize: "clamp(26px, 6vw, 36px)", color: "#f8fafc" }}>
            Painel do Administrador
          </h1>
          <p className="dbv2-metric-sub" style={{ margin: 0, fontSize: 15 }}>
            Saúde geral do VagaMatch — dados em tempo real via Supabase.
          </p>
        </div>

        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "24px" }}>
          <div className="dbv2-metric">
            <span className="dbv2-metric-label">Usuários Cadastrados</span>
            <span className="dbv2-metric-valor" style={{ fontSize: "clamp(36px, 4vw, 48px)" }}>{m.totalUsuarios}</span>
          </div>
          <div className="dbv2-metric">
            <span className="dbv2-metric-label">Com Busca Ativa</span>
            <span className="dbv2-metric-valor" style={{ fontSize: "clamp(36px, 4vw, 48px)" }}>{m.buscaAtiva}</span>
          </div>
          <div className="dbv2-metric">
            <span className="dbv2-metric-label">Cadastros (7 dias)</span>
            <span className="dbv2-metric-valor" style={{ fontSize: "clamp(36px, 4vw, 48px)" }}>{m.cadastrosUltimos7Dias}</span>
          </div>
          <div className="dbv2-metric">
            <span className="dbv2-metric-label">Vagas Notificadas (7 dias)</span>
            <span className="dbv2-metric-valor" style={{ fontSize: "clamp(36px, 4vw, 48px)" }}>{m.vagasNotificadas7Dias}</span>
          </div>
        </section>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "24px" }}>
          <section className="dbv2-card">
            <h2 className="dbv2-card-titulo" style={{ margin: 0, borderBottom: "1px solid rgba(255, 255, 255, 0.08)", paddingBottom: "14px" }}>Assinaturas</h2>
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {Object.entries(m.porAssinatura).map(([status, qtd]) => (
                <li key={status} style={linhaLista}>
                  <strong style={{ color: "#10b981" }}>{status || "Grátis"}</strong>
                  <span className="dbv2-metric-sub" style={{ fontVariantNumeric: "tabular-nums" }}>{qtd} usuário(s)</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="dbv2-card">
            <h2 className="dbv2-card-titulo" style={{ margin: 0, borderBottom: "1px solid rgba(255, 255, 255, 0.08)", paddingBottom: "14px" }}>Recorrência</h2>
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {Object.entries(m.porRecorrencia).map(([tipo, qtd]) => (
                <li key={tipo} style={linhaLista}>
                  <strong style={{ color: "#f8fafc" }}>{tipo === "sem_recorrencia" ? "Sem Assinatura" : tipo}</strong>
                  <span className="dbv2-metric-sub" style={{ fontVariantNumeric: "tabular-nums" }}>{qtd} usuário(s)</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
