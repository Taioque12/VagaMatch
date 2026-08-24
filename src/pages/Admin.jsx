import { useEffect, useState } from "react";
import { BriefcaseBusiness, ShieldCheck, UserRound } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase.js";
import { useAuth } from "../lib/AuthContext.jsx";
import "../dashboard-premium-v2.css";

export function Admin() {
  const { session } = useAuth();
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);
  const [metricas, setMetricas] = useState(null);

  useEffect(() => {
    if (!session) return;

    async function carregar() {
      setCarregando(true);
      setErro(null);
      try {
        const [{ data: perfis, error: e1 }, { data: prefs, error: e2 }, { data: vagas, error: e3 }] =
          await Promise.all([
            supabase.from("profiles").select("id, nome_completo, telegram_chat_id, plano, role, assinatura_status, assinatura_recorrencia, created_at"),
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

        // Lista de usuarios cruzada com preferencias
        const listaUsuarios = perfis.map(p => {
          const pref = prefs.find(pr => pr.user_id === p.id);
          return {
            ...p,
            busca_ativa: pref ? pref.ativo : false
          };
        }).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        setMetricas({
          totalUsuarios,
          buscaAtiva,
          disparoManual,
          porAssinatura,
          porRecorrencia,
          cadastrosUltimos7Dias,
          vagasNotificadas7Dias,
          vagasComErro,
          listaUsuarios,
        });
      } catch (e) {
        setErro(e.message);
      } finally {
        setCarregando(false);
      }
    }
    carregar();
  }, [session]);

  if (!session) return null;
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

  return (
    <div className="dbv2-page app-page app-page-admin">
      <nav className="lp-nav" aria-label="Navegação principal">
        <Link to="/dashboard" className="lp-logo" style={{ textDecoration: "none" }}>
          <span className="lp-logo-marca">V</span>
          VagaMatch
        </Link>
        <div className="dbv2-primary-nav">
          <span className="dbv2-nav-label">Área do candidato</span>
          <Link to="/dashboard" className="dbv2-nav-link"><BriefcaseBusiness size={18} /> Oportunidades</Link>
          <Link to="/onboarding" className="dbv2-nav-link"><UserRound size={18} /> Meu perfil</Link>
          <Link to="/admin" className="dbv2-nav-link ativo"><ShieldCheck size={18} /> Administração</Link>
        </div>
        <details className="dbv2-user-menu">
          <summary aria-label="Abrir menu da conta">Menu</summary>
          <div className="dbv2-user-menu-conteudo">
            <span className="dbv2-avatar">{(session?.user?.email || "?").slice(0, 2).toUpperCase()}</span>
            <span className="dbv2-account-email">{session?.user?.email}</span>
            <Link to="/dashboard" className="dbv2-btn-ghost"><BriefcaseBusiness size={16} /> Voltar para vagas</Link>
          </div>
        </details>
      </nav>

      <main className="dbv2-coluna app-content admin-content">
        <header className="dbv2-page-header app-page-heading">
          <p className="dbv2-page-kicker">Operação VagaMatch</p>
          <h1>Administração</h1>
          <p className="app-page-description">
            Saúde geral do VagaMatch — dados em tempo real via Supabase.
          </p>
        </header>

        <section className="admin-metrics">
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

        <div className="admin-summary-grid">
          <section className="dbv2-card">
            <h2 className="dbv2-card-titulo admin-section-title">Assinaturas</h2>
            <ul className="admin-list">
              {Object.entries(m.porAssinatura).map(([status, qtd]) => (
                <li key={status}>
                  <strong>{!status || status === "null" ? "Grátis" : status}</strong>
                  <span className="dbv2-metric-sub" style={{ fontVariantNumeric: "tabular-nums" }}>{qtd} usuário(s)</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="dbv2-card">
            <h2 className="dbv2-card-titulo admin-section-title">Recorrência</h2>
            <ul className="admin-list">
              {Object.entries(m.porRecorrencia).map(([tipo, qtd]) => (
                <li key={tipo}>
                  <strong>{tipo === "sem_recorrencia" ? "Sem assinatura" : tipo}</strong>
                  <span className="dbv2-metric-sub" style={{ fontVariantNumeric: "tabular-nums" }}>{qtd} usuário(s)</span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <section className="dbv2-card admin-users-card">
          <h2 className="dbv2-card-titulo">Gestão de usuários</h2>
          <div className="admin-table-wrap"><table className="admin-table">
            <thead>
              <tr>
                <th style={{ padding: "12px 8px" }}>Nome</th>
                <th style={{ padding: "12px 8px" }}>Status Assinatura</th>
                <th style={{ padding: "12px 8px" }}>Busca Ativa</th>
                <th style={{ padding: "12px 8px" }}>Telegram ID</th>
                <th style={{ padding: "12px 8px" }}>Cadastro</th>
              </tr>
            </thead>
            <tbody>
              {m.listaUsuarios.map(u => (
                <tr key={u.id}>
                  <td>{u.nome_completo || "Sem nome"}</td>
                  <td style={{ padding: "12px 8px" }}>
                    <span className={u.assinatura_status === "ativa" ? "admin-status ativo" : "admin-status"}>
                      {u.assinatura_status === "ativa" ? "Pago" : "Grátis"}
                    </span>
                  </td>
                  <td style={{ padding: "12px 8px" }}>
                    <span className={u.busca_ativa ? "admin-search-status ativo" : "admin-search-status"}>
                      {u.busca_ativa ? "Sim" : "Não"}
                    </span>
                  </td>
                  <td className="admin-telegram-id">{u.telegram_chat_id || "Não vinculado"}</td>
                  <td>{new Date(u.created_at).toLocaleDateString("pt-BR")}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </section>
      </main>
    </div>
  );
}
