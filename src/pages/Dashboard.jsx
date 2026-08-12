import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar } from "recharts";
import { supabase } from "../lib/supabase.js";
import { useAuth } from "../lib/AuthContext.jsx";
import "../dashboard-premium-v2.css";

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

// Detecção client-side de vaga remota — mesmos termos do filtro do worker
// (worker/filter.js), aplicado em título/local/descrição já salvos no banco.
const TERMOS_REMOTO = ["remoto", "remote", "home office", "100% remoto", "anywhere"];
function ehVagaRemota(v) {
  const texto = `${v.titulo} ${v.local || ""} ${v.descricao || ""}`
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  return TERMOS_REMOTO.some((t) => texto.includes(t));
}

const FILTROS = [
  { valor: "recomendadas", label: "Recomendadas" },
  { valor: "todas", label: "Todas" },
  { valor: "notificada", label: "Notificadas" },
  { valor: "candidatado", label: "Candidatadas" },
  { valor: "descartada", label: "Descartadas" },
];

export function Dashboard() {
  const { session } = useAuth();
  const [vagas, setVagas] = useState(null);
  const [erro, setErro] = useState(null);
  const [filtro, setFiltro] = useState("recomendadas");
  const [soHomeOffice, setSoHomeOffice] = useState(false);
  const [ordenacao, setOrdenacao] = useState("relevancia");
  const [periodo, setPeriodo] = useState("tudo");
  const [quantidadeVisivel, setQuantidadeVisivel] = useState(12);
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
    const candidatadas = vagas.filter((v) => v.status === "candidatado").length;
    const descartadas = vagas.filter((v) => v.status === "descartada").length;
    const naFila = vagas.filter((v) =>
      ["pendente_processamento", "descoberta"].includes(v.status)
    ).length;
    const comFeedback = candidatadas + descartadas;
    return {
      total: vagas.length,
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
    let porStatus;
    if (filtro === "recomendadas") {
      porStatus = vagas
        .filter((v) => !["erro", "pendente_processamento"].includes(v.status) && (v.score ?? 0) >= 60)
        .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    } else {
      porStatus = filtro === "todas" ? vagas : vagas.filter((v) => v.status === filtro);
    }
    const porModalidade = soHomeOffice ? porStatus.filter(ehVagaRemota) : porStatus;
    if (periodo === "tudo") return porModalidade;

    const inicio = new Date();
    if (periodo === "hoje") inicio.setHours(0, 0, 0, 0);
    if (periodo === "7d") inicio.setDate(inicio.getDate() - 7);
    if (periodo === "30d") inicio.setDate(inicio.getDate() - 30);
    return porModalidade.filter((vaga) => new Date(vaga.data_encontrada) >= inicio);
  }, [vagas, filtro, soHomeOffice, periodo]);

  const vagasOrdenadas = useMemo(() => {
    if (!vagasFiltradas) return null;
    const porDataDesc = (a, b) => new Date(b.data_encontrada) - new Date(a.data_encontrada);
    const porScoreDesc = (a, b) => (b.score ?? 0) - (a.score ?? 0);
    return [...vagasFiltradas].sort((a, b) => {
      if (ordenacao === "recentes") return porDataDesc(a, b);
      if (ordenacao === "score") return porScoreDesc(a, b) || porDataDesc(a, b);
      return porScoreDesc(a, b) || porDataDesc(a, b);
    });
  }, [vagasFiltradas, ordenacao]);

  useEffect(() => {
    setQuantidadeVisivel(12);
  }, [filtro, soHomeOffice, ordenacao, periodo]);

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

  return (
    <div className="dbv2-page">
      <nav className="lp-nav">
        <Link to="/dashboard" className="lp-logo" style={{ textDecoration: "none" }}>
          <span className="lp-logo-marca" />
          VagaMatch
        </Link>
        <details className="dbv2-user-menu">
          <summary aria-label="Abrir menu da conta">Menu</summary>
          <div className="dbv2-user-menu-conteudo">
          {/* Avatar com iniciais — e-mail sai do header (fica no title/tooltip) */}
          <span className="dbv2-avatar" title={session?.user?.email || ""}>
            {(session?.user?.email || "?").slice(0, 2).toUpperCase()}
          </span>
          <Link to="/onboarding" className="dbv2-btn-ghost">Meu perfil</Link>
          {ehAdmin && <Link to="/admin" className="dbv2-btn-ghost">Painel admin</Link>}
          <button className="dbv2-btn-ghost" onClick={sair}>Sair</button>
          </div>
        </details>
      </nav>

      <main className="dbv2-coluna" style={{ marginTop: 36 }}>
        <header className="dbv2-page-header">
          <p className="dbv2-page-kicker">Painel de oportunidades</p>
          <h1>Suas melhores vagas, em um só lugar</h1>
        </header>
        {/* ===== Top metrics: hero Taxa de Sucesso + Processadas + Fila ===== */}
        {stats && (
          <div className="dbv2-metrics">
            <div className="dbv2-metric dbv2-metric-hero dbv2-metric-destaque">
              <div className="dbv2-hero-topo">
                <div className="dbv2-hero-chip">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="3 17 9 11 13 15 21 7" />
                    <polyline points="15 7 21 7 21 13" />
                  </svg>
                </div>
                <span className="dbv2-metric-label">Taxa de Sucesso IA</span>
              </div>
              <div className="dbv2-hero-valor">
                {stats.taxaSucesso === null ? "—" : <>{stats.taxaSucesso}<span className="unidade">%</span></>}
              </div>
              <div className="dbv2-pulse-row">
                <span className={buscaAtiva ? "dbv2-pulse" : "dbv2-pulse pausado"} />
                {buscaAtiva === null
                  ? "Verificando busca automática..."
                  : buscaAtiva
                  ? "Busca automática em andamento"
                  : "Busca automática pausada"}
              </div>
            </div>

            {/* Shimmer quando busca ativa e valor 0: sistema trabalhando no background */}
            <div className={buscaAtiva && stats.total === 0 ? "dbv2-metric dbv2-metric-buscando" : "dbv2-metric"}>
              <span className="dbv2-metric-label">Vagas Processadas</span>
              <span className="dbv2-metric-valor">{stats.total}</span>
              <span className="dbv2-metric-sub">últimas 200 vagas</span>
            </div>

            <div className={buscaAtiva && stats.naFila === 0 ? "dbv2-metric dbv2-metric-buscando" : "dbv2-metric"}>
              <span className="dbv2-metric-label">Vagas na Fila</span>
              <span className="dbv2-metric-valor">{stats.naFila}</span>
              <span className="dbv2-metric-sub">processando agora</span>
            </div>
          </div>
        )}

        {/* ===== Toolbar: toggle da busca + filtros (ex-sidebar) ===== */}
        <div className="dbv2-toolbar" role="toolbar" aria-label="Controles de busca e filtros">
          <button
            className="dbv2-btn-ghost"
            onClick={alternarBusca}
            disabled={salvandoAtivo || buscaAtiva === null}
          >
            {buscaAtiva === null ? "Carregando…" : buscaAtiva ? "Pausar busca" : "Retomar busca"}
          </button>
          <span style={{ flex: 1 }} />
          {FILTROS.map((f) => (
            <button
              key={f.valor}
              className={filtro === f.valor ? "dbv2-filtro ativo" : "dbv2-filtro"}
              onClick={() => { setFiltro(f.valor); setQuantidadeVisivel(12); }}
              aria-pressed={filtro === f.valor}
            >
              {f.label}
            </button>
          ))}
          <button
            className={soHomeOffice ? "dbv2-filtro ativo" : "dbv2-filtro"}
            onClick={() => setSoHomeOffice((v) => !v)}
            title="Mostra só vagas com menção a remoto/home office no título ou descrição"
            aria-pressed={soHomeOffice}
          >
            🏠 Home Office
          </button>
          <label className="dbv2-ordenacao">
            <span>Ordenar</span>
            <select value={ordenacao} onChange={(event) => setOrdenacao(event.target.value)}>
              <option value="relevancia">Mais relevantes</option>
              <option value="recentes">Mais recentes</option>
              <option value="score">Maior match</option>
            </select>
          </label>
        </div>

        <div className="dbv2-periodo" role="group" aria-label="Período em que a vaga foi encontrada">
          <span>Encontradas em</span>
          {[
            ["hoje", "Hoje"],
            ["7d", "7 dias"],
            ["30d", "30 dias"],
            ["tudo", "Tudo"],
          ].map(([valor, label]) => (
            <button
              key={valor}
              type="button"
              className={periodo === valor ? "dbv2-periodo-btn ativo" : "dbv2-periodo-btn"}
              onClick={() => setPeriodo(valor)}
              aria-pressed={periodo === valor}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ===== Faixa horizontal: mercado + radar (ex-sidebar) ===== */}
        {(marketValue != null || mediasRadar) && (
          <div className="dbv2-radar-row">
            {marketValue != null ? (
              <div className="dbv2-metric" style={{ justifyContent: "center" }}>
                <span className="dbv2-metric-label">Média salarial do seu perfil</span>
                <span className="dbv2-metric-valor" style={{ fontSize: 44 }}>
                  R$ {marketValue.toLocaleString("pt-BR")}
                </span>
                <span className="dbv2-metric-sub">
                  Adicione tecnologias no seu <Link to="/onboarding" className="dbv2-link" style={{ color: "#10b981" }}>perfil</Link> para atingir vagas melhores.
                </span>
              </div>
            ) : <span />}
            {mediasRadar && (
              <div className="dbv2-radar-card">
                <span className="dbv2-metric-label" style={{ padding: "8px 0 0" }}>Perfil do match</span>
                <RadarChart width={230} height={190} data={mediasRadar} outerRadius="70%">
                  <PolarGrid stroke="rgba(255,255,255,0.08)" />
                  <PolarAngleAxis dataKey="eixo" tick={{ fill: "#94a3b8", fontSize: 11, fontWeight: 700 }} />
                  <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                  <Radar dataKey="valor" stroke="#10b981" strokeWidth={2} fill="#10b981" fillOpacity={0.35} />
                </RadarChart>
              </div>
            )}
          </div>
        )}

        {/* ===== Lista de vagas ===== */}
        <section className="dbv2-vagas" aria-labelledby="titulo-vagas">
          <div className="dbv2-vagas-cabecalho">
            <div>
              <h2 id="titulo-vagas" className="dbv2-titulo-secao">
                {filtro === "recomendadas" ? "Recomendadas para você" : "Vagas encontradas pela IA"}
              </h2>
              {vagasOrdenadas && <p className="dbv2-contagem">{vagasOrdenadas.length} oportunidades neste recorte</p>}
            </div>
          </div>

          {erro && <p className="erro" role="alert">{erro}</p>}

          {vagasOrdenadas === null && !erro && (
            <div aria-busy="true" aria-label="Carregando vagas" className="dbv2-vagas">
              {[1, 2].map((i) => (
                <div key={i} className="dbv2-card skeleton-card">
                  <div className="skeleton skeleton-titulo" />
                  <div className="skeleton skeleton-linha" />
                  <div className="skeleton skeleton-bloco" />
                  <div className="skeleton skeleton-linha curta" />
                </div>
              ))}
            </div>
          )}

          {vagasOrdenadas?.length === 0 && (
            <div className="dbv2-card" style={{ alignItems: "center", textAlign: "center", padding: "48px 32px" }}>
              <p style={{ margin: 0, fontWeight: 700 }}>
                {filtro !== "todas" || soHomeOffice ? "Nenhuma vaga corresponde aos filtros." : "Nenhuma vaga aqui ainda."}
              </p>
              <span className="dbv2-metric-sub">
                {filtro !== "todas" || soHomeOffice
                  ? "Tente outro status ou mostre também as vagas presenciais."
                  : "A busca automática está procurando oportunidades alinhadas ao seu perfil."}
              </span>
              {filtro !== "todas" || soHomeOffice ? (
                <button className="dbv2-btn-primario" style={{ marginTop: 8 }} onClick={() => { setFiltro("todas"); setSoHomeOffice(false); }}>
                  Limpar filtros
                </button>
              ) : (
                <Link to="/onboarding" className="dbv2-btn-primario" style={{ marginTop: 8 }}>
                  Revisar meu perfil
                </Link>
              )}
            </div>
          )}

          {vagasOrdenadas?.slice(0, quantidadeVisivel).map((v) => {
            const scoresV3 = parseScoresV3(v.motivo_ia);
            return (
              <div key={v.id} className="dbv2-card">
                <div className="dbv2-card-header">
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
                    <strong className="dbv2-card-titulo">{v.titulo}</strong>
                    <span className="dbv2-card-meta">
                      {v.empresa}
                      <span className="dbv2-dot" />
                      {v.fonte}
                      <span className="dbv2-dot" />
                      {new Date(v.data_encontrada).toLocaleDateString("pt-BR")}
                    </span>
                  </div>
                  <div
                    className="dbv2-ring"
                    style={{ "--score": v.score ?? 0 }}
                    role="img"
                    aria-label={`Score da IA: ${v.score ?? 0} de 100`}
                  >
                    <div className="dbv2-ring-miolo">
                      <span className="dbv2-ring-num">{v.score ?? 0}</span>
                      <span className="dbv2-ring-sub">match</span>
                    </div>
                  </div>
                </div>

                {v.motivo_ia && (
                  <details className="dbv2-insight">
                    <summary>
                      <span className="dbv2-insight-label">Por que esta vaga combina com você</span>
                      <span aria-hidden="true">Ver análise</span>
                    </summary>
                    <p>{v.motivo_ia}</p>
                  </details>
                )}

                {scoresV3 && (
                  <div className="dbv2-subscores">
                    <div className="dbv2-subscore">
                      <span className="dbv2-subscore-label">Técnico</span>
                      <div className="dbv2-trilha">
                        <div className="dbv2-barra" style={{ width: `${scoresV3.tecnico}%` }} />
                      </div>
                      <span className="dbv2-subscore-num">{scoresV3.tecnico}</span>
                    </div>
                    <div className="dbv2-subscore">
                      <span className="dbv2-subscore-label">Fit</span>
                      <div className="dbv2-trilha">
                        <div className="dbv2-barra fit" style={{ width: `${scoresV3.fit}%` }} />
                      </div>
                      <span className="dbv2-subscore-num">{scoresV3.fit}</span>
                    </div>
                  </div>
                )}

                <div className="dbv2-card-rodape">
                  <span className="dbv2-pill-status">{STATUS_LABEL[v.status] ?? v.status}</span>
                  {v.url && (
                    <a href={v.url} target="_blank" rel="noreferrer" className="dbv2-link">
                      Ver original ↗
                    </a>
                  )}
                  <span style={{ flex: 1 }} />
                  <Link to={`/gerador/${v.id}`} className="dbv2-btn-ghost">
                    Gerar documentos
                  </Link>
                  {v.status !== "descartada" && (
                    <button className="dbv2-btn-ghost" onClick={() => mudarStatus(v, "descartada")}>
                      Descartar
                    </button>
                  )}
                  {v.status !== "candidatado" && (
                    <button className="dbv2-btn-primario" onClick={() => mudarStatus(v, "candidatado")}>
                      Candidatar
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {vagasOrdenadas && vagasOrdenadas.length > quantidadeVisivel && (
            <button className="dbv2-carregar-mais" onClick={() => setQuantidadeVisivel((atual) => atual + 12)}>
              Mostrar mais vagas
            </button>
          )}
        </section>
      </main>
    </div>
  );
}
