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
  const [soHomeOffice, setSoHomeOffice] = useState(false);
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
    const porStatus = filtro === "todas" ? vagas : vagas.filter((v) => v.status === filtro);
    return soHomeOffice ? porStatus.filter(ehVagaRemota) : porStatus;
  }, [vagas, filtro, soHomeOffice]);

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
        <div style={{ display: "flex", gap: "16px", alignItems: "center", flexWrap: "wrap" }}>
          {/* Avatar com iniciais — e-mail sai do header (fica no title/tooltip) */}
          <span className="dbv2-avatar" title={session?.user?.email || ""}>
            {(session?.user?.email || "?").slice(0, 2).toUpperCase()}
          </span>
          <Link to="/onboarding" className="dbv2-btn-ghost">Meu perfil</Link>
          {ehAdmin && <Link to="/admin" className="dbv2-btn-ghost">Painel admin</Link>}
          <button className="dbv2-btn-ghost" onClick={sair}>Sair</button>
        </div>
      </nav>

      <div className="dbv2-coluna" style={{ marginTop: 36 }}>
        {/* ===== Top metrics: hero Taxa de Sucesso + Processadas + Fila ===== */}
        {stats && (
          <div className="dbv2-metrics">
            <div className="dbv2-metric dbv2-metric-hero">
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
        <div className="dbv2-toolbar">
          <button
            className="dbv2-btn-ghost"
            onClick={alternarBusca}
            disabled={salvandoAtivo || buscaAtiva === null}
          >
            {buscaAtiva === null ? "..." : buscaAtiva ? "⏸ Pausar busca" : "▶ Retomar busca"}
          </button>
          <span style={{ flex: 1 }} />
          {FILTROS.map((f) => (
            <button
              key={f.valor}
              className={filtro === f.valor ? "dbv2-filtro ativo" : "dbv2-filtro"}
              onClick={() => setFiltro(f.valor)}
            >
              {f.label}
            </button>
          ))}
          <button
            className={soHomeOffice ? "dbv2-filtro ativo" : "dbv2-filtro"}
            onClick={() => setSoHomeOffice((v) => !v)}
            title="Mostra só vagas com menção a remoto/home office no título ou descrição"
          >
            🏠 Home Office
          </button>
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
        <div className="dbv2-vagas">
          <h2 className="dbv2-titulo-secao">Vagas encontradas pela IA</h2>

          {erro && <p className="erro">{erro}</p>}

          {vagasFiltradas === null && !erro && (
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

          {vagasFiltradas?.length === 0 && (
            <div className="dbv2-card" style={{ alignItems: "center", textAlign: "center", padding: "48px 32px" }}>
              <div style={{ fontSize: 40 }}>✨</div>
              <p style={{ margin: 0, fontWeight: 700 }}>Nenhuma vaga aqui ainda.</p>
              <span className="dbv2-metric-sub">
                O robô está escaneando a web. Quanto mais completo seu perfil, melhores os matches.
              </span>
              <Link to="/onboarding" className="dbv2-btn-primario" style={{ marginTop: 8 }}>
                Completar meu perfil
              </Link>
            </div>
          )}

          {vagasFiltradas?.map((v) => {
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
                  <div className="dbv2-insight">
                    <div className="dbv2-insight-chip">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />
                      </svg>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
                      <span className="dbv2-insight-label">Insight da IA</span>
                      <p>{v.motivo_ia}</p>
                    </div>
                  </div>
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
        </div>
      </div>
    </div>
  );
}
