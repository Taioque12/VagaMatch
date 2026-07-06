import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase.js";
import { ThemeToggle } from "../components/ThemeToggle.jsx";

export function Admin() {
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);
  const [metricas, setMetricas] = useState(null);

  useEffect(() => {
    async function carregar() {
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
  }, []);

  if (carregando) return <p className="carregando">Carregando métricas...</p>;
  if (erro) return <p className="erro">Erro ao carregar métricas: {erro}</p>;

  const m = metricas;

  return (
    <div className="lp lp-hero-bloco" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <nav className="lp-nav" style={{ justifyContent: 'space-between', padding: '32px' }}>
        <Link to="/" className="lp-logo" style={{ textDecoration: 'none' }}>
          <span className="lp-logo-marca" />
          VagaMatch (Admin)
        </Link>
        <ThemeToggle />
      </nav>

      <div className="dashboard">
        <h1 style={{ fontFamily: "Manrope", fontWeight: 800, fontSize: "36px", marginBottom: "8px" }}>Painel do Administrador</h1>
        <p className="subtitulo" style={{ marginBottom: "2rem", color: "var(--text-muted)" }}>Saúde geral do VagaMatch — dados em tempo real via Supabase.</p>

        <section className="cartoes-stats" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '2rem' }}>
          <div className="stat">
            <span className="stat-numero">{m.totalUsuarios}</span>
            <span className="stat-label">Usuários Cadastrados</span>
          </div>
          <div className="stat">
            <span className="stat-numero">{m.buscaAtiva}</span>
            <span className="stat-label">Com Busca Ativa</span>
          </div>
          <div className="stat">
            <span className="stat-numero">{m.cadastrosUltimos7Dias}</span>
            <span className="stat-label">Cadastros (7 dias)</span>
          </div>
          <div className="stat">
            <span className="stat-numero">{m.vagasNotificadas7Dias}</span>
            <span className="stat-label">Vagas Notificadas (7 dias)</span>
          </div>
        </section>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
          <section className="vaga">
            <h2 style={{ fontFamily: "Manrope", borderBottom: "1px solid var(--border-glass)", paddingBottom: "12px", marginBottom: "16px" }}>Assinaturas</h2>
            <ul style={{ listStyle: "none", padding: 0 }}>
              {Object.entries(m.porAssinatura).map(([status, qtd]) => (
                <li key={status} style={{ padding: "8px 0", borderBottom: "1px solid var(--border-glass)", display: "flex", justifyContent: "space-between" }}>
                  <strong style={{ color: "var(--primary)" }}>{status || "Grátis"}</strong>
                  <span>{qtd} usuário(s)</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="vaga">
            <h2 style={{ fontFamily: "Manrope", borderBottom: "1px solid var(--border-glass)", paddingBottom: "12px", marginBottom: "16px" }}>Recorrência</h2>
            <ul style={{ listStyle: "none", padding: 0 }}>
              {Object.entries(m.porRecorrencia).map(([tipo, qtd]) => (
                <li key={tipo} style={{ padding: "8px 0", borderBottom: "1px solid var(--border-glass)", display: "flex", justifyContent: "space-between" }}>
                  <strong style={{ color: "var(--text-main)" }}>{tipo === "sem_recorrencia" ? "Sem Assinatura" : tipo}</strong>
                  <span>{qtd} usuário(s)</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
