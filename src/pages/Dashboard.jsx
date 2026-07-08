import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase.js";
import { useAuth } from "../lib/AuthContext.jsx";
import { ThemeToggle } from "../components/ThemeToggle.jsx";

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
    <div className="lp lp-hero-bloco" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <nav className="lp-nav">
        <Link to="/dashboard" className="lp-logo" style={{ textDecoration: 'none' }}>
          <span className="lp-logo-marca" />
          VagaMatch
        </Link>
        <div style={{ display: "flex", gap: "16px", alignItems: "center", flexWrap: "wrap" }}>
          <ThemeToggle />
          <div className="user-info">
            <span className="user-email">{session?.user?.email}</span>
          </div>
          <Link to="/onboarding" className="lp-botao-claro">Meu perfil</Link>
          {ehAdmin && <Link to="/admin" className="lp-botao-claro">Painel admin</Link>}
          <button className="btn-sair" onClick={sair}>Sair</button>
        </div>
      </nav>
      <div className="dashboard-container">
        {/* Sidebar Esquerda: Controles e Stats */}
        <aside className="dashboard-sidebar">
          <div className="painel-busca">
            <div>
              <strong style={{display: 'block', marginBottom: '0.3rem'}}>Busca automática</strong>
              <span className={`status-busca ${buscaAtiva ? 'ativo' : 'pausado'}`}>
                {buscaAtiva === null ? "..." : buscaAtiva ? "Em andamento" : "Pausada"}
              </span>
            </div>
            <button className="acao" onClick={alternarBusca} disabled={salvandoAtivo || buscaAtiva === null}>
              {buscaAtiva ? "Pausar" : "Retomar"}
            </button>
          </div>

          <h3 className="sidebar-titulo">Resumo</h3>
          {stats && (
            <div className="cartoes-stats-vertical">
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

          <h3 className="sidebar-titulo">Filtros</h3>
          <div className="filtros-vertical">
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
        </aside>

        {/* Área Principal: Lista de Vagas */}
        <main className="dashboard-main">
          {erro && <p className="erro">{erro}</p>}
          {vagasFiltradas === null && !erro && <p className="carregando">Carregando vagas com match...</p>}
          {vagasFiltradas?.length === 0 && (
            <div className="estado-vazio">
              <div className="estado-vazio-icone">🔍</div>
              <p>Nenhuma vaga aqui ainda.</p>
              <span>Confira se seu <Link to="/onboarding">perfil está completo</Link> e se a busca está ativa.</span>
            </div>
          )}

          <div className="grid-vagas">
            {vagasFiltradas?.map((v) => (
              <div key={v.id} className={`vaga-card status-${v.status}`}>
                <div className="vaga-card-score">
                  <div className="score-circle">
                    <span className="score-number">{v.score}</span>
                    <span className="score-label">Match</span>
                  </div>
                </div>
                
                <div className="vaga-card-content">
                  <div className="vaga-cabecalho">
                    <strong>{v.titulo}</strong>
                  </div>
                  <p className="vaga-empresa">
                    {v.empresa} — {v.fonte} · {new Date(v.data_encontrada).toLocaleDateString("pt-BR")}
                  </p>
                  
                  {v.motivo_ia && (
                    <div className="vaga-motivo">
                      <span className="motivo-icon">💡</span>
                      <p>{v.motivo_ia}</p>
                    </div>
                  )}

                  <div className="vaga-rodape">
                    <span className="badge">{STATUS_LABEL[v.status] ?? v.status}</span>
                    {v.feedback && (
                      <span className="badge">{v.feedback === "positivo" ? "👍" : "👎"}</span>
                    )}
                    {v.url && (
                      <a href={v.url} target="_blank" rel="noreferrer" className="link-vaga">
                        Ver vaga
                      </a>
                    )}
                    <span className="espaco" />
                    <Link to={`/gerador/${v.id}`} className="acao">
                      Gerar CV/Carta
                    </Link>
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
                </div>
              </div>
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}
