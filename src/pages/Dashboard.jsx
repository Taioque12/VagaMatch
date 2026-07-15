import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from "recharts";
import { supabase } from "../lib/supabase.js";
import { useAuth } from "../lib/AuthContext.jsx";
import { ThemeToggle } from "../components/ThemeToggle.jsx";
import "../dashboard-premium.css";

const STATUS_LABEL = {
  descoberta: "Descoberta",
  notificada: "Notificada",
  candidatado: "Candidatado",
  descartada: "Descartada",
  erro: "Erro",
};

function parseScoresV3(motivo) {
  if (!motivo) return null;
  const tec = motivo.match(/Técnico \((\d{1,3})\)/);
  const fit = motivo.match(/Fit \((\d{1,3})\)/);
  if (!tec || !fit) return null;
  return { tecnico: Math.min(100, +tec[1]), fit: Math.min(100, +fit[1]) };
}

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
  const [plano, setPlano] = useState("gratis");
  const [assinaturaStatus, setAssinaturaStatus] = useState(null);
  const [codigoIndicacao, setCodigoIndicacao] = useState(null);
  const [creditosIndicacao, setCreditosIndicacao] = useState(0);

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
      .select("role, plano, assinatura_status, codigo_indicacao, creditos_indicacao")
      .eq("id", userId)
      .maybeSingle()
      .then(({ data }) => {
        setEhAdmin(data?.role === "admin");
        setPlano(data?.plano || "gratis");
        setAssinaturaStatus(data?.assinatura_status ?? null);
        setCodigoIndicacao(data?.codigo_indicacao ?? null);
        setCreditosIndicacao(data?.creditos_indicacao ?? 0);
      });
  }, [session]);

  const stats = useMemo(() => {
    if (!vagas) return null;
    const candidatadas = vagas.filter((v) => v.status === "candidatado").length;
    const descartadas = vagas.filter((v) => v.status === "descartada").length;
    const naFila = vagas.filter((v) =>
      ["pendente_processamento", "descoberta"].includes(v.status)
    ).length;
    const comFeedback = candidatadas + descartadas;
    return {
      total: vagas.length,
      notificadas: vagas.filter((v) => v.status === "notificada").length,
      candidatadas,
      descartadas,
      naFila,
      taxaSucesso: comFeedback > 0 ? Math.round((candidatadas / comFeedback) * 100) : null,
    };
  }, [vagas]);

  const marketValue = useMemo(() => {
    if (!vagas) return null;
    const comSalario = vagas.filter((v) => v.salario_min != null && v.salario_max != null);
    if (!comSalario.length) return null;
    const soma = comSalario.reduce((acc, v) => acc + (Number(v.salario_min) + Number(v.salario_max)) / 2, 0);
    return Math.round(soma / comSalario.length);
  }, [vagas]);

  const vagasFiltradas = useMemo(() => {
    if (!vagas) return null;
    if (filtro === "todas") return vagas;
    return vagas.filter((v) => v.status === filtro);
  }, [vagas, filtro]);

  const mediasRadar = useMemo(() => {
    if (!vagasFiltradas?.length) return null;
    let somaTec = 0, somaFit = 0, nV3 = 0;
    let somaMatch = 0, nMatch = 0;
    for (const v of vagasFiltradas) {
      const s = parseScoresV3(v.motivo_ia);
      if (s) { somaTec += s.tecnico; somaFit += s.fit; nV3++; }
      if (v.score != null) { somaMatch += v.score; nMatch++; }
    }
    if (!nV3) return null;
    return [
      { eixo: "Técnico", valor: Math.round(somaTec / nV3) },
      { eixo: "Fit", valor: Math.round(somaFit / nV3) },
      { eixo: "Match", valor: nMatch ? Math.round(somaMatch / nMatch) : 0 },
    ];
  }, [vagasFiltradas]);

  async function mudarStatus(vaga, novoStatus) {
    const patch = ["candidatado", "descartada"].includes(novoStatus)
      ? { status: novoStatus, feedback_em: new Date().toISOString() }
      : { status: novoStatus };
    const { error } = await supabase
      .from("vagas_vistas")
      .update(patch)
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

  const ehFree =
    !(plano === "match" || plano === "match_plus") || assinaturaStatus !== "ativa";

  return (
    <div className="app-shell">
      {/* SIDEBAR ESQUERDA FIXA */}
      <aside className="sidebar-app">
        <div className="sidebar-header">
          <Link to="/dashboard" className="lp-logo" style={{ textDecoration: 'none' }}>
            <span className="lp-logo-marca" />
            VagaMatch
          </Link>
          <div className="sidebar-user-controls">
            <ThemeToggle />
            <div className="user-info-sidebar">
              <span className="user-email" title={session?.user?.email}>{session?.user?.email}</span>
            </div>
            <button className="btn-sair-icone" onClick={sair} title="Sair">Sair</button>
          </div>
        </div>

        <div className="sidebar-content">
          <div className="painel-busca">
            <div>
              <strong style={{display: 'block', marginBottom: '0.4rem', fontSize: '1.05rem', letterSpacing: '-0.01em'}}>Busca automática</strong>
              <span className={`status-busca ${buscaAtiva ? 'ativo' : 'pausado'}`}>
                {buscaAtiva === null ? "..." : buscaAtiva ? "Em andamento" : "Pausada"}
              </span>
            </div>
            <button className="acao secundaria" onClick={alternarBusca} disabled={salvandoAtivo || buscaAtiva === null} style={{marginTop: '1rem', width: '100%'}}>
              {buscaAtiva ? "Pausar Busca" : "Retomar Busca"}
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

          {mediasRadar && (
            <>
              <h3 className="sidebar-titulo">Perfil de Match</h3>
              <div className="radar-wrap">
                <RadarChart width={240} height={200} data={mediasRadar} outerRadius="70%">
                  <PolarGrid stroke="var(--border-glass)" />
                  <PolarAngleAxis
                    dataKey="eixo"
                    tick={{ fill: "var(--text-muted)", fontSize: 11, fontWeight: 600 }}
                  />
                  <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                  <Radar
                    dataKey="valor"
                    stroke="var(--primary)"
                    strokeWidth={2}
                    fill="var(--primary)"
                    fillOpacity={0.4}
                  />
                </RadarChart>
              </div>
            </>
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

          <div className="sidebar-footer">
            <Link to="/onboarding" className="acao secundaria" style={{ width: '100%', justifyContent: 'center' }}>Meu Perfil</Link>
            {ehAdmin && <Link to="/admin" className="acao secundaria" style={{ width: '100%', justifyContent: 'center' }}>Painel Admin</Link>}
            
            {ehFree && (
              <div className="sidebar-promo">
                <strong>Plano Gratuito</strong>
                <p>1 busca diária.</p>
                <Link to="/upgrade" className="acao" style={{ width: "100%", marginTop: "0.8rem", padding: "8px", justifyContent: 'center' }}>Fazer Upgrade</Link>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* ÁREA PRINCIPAL (DIREITA) */}
      <main className="main-content">
        <div className="main-content-inner">
          {stats && (
            <div className="top-metrics-hero">
              <div className="metric-card hero-metric">
                <span className="metric-valor">
                  {stats.taxaSucesso === null ? "—" : <>{stats.taxaSucesso}<span className="metric-unidade">%</span></>}
                </span>
                <span className="metric-label">Taxa de Sucesso IA</span>
              </div>
              <div className="metric-card">
                <span className="metric-valor">{stats.total}</span>
                <span className="metric-label">Vagas Processadas</span>
              </div>
              <div className="metric-card">
                <span className="metric-valor">{stats.naFila}</span>
                <span className="metric-label">Vagas na Fila</span>
              </div>
            </div>
          )}

          {marketValue != null && (
            <div className="market-value-card">
              <span className="market-value-icon">💰</span>
              <div>
                <strong>O mercado está pagando em média R$ {marketValue.toLocaleString("pt-BR")}</strong>
                <p className="market-value-dica">
                  Dica: atualize seu <Link to="/onboarding">perfil</Link> para atingir vagas mais sêniores.
                </p>
              </div>
            </div>
          )}

          {erro && <p className="erro">{erro}</p>}

          {vagasFiltradas === null && !erro && (
            <div className="grid-vagas">
              {[1, 2, 3].map((i) => (
                <div key={i} className="vaga-card skeleton-card">
                  <div className="skeleton skeleton-titulo" />
                  <div className="skeleton skeleton-linha" />
                  <div className="skeleton skeleton-bloco" />
                </div>
              ))}
            </div>
          )}

          {vagasFiltradas?.length === 0 && (
            <div className="estado-vazio">
              <div className="estado-vazio-icone">✨</div>
              <p>Nenhuma vaga aqui ainda.</p>
              <span>A IA está trabalhando no plano de fundo.</span>
            </div>
          )}

          <div className="grid-vagas">
            {vagasFiltradas?.map((v) => {
              const scoresV3 = parseScoresV3(v.motivo_ia);
              return (
              <div key={v.id} className={`vaga-card status-${v.status}`}>
                <div className="vaga-card-header">
                  <div className="vaga-card-title-group">
                    <div className="vaga-cabecalho">
                      <strong>{v.titulo}</strong>
                    </div>
                    <p className="vaga-empresa">
                      {v.empresa} • {v.fonte} • {new Date(v.data_encontrada).toLocaleDateString("pt-BR")}
                    </p>
                  </div>
                  <div
                    className="score-ring"
                    style={{ "--score": v.score ?? 0 }}
                    title={`Score da IA: ${v.score ?? 0} de 100`}
                  >
                    <span className="score-ring-valor">{v.score ?? 0}</span>
                    <span className="score-ring-sub">match</span>
                  </div>
                </div>

                {v.motivo_ia && (
                  <div className="vaga-motivo">
                    <span className="motivo-icon">✨</span>
                    <p>{v.motivo_ia}</p>
                  </div>
                )}

                {scoresV3 && (
                  <div className="subscores">
                    <div className="subscore">
                      <span>Técnico</span>
                      <div className="subscore-trilha">
                        <div className="subscore-barra" style={{ width: `${scoresV3.tecnico}%` }} />
                      </div>
                      <span className="subscore-valor">{scoresV3.tecnico}</span>
                    </div>
                    <div className="subscore">
                      <span>Fit</span>
                      <div className="subscore-trilha">
                        <div className="subscore-barra fit" style={{ width: `${scoresV3.fit}%` }} />
                      </div>
                      <span className="subscore-valor">{scoresV3.fit}</span>
                    </div>
                  </div>
                )}

                <div className="vaga-rodape">
                  <span className="badge">{STATUS_LABEL[v.status] ?? v.status}</span>
                  {v.feedback && (
                    <span className="badge">{v.feedback === "positivo" ? "👍" : "👎"}</span>
                  )}
                  {v.url && (
                    <a href={v.url} target="_blank" rel="noreferrer" className="link-vaga">
                      <span>🔗</span> Ver original
                    </a>
                  )}
                  <span className="espaco" style={{flex: 1}} />
                  <Link to={`/gerador/${v.id}`} className="acao secundaria" style={{marginRight: '8px'}}>
                    Documentos
                  </Link>
                  {v.status !== "candidatado" && (
                    <button className="acao" onClick={() => mudarStatus(v, "candidatado")} style={{marginRight: '8px'}}>
                      Candidatar
                    </button>
                  )}
                  {v.status !== "descartada" && (
                    <button className="acao secundaria" onClick={() => mudarStatus(v, "descartada")}>
                      Descartar
                    </button>
                  )}
                </div>
              </div>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
}
