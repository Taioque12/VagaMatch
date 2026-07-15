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

// V3 grava os sub-scores dentro do motivo_ia:
// "⚙️ Técnico (85): ... 🤝 Fit (70): ...". Sem colunas dedicadas (ainda) —
// parse tolerante: vaga do fluxo legado (sem o padrão) simplesmente não mostra barras.
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
  const [linkCopiado, setLinkCopiado] = useState(false);

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

  function copiarLinkIndicacao() {
    const link = `${window.location.origin}/cadastro?ref=${codigoIndicacao}`;
    navigator.clipboard.writeText(link);
    setLinkCopiado(true);
    setTimeout(() => setLinkCopiado(false), 2000);
  }

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
      // Taxa de sucesso do match: das vagas em que o usuário deu feedback,
      // quantas ele aprovou (candidatou). Sem feedback ainda → null ("—").
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

  // Médias dos sub-scores V3 das vagas visíveis (parseScoresV3 lê o motivo_ia).
  // Radar precisa de >= 3 eixos pra formar área: Técnico + Fit + Match geral.
  const mediasRadar = useMemo(() => {
    if (!vagasFiltradas?.length) return null;
    let somaTec = 0, somaFit = 0, nV3 = 0;
    let somaMatch = 0, nMatch = 0;
    for (const v of vagasFiltradas) {
      const s = parseScoresV3(v.motivo_ia);
      if (s) { somaTec += s.tecnico; somaFit += s.fit; nV3++; }
      if (v.score != null) { somaMatch += v.score; nMatch++; }
    }
    if (!nV3) return null; // nenhuma vaga com sub-scores V3 ainda
    return [
      { eixo: "Técnico", valor: Math.round(somaTec / nV3) },
      { eixo: "Fit", valor: Math.round(somaFit / nV3) },
      { eixo: "Match", valor: nMatch ? Math.round(somaMatch / nMatch) : 0 },
    ];
  }, [vagasFiltradas]);

  async function mudarStatus(vaga, novoStatus) {
    // feedback_em alimenta a memória vetorial da V3 (Fase C) — carimbo só nos
    // status que são feedback real do usuário, igual ao webhook do Telegram.
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
    <div className="lp-hero-bloco" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
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
      
      {false && ehFree && (
        <div style={{ backgroundColor: "var(--bg-glass)", border: "1px solid var(--border-glass)", padding: "12px 20px", margin: "16px auto 0", width: "calc(100% - 32px)", maxWidth: "1200px", borderRadius: "12px", color: "var(--text-main)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "10px", fontSize: "0.92rem" }}>
          <span><strong>Plano gratuito:</strong> 1 busca automática por dia.</span>
          <Link to="/upgrade" className="acao" style={{ padding: "6px 16px", fontSize: "0.9rem", margin: 0, textDecoration: "none" }}>Fazer upgrade</Link>
        </div>
      )}

      <div className="dashboard-container">
        {/* Sidebar Esquerda: Controles e Stats */}
        <aside className="dashboard-sidebar">
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

          {mediasRadar && (
            <>
              <h3 className="sidebar-titulo">Perfil do match (médias)</h3>
              <div className="radar-wrap">
                <RadarChart width={250} height={250} data={mediasRadar} outerRadius="70%">
                  <PolarGrid stroke="var(--border-glass)" />
                  <PolarAngleAxis
                    dataKey="eixo"
                    tick={{ fill: "var(--text-muted)", fontSize: 12, fontWeight: 600 }}
                  />
                  <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                  <Radar
                    dataKey="valor"
                    stroke="var(--primary)"
                    strokeWidth={2}
                    fill="var(--primary)"
                    fillOpacity={0.35}
                  />
                </RadarChart>
              </div>
            </>
          )}

          {false && (
            <div style={{ marginTop: "2rem", padding: "1.5rem", backgroundColor: "var(--bg-glass)", borderRadius: "16px", border: "1px solid var(--border-glass)" }}>
              <h3 className="sidebar-titulo" style={{ marginTop: 0 }}>Seu Plano</h3>
              <p style={{ margin: "0.5rem 0", fontWeight: "800", textTransform: "capitalize", fontSize: "1.2rem", color: "var(--text-main)" }}>{plano}</p>
              {ehFree && (
                <Link
                  to="/upgrade"
                  className="acao"
                  style={{ width: "100%", marginTop: "0.5rem", display: "block", textAlign: "center", textDecoration: "none", boxSizing: "border-box" }}
                >
                  Fazer upgrade
                </Link>
              )}
            </div>
          )}

          {false && codigoIndicacao && (
            <div style={{ marginTop: "1.5rem", padding: "1.5rem", backgroundColor: "var(--bg-glass)", borderRadius: "16px", border: "1px solid var(--border-glass)" }}>
              <h3 className="sidebar-titulo" style={{ marginTop: 0 }}>Indique e ganhe</h3>
              <p style={{ margin: "0.3rem 0 0.8rem", fontSize: "0.85rem" }}>
                Ganhe 1 mês grátis a cada amigo que assinar pelo seu link.
                {creditosIndicacao > 0 && (
                  <> Você já indicou <strong>{creditosIndicacao}</strong> {creditosIndicacao === 1 ? "assinante" : "assinantes"}.</>
                )}
              </p>
              <button className="acao secundaria" style={{ width: "100%" }} onClick={copiarLinkIndicacao}>
                {linkCopiado ? "Link copiado!" : "Copiar link de indicação"}
              </button>
            </div>
          )}
        </aside>

        {/* Área Principal: Lista de Vagas */}
        <main className="dashboard-main">
          {stats && (
            <div className="top-metrics">
              <div className="metric-card">
                <span className="metric-valor">
                  {stats.taxaSucesso === null ? "—" : <>{stats.taxaSucesso}<span className="metric-unidade">%</span></>}
                </span>
                <span className="metric-label">Taxa de sucesso do match IA</span>
              </div>
              <div className="metric-card">
                <span className="metric-valor">{stats.total}</span>
                <span className="metric-label">Vagas processadas</span>
              </div>
              <div className="metric-card">
                <span className="metric-valor">{stats.naFila}</span>
                <span className="metric-label">Vagas na fila</span>
              </div>
            </div>
          )}
          {marketValue != null && (
            <div className="market-value-card">
              <span className="market-value-icon">💰</span>
              <div>
                <strong>O mercado está pagando em média R$ {marketValue.toLocaleString("pt-BR")}</strong> para o seu perfil.
                <p className="market-value-dica">
                  💡 Dica para subir de nível: adicione novas tecnologias no seu <Link to="/onboarding">perfil</Link> para atingir vagas melhores.
                </p>
              </div>
            </div>
          )}
          {erro && <p className="erro">{erro}</p>}
          {vagasFiltradas === null && !erro && (
            <div className="grid-vagas" aria-busy="true" aria-label="Carregando vagas">
              {[1, 2, 3].map((i) => (
                <div key={i} className="vaga-card skeleton-card">
                  <div className="skeleton skeleton-titulo" />
                  <div className="skeleton skeleton-linha" />
                  <div className="skeleton skeleton-bloco" />
                  <div className="skeleton skeleton-linha curta" />
                </div>
              ))}
            </div>
          )}
          {vagasFiltradas?.length === 0 && (
            <div className="estado-vazio">
              <div className="estado-vazio-icone">✨</div>
              <p>Nenhuma vaga aqui ainda.</p>
              <span>O robô está escaneando a web. Se demorar, confira seu <Link to="/onboarding" style={{color: 'var(--primary)', fontWeight: 600}}>perfil</Link>.</span>
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
                    role="img"
                    aria-label={`Score da IA: ${v.score ?? 0} de 100`}
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
                      <span>🔗</span> Ver vaga original
                    </a>
                  )}
                  <span className="espaco" style={{flex: 1}} />
                  <Link to={`/gerador/${v.id}`} className="acao secundaria" style={{marginRight: '8px'}}>
                    Gerar Documentos
                  </Link>
                  {v.status !== "candidatado" && (
                    <button className="acao" onClick={() => mudarStatus(v, "candidatado")} style={{marginRight: '8px'}}>
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
              );
            })}
          </div>
        </main>
      </div>
    </div>
  );
}
