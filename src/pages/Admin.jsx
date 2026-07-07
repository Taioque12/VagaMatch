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
        // Agregação inteira roda no Postgres (admin_metricas(), migration 007) — antes isso
        // baixava toda linha de profiles/preferencias/vagas_vistas pro navegador só pra contar.
        const { data, error } = await supabase.rpc("admin_metricas");
        if (error) throw error;
        setMetricas(data);
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
