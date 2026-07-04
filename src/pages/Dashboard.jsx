import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase.js";
import { useAuth } from "../lib/AuthContext.jsx";

const STATUS_LABEL = {
  descoberta: "Descoberta",
  notificada: "Notificada",
  candidatado: "Candidatado",
  descartada: "Descartada",
  erro: "Erro",
};

const FILTROS = [
  { valor: "todas", label: "Todas" },
  { valor: "notificada", label: "Notificadas" },
  { valor: "candidatado", label: "Candidatadas" },
  { valor: "descartada", label: "Descartadas" },
];

export function Dashboard() {
  const { session } = useAuth();
  const [vagas, setVagas] = useState(null);
  const [erro, setErro] = useState(null);
  const [filtro, setFiltro] = useState("todas");
  const [buscaAtiva, setBuscaAtiva] = useState(null);
  const [salvandoAtivo, setSalvandoAtivo] = useState(false);
  const [ehAdmin, setEhAdmin] = useState(false);

  useEffect(() => {
    if (!session) return;
    const userId = session.user.id;

    supabase
      .from("vagas_vistas")
      .select("*")
      .eq("user_id", userId)
      .order("data_encontrada", { ascending: false })
      .limit(200)
      .then(({ data, error }) => {
        if (error) setErro(error.message);
        else setVagas(data);
      });

    supabase
      .from("preferencias")
      .select("ativo")
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data }) => setBuscaAtiva(data?.ativo ?? true));

    supabase
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data }) => setEhAdmin(data?.role === "admin"));
  }, [session]);

  const stats = useMemo(() => {
    if (!vagas) return null;
    return {
      total: vagas.length,
      notificadas: vagas.filter((v) => v.status === "notificada").length,
      candidatadas: vagas.filter((v) => v.status === "candidatado").length,
      descartadas: vagas.filter((v) => v.status === "descartada").length,
    };
  }, [vagas]);

  const vagasFiltradas = useMemo(() => {
    if (!vagas) return null;
    if (filtro === "todas") return vagas;
    return vagas.filter((v) => v.status === filtro);
  }, [vagas, filtro]);

  async function mudarStatus(vaga, novoStatus) {
    const { error } = await supabase
      .from("vagas_vistas")
      .update({ status: novoStatus })
      .eq("id", vaga.id);
    if (error) {
      setErro(error.message);
      return;
    }
    setVagas((prev) => prev.map((v) => (v.id === vaga.id ? { ...v, status: novoStatus } : v)));
  }

  async function alternarBusca() {
    setSalvandoAtivo(true);
    const novo = !buscaAtiva;
    const { error } = await supabase
      .from("preferencias")
      .update({ ativo: novo, updated_at: new Date().toISOString() })
      .eq("user_id", session.user.id);
    setSalvandoAtivo(false);
    if (error) {
      setErro(error.message);
      return;
    }
    setBuscaAtiva(novo);
  }

  async function sair() {
    await supabase.auth.signOut();
  }

  return (
    <div className="dashboard">
      <header className="topo">
        <h1>VagaMatch</h1>
        <nav>
          <Link to="/onboarding">Meu perfil</Link>
          {ehAdmin && <Link to="/admin">Painel admin</Link>}
          <button onClick={sair}>Sair</button>
        </nav>
      </header>

      <div className="painel-busca">
        <div>
          <strong>Busca automática:</strong>{" "}
          {buscaAtiva === null ? "..." : buscaAtiva ? "✅ ativa" : "⏸️ pausada"}
        </div>
        <button onClick={alternarBusca} disabled={salvandoAtivo || buscaAtiva === null}>
          {buscaAtiva ? "Pausar busca" : "Retomar busca"}
        </button>
      </div>

      {stats && (
        <div className="cartoes-stats">
          <div className="stat">
            <span className="stat-numero">{stats.total}</span>
            <span className="stat-label">Encontradas</span>
          </div>
          <div className="stat">
            <span className="stat-numero">{stats.notificadas}</span>
            <span className="stat-label">Notificadas</span>
          </div>
          <div className="stat">
            <span className="stat-numero">{stats.candidatadas}</span>
            <span className="stat-label">Candidatadas</span>
          </div>
          <div className="stat">
            <span className="stat-numero">{stats.descartadas}</span>
            <span className="stat-label">Descartadas</span>
          </div>
        </div>
      )}

      <div className="filtros">
        {FILTROS.map((f) => (
          <button
            key={f.valor}
            className={filtro === f.valor ? "filtro ativo" : "filtro"}
            onClick={() => setFiltro(f.valor)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {erro && <p className="erro">{erro}</p>}
      {vagasFiltradas === null && !erro && <p className="carregando">Carregando...</p>}
      {vagasFiltradas?.length === 0 && (
        <p className="ajuda">
          Nenhuma vaga aqui ainda. Confira se seu perfil está completo em{" "}
          <Link to="/onboarding">Meu perfil</Link> e se a busca está ativa.
        </p>
      )}

      <ul className="lista-vagas">
        {vagasFiltradas?.map((v) => (
          <li key={v.id} className={`vaga status-${v.status}`}>
            <div className="vaga-cabecalho">
              <strong>{v.titulo}</strong>
              <span className="score">⭐ {v.score}</span>
            </div>
            <p className="vaga-empresa">
              {v.empresa} — {v.fonte} ·{" "}
              {new Date(v.data_encontrada).toLocaleDateString("pt-BR")}
            </p>
            <div className="vaga-rodape">
              <span className="badge">{STATUS_LABEL[v.status] ?? v.status}</span>
              {v.feedback && (
                <span className="badge">{v.feedback === "positivo" ? "👍" : "👎"}</span>
              )}
              {v.url && (
                <a href={v.url} target="_blank" rel="noreferrer">
                  Ver vaga
                </a>
              )}
              <span className="espaco" />
              {v.status !== "candidatado" && (
                <button className="acao" onClick={() => mudarStatus(v, "candidatado")}>
                  Me candidatei
                </button>
              )}
              {v.status !== "descartada" && (
                <button className="acao secundaria" onClick={() => mudarStatus(v, "descartada")}>
                  Descartar
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
