import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase.js";

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
    <div className="admin">
      <h1>Painel do administrador</h1>
      <p className="subtitulo">Saúde geral do VagaMatch — dados em tempo real via Supabase.</p>

      <section className="cards">
        <div className="card">
          <span className="card-numero">{m.totalUsuarios}</span>
          <span className="card-label">Usuários cadastrados</span>
        </div>
        <div className="card">
          <span className="card-numero">{m.buscaAtiva}</span>
          <span className="card-label">Com busca ativa</span>
        </div>
        <div className="card">
          <span className="card-numero">{m.disparoManual}</span>
          <span className="card-label">Em modo disparo manual</span>
        </div>
        <div className="card">
          <span className="card-numero">{m.cadastrosUltimos7Dias}</span>
          <span className="card-label">Cadastros (últimos 7 dias)</span>
        </div>
        <div className="card">
          <span className="card-numero">{m.vagasNotificadas7Dias}</span>
          <span className="card-label">Vagas notificadas (7 dias)</span>
        </div>
        <div className="card card-alerta">
          <span className="card-numero">{m.vagasComErro}</span>
          <span className="card-label">Vagas com erro (total)</span>
        </div>
      </section>

      <section>
        <h2>Assinaturas</h2>
        <ul className="lista-metricas">
          {Object.entries(m.porAssinatura).map(([status, qtd]) => (
            <li key={status}>
              <strong>{status}</strong>: {qtd}
            </li>
          ))}
        </ul>
        <p className="nota">
          Billing ainda é manual (sem gateway integrado). Atualize <code>assinatura_status</code> direto no
          Supabase até integrar Stripe/Mercado Pago.
        </p>
      </section>

      <section>
        <h2>Recorrência</h2>
        <ul className="lista-metricas">
          {Object.entries(m.porRecorrencia).map(([tipo, qtd]) => (
            <li key={tipo}>
              <strong>{tipo}</strong>: {qtd}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
