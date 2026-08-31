import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Bot,
  BrainCircuit,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  Clapperboard,
  Clock3,
  FileText,
  FileVideo2,
  LayoutDashboard,
  Link2,
  ListChecks,
  LogOut,
  MessageCircle,
  PlayCircle,
  Plus,
  RefreshCw,
  Rocket,
  Send,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  Upload,
  Users,
  WandSparkles,
  Zap,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { supabase } from "../lib/supabase.js";
import "./ugc-v2.css";

const STATUS_LABELS = {
  pipeline: "No radar",
  invited: "Convidado",
  preparing: "Preparando",
  assessment: "Assessment",
  negotiating: "Negociando",
  accepted: "Aceito",
  active: "Ativa",
  paused: "Pausada",
  completed: "Concluída",
  rejected: "Encerrada",
};

const CONTENT_STATUS = {
  idea: "Ideia",
  scripted: "Roteirizado",
  recording: "Gravando",
  recorded: "Gravado",
  editing: "Editando",
  review: "Revisão",
  approved: "Aprovado",
  queued: "Na fila",
  published: "Publicado",
  rejected: "Descartado",
};

const POSTING_LABELS = {
  auto: "Automático",
  assisted: "Assistido",
  manual_only: "Somente manual",
};

const NEXT_CONTENT_STATUS = {
  idea: "scripted",
  scripted: "recording",
  recording: "recorded",
  recorded: "editing",
  editing: "review",
  review: "approved",
  approved: "queued",
  queued: "published",
};

const TABS = {
  overview: "Central do dia",
  contracts: "Contratos",
  campaigns: "Campanhas",
  content: "Conteúdo",
  performance: "Performance",
  copilot: "Copiloto",
  calendar: "Agenda",
  finance: "Financeiro",
};

function formatMoney(value = 0, currency = "USD") {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function formatCompact(value = 0) {
  return new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(Number(value || 0));
}

function formatDate(value, withTime = false) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("pt-BR", withTime
    ? { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }
    : { day: "2-digit", month: "short" }
  ).format(date);
}

function platformLabel(platform) {
  return {
    tiktok: "TikTok",
    instagram: "Instagram",
    youtube: "YouTube",
    facebook: "Facebook",
  }[platform] || platform || "—";
}

function safeJson(value, fallback = {}) {
  if (!value) return fallback;
  if (typeof value === "object") return value;
  try { return JSON.parse(value); } catch { return fallback; }
}

function groupMoney(items, predicate = () => true) {
  const grouped = {};
  items.filter(predicate).forEach((item) => {
    const currency = item.currency || "USD";
    grouped[currency] = (grouped[currency] || 0) + Number(item.amount || 0);
  });
  const entries = Object.entries(grouped).filter(([, value]) => value !== 0);
  if (!entries.length) return "US$ 0";
  return entries.map(([currency, value]) => formatMoney(value, currency)).join(" + ");
}

function Login({ onSession }) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function sendMagicLink(event) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.href },
    });
    setLoading(false);
    setMessage(error ? error.message : "Link de acesso enviado. Confira seu e-mail.");
  }

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) onSession(session);
    });
    return () => data.subscription.unsubscribe();
  }, [onSession]);

  return (
    <main className="ops-login">
      <section className="ops-login-card">
        <div className="ops-brand-mark"><Sparkles size={25} /></div>
        <p className="ops-eyebrow">TAION LABS</p>
        <h1>UGC Ops</h1>
        <p>Contratos, produção, publicação e performance em uma única operação.</p>
        <form onSubmit={sendMagicLink}>
          <label>E-mail<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required placeholder="voce@email.com" /></label>
          <button className="ops-primary" type="submit" disabled={loading}>
            {loading ? <RefreshCw className="spin" size={18} /> : <Send size={18} />}
            Entrar por link mágico
          </button>
        </form>
        {message && <div className="ops-login-message">{message}</div>}
      </section>
    </main>
  );
}

export function UgcAppV2() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [tab, setTab] = useState("overview");
  const [error, setError] = useState("");
  const [campaigns, setCampaigns] = useState([]);
  const [clients, setClients] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [content, setContent] = useState([]);
  const [posts, setPosts] = useState([]);
  const [metrics, setMetrics] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [payments, setPayments] = useState([]);
  const [notes, setNotes] = useState([]);
  const [socialAccounts, setSocialAccounts] = useState([]);
  const [modal, setModal] = useState(null);

  const userId = session?.user?.id;

  const ensureStarterData = useCallback(async (uid) => {
    const { data: campaignRows, error: campaignReadError } = await supabase
      .from("ugc_campaigns")
      .select("id,name,posting_mode,status")
      .eq("user_id", uid);
    if (campaignReadError) throw campaignReadError;

    let availableCampaigns = campaignRows || [];

    if (!availableCampaigns.length) {
      const { data: createdClients, error: clientError } = await supabase
        .from("ugc_clients")
        .insert([
          { user_id: uid, name: "Howbout", brand_url: "https://howbout.app", currency: "GBP", notes: "Programa Ambassador / creator." },
          { user_id: uid, name: "ReciBites", brand_url: "https://recibites.app", currency: "USD", notes: "Creator assessment de 5 dias." },
        ])
        .select("id,name");
      if (clientError) throw clientError;

      const howbout = createdClients.find((item) => item.name === "Howbout");
      const reci = createdClients.find((item) => item.name === "ReciBites");
      const { data: createdCampaigns, error: campaignError } = await supabase
        .from("ugc_campaigns")
        .insert([
          {
            user_id: uid,
            client_id: howbout?.id,
            name: "Howbout Ambassador — Trial Week",
            status: "assessment",
            posting_mode: "assisted",
            language: "pt-BR",
            videos_target: 10,
            posts_target: 10,
            base_amount: 25,
            payment_model: "assessment",
            platforms: ["tiktok"],
            goals: { max_per_day: 3, deadline_text: "sexta-feira, 10:00 horário de Londres" },
            rules: { dedicated_account: true },
            brief: "Publicar 10 vídeos no TikTok durante a trial week. Idealmente, no máximo 3 vídeos por dia.",
          },
          {
            user_id: uid,
            client_id: reci?.id,
            name: "ReciBites — Creator Assessment",
            status: "preparing",
            posting_mode: "manual_only",
            language: "pt-BR",
            videos_target: 5,
            posts_target: 15,
            base_amount: 0,
            payment_model: "assessment",
            platforms: ["tiktok", "instagram", "youtube"],
            goals: { views: 10000, comments_or_saves: 50, assessment_days: 5 },
            rules: { max_unique_videos_per_day: 1, manual_posting_required: true, hashtag: "#ReciBites" },
            brief: "5 vídeos novos em 5 dias, cada um publicado em 3 plataformas. O assessment exige publicação manual.",
            source_url: "https://recibites.app/",
          },
        ])
        .select("id,name,posting_mode,status");
      if (campaignError) throw campaignError;
      availableCampaigns = createdCampaigns || [];
    }

    const reciCampaign = availableCampaigns.find((item) => item.name.toLowerCase().includes("recibites"));
    const howboutCampaign = availableCampaigns.find((item) => item.name.toLowerCase().includes("howbout"));

    const { count: contractCount } = await supabase.from("ugc_contracts").select("id", { count: "exact", head: true }).eq("user_id", uid);
    if (!contractCount) {
      const { data: relatedClients } = await supabase.from("ugc_clients").select("id,name,currency").eq("user_id", uid);
      const reciClient = relatedClients?.find((item) => item.name.toLowerCase().includes("recibites"));
      const howboutClient = relatedClients?.find((item) => item.name.toLowerCase().includes("howbout"));
      const rows = [];
      if (howboutCampaign) rows.push({
        user_id: uid,
        client_id: howboutClient?.id,
        campaign_id: howboutCampaign.id,
        title: "Howbout Ambassador",
        status: "assessment",
        source: "SideShift / convite direto",
        monthly_amount: null,
        currency: "GBP",
        videos_per_month: null,
        payment_notes: "Trial week: £25 após conclusão de uma boa semana de teste.",
        notes: "Prioridade operacional imediata.",
      });
      if (reciCampaign) rows.push({
        user_id: uid,
        client_id: reciClient?.id,
        campaign_id: reciCampaign.id,
        title: "ReciBites Creator Program",
        status: "assessment",
        source: "SideShift",
        monthly_amount: null,
        currency: "USD",
        videos_per_month: 30,
        min_months: 6,
        payment_notes: "DM informa US$400–700/mês; handbook informa até US$600 por 30 vídeos. Validar valor antes do contrato definitivo.",
        contract_url: "https://recibites.app/",
        notes: "Assessment de 5 dias não remunerado; 5 vídeos, 15 publicações, meta de 10k views combinadas.",
      });
      if (rows.length) await supabase.from("ugc_contracts").insert(rows);
    }

    if (reciCampaign) {
      const { count: reciContentCount } = await supabase.from("ugc_content").select("id", { count: "exact", head: true }).eq("user_id", uid).eq("campaign_id", reciCampaign.id);
      if (!reciContentCount) {
        await supabase.from("ugc_content").insert([
          { user_id: uid, campaign_id: reciCampaign.id, content_number: 1, title: "200 receitas salvas e nunca encontro", concept: "Dor real + demonstração", hook: "Eu tenho umas 200 receitas salvas no TikTok e nunca encontro nenhuma quando preciso.", status: "idea", language: "pt-BR" },
          { user_id: uid, campaign_id: reciCampaign.id, content_number: 2, title: "Como eu só descobri isso agora?", concept: "Curiosidade / comment bait", hook: "Como eu só descobri isso agora?", status: "idea", language: "pt-BR" },
          { user_id: uid, campaign_id: reciCampaign.id, content_number: 3, title: "Você manda receita pra você mesmo?", concept: "Identificação", hook: "Se você também manda receita pra você mesmo achando que algum dia vai fazer... olha isso.", status: "idea", language: "pt-BR" },
          { user_id: uid, campaign_id: reciCampaign.id, content_number: 4, title: "Minha esposa manda e eu perco", concept: "Storytelling cotidiano", hook: "Minha mulher manda receita pra mim, eu salvo... e três dias depois não faço ideia de onde está.", status: "idea", language: "pt-BR" },
          { user_id: uid, campaign_id: reciCampaign.id, content_number: 5, title: "O melhor jeito que encontrei", concept: "Resultado primeiro", hook: "Esse provavelmente é o melhor jeito que encontrei pra organizar receita do TikTok.", status: "idea", language: "pt-BR" },
        ]);
      }
    }

    const { count: taskCount } = await supabase.from("ugc_tasks").select("id", { count: "exact", head: true }).eq("user_id", uid);
    if (!taskCount) {
      const starterTasks = [];
      if (howboutCampaign) starterTasks.push({ user_id: uid, campaign_id: howboutCampaign.id, title: "Executar trial da Howbout", task_type: "publish", priority: 1, notes: "Manter o limite recomendado de até 3 vídeos por dia." });
      if (reciCampaign) {
        starterTasks.push(
          { user_id: uid, campaign_id: reciCampaign.id, title: "Aquecer conta antes do assessment", task_type: "strategy", priority: 2, notes: "20 min/dia por 2–3 dias no nicho de receitas; não publicar o primeiro ReciBites ainda." },
          { user_id: uid, campaign_id: reciCampaign.id, title: "Preparar os 5 vídeos antes do primeiro post", task_type: "record", priority: 2, notes: "O relógio de 5 dias começa no primeiro post." },
          { user_id: uid, campaign_id: reciCampaign.id, title: "Validar remuneração antes do contrato", task_type: "contract", priority: 2, notes: "Confirmar US$400–700/mês versus até US$600/30 vídeos." },
        );
      }
      if (starterTasks.length) await supabase.from("ugc_tasks").insert(starterTasks);
    }

    const { count: noteCount } = await supabase.from("ugc_agent_notes").select("id", { count: "exact", head: true }).eq("user_id", uid);
    if (!noteCount) {
      const starterNotes = [];
      if (howboutCampaign) starterNotes.push({ user_id: uid, campaign_id: howboutCampaign.id, kind: "action", priority: 1, title: "Howbout é o foco operacional agora", body: "A trial já está em andamento. Evite iniciar outra janela de assessment antes de estabilizar essa entrega." });
      if (reciCampaign) starterNotes.push(
        { user_id: uid, campaign_id: reciCampaign.id, kind: "rule", priority: 1, title: "ReciBites não pode ser automatizado no assessment", body: "O briefing exige publicação manual. O sistema deve apenas preparar legenda, hashtags e checklist." },
        { user_id: uid, campaign_id: reciCampaign.id, kind: "opportunity", priority: 2, title: "Prepare tudo antes de iniciar a contagem", body: "Deixe os cinco vídeos prontos e a conta aquecida. O período de 5 dias começa apenas na primeira publicação." },
      );
      if (starterNotes.length) await supabase.from("ugc_agent_notes").insert(starterNotes);
    }
  }, []);

  const loadData = useCallback(async (uid = userId) => {
    if (!uid) return;
    setSyncing(true);
    setError("");
    try {
      await ensureStarterData(uid);
      const results = await Promise.all([
        supabase.from("ugc_campaigns").select("*, ugc_clients(name,currency)").eq("user_id", uid).order("created_at", { ascending: false }),
        supabase.from("ugc_clients").select("*").eq("user_id", uid).order("created_at", { ascending: false }),
        supabase.from("ugc_contracts").select("*").eq("user_id", uid).order("created_at", { ascending: false }),
        supabase.from("ugc_content").select("*").eq("user_id", uid).order("created_at", { ascending: false }),
        supabase.from("ugc_posts").select("*").eq("user_id", uid).order("created_at", { ascending: false }),
        supabase.from("ugc_metrics").select("*").eq("user_id", uid).order("captured_at", { ascending: false }).limit(2000),
        supabase.from("ugc_tasks").select("*").eq("user_id", uid).order("priority", { ascending: true }).order("due_at", { ascending: true, nullsFirst: false }),
        supabase.from("ugc_payments").select("*").eq("user_id", uid).order("created_at", { ascending: false }),
        supabase.from("ugc_agent_notes").select("*").eq("user_id", uid).order("resolved", { ascending: true }).order("priority", { ascending: true }),
        supabase.from("ugc_social_accounts").select("*").eq("user_id", uid).order("created_at", { ascending: false }),
      ]);
      const firstError = results.find((result) => result.error)?.error;
      if (firstError) throw firstError;
      setCampaigns(results[0].data || []);
      setClients(results[1].data || []);
      setContracts(results[2].data || []);
      setContent(results[3].data || []);
      setPosts(results[4].data || []);
      setMetrics(results[5].data || []);
      setTasks(results[6].data || []);
      setPayments(results[7].data || []);
      setNotes(results[8].data || []);
      setSocialAccounts(results[9].data || []);
    } catch (err) {
      setError(err?.message || "Não foi possível sincronizar o UGC Ops.");
    } finally {
      setSyncing(false);
    }
  }, [ensureStarterData, userId]);

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setSession(data.session || null);
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (session?.user?.id) loadData(session.user.id);
  }, [session?.user?.id, loadData]);

  const latestMetricByPost = useMemo(() => {
    const map = new Map();
    metrics.forEach((metric) => {
      if (!map.has(metric.post_id)) map.set(metric.post_id, metric);
    });
    return map;
  }, [metrics]);

  const stats = useMemo(() => {
    const liveCampaigns = campaigns.filter((item) => ["preparing", "assessment", "active"].includes(item.status)).length;
    const target = campaigns.reduce((sum, item) => sum + Number(item.videos_target || 0), 0);
    const published = content.filter((item) => item.status === "published").length;
    const views = [...latestMetricByPost.values()].reduce((sum, item) => sum + Number(item.views || 0), 0);
    const openTasks = tasks.filter((item) => !["done", "cancelled"].includes(item.status)).length;
    const openContracts = contracts.filter((item) => ["pipeline", "invited", "assessment", "negotiating", "accepted", "active"].includes(item.status)).length;
    return { liveCampaigns, target, published, views, openTasks, openContracts };
  }, [campaigns, content, latestMetricByPost, tasks, contracts]);

  const performanceRows = useMemo(() => posts.map((post) => {
    const metric = latestMetricByPost.get(post.id);
    const item = content.find((entry) => entry.id === post.content_id);
    const campaign = campaigns.find((entry) => entry.id === post.campaign_id);
    const views = Number(metric?.views || 0);
    const interactions = Number(metric?.likes || 0) + Number(metric?.comments || 0) + Number(metric?.saves || 0) + Number(metric?.shares || 0);
    const engagement = views ? (interactions / views) * 100 : 0;
    return { post, metric, item, campaign, views, engagement };
  }).sort((a, b) => b.views - a.views), [posts, latestMetricByPost, content, campaigns]);

  const campaignPerformance = useMemo(() => campaigns.map((campaign) => {
    const campaignPosts = performanceRows.filter((row) => row.post.campaign_id === campaign.id);
    const views = campaignPosts.reduce((sum, row) => sum + row.views, 0);
    const publishedCount = content.filter((item) => item.campaign_id === campaign.id && item.status === "published").length;
    const target = Number(campaign.videos_target || 0);
    const productionProgress = target ? Math.min(100, Math.round((publishedCount / target) * 100)) : 0;
    const viewGoal = Number(safeJson(campaign.goals).views || 0);
    const viewProgress = viewGoal ? Math.min(100, Math.round((views / viewGoal) * 100)) : null;
    return { campaign, views, publishedCount, target, productionProgress, viewGoal, viewProgress };
  }), [campaigns, performanceRows, content]);

  const copilotActions = useMemo(() => buildCopilotActions({ campaigns, content, posts, tasks, contracts, notes, socialAccounts, campaignPerformance }), [campaigns, content, posts, tasks, contracts, notes, socialAccounts, campaignPerformance]);

  if (loading) return <div className="ops-loading"><RefreshCw className="spin" /> Inicializando UGC Ops…</div>;
  if (!session) return <Login onSession={setSession} />;

  async function logout() {
    await supabase.auth.signOut();
  }

  async function advanceContent(item) {
    const next = NEXT_CONTENT_STATUS[item.status];
    if (!next) return;
    const patch = { status: next, updated_at: new Date().toISOString() };
    if (next === "approved") patch.approved_at = new Date().toISOString();
    const { error: updateError } = await supabase.from("ugc_content").update(patch).eq("id", item.id).eq("user_id", userId);
    if (updateError) setError(updateError.message); else loadData();
  }

  async function toggleTask(task) {
    const next = task.status === "done" ? "todo" : "done";
    const { error: updateError } = await supabase.from("ugc_tasks").update({ status: next, updated_at: new Date().toISOString() }).eq("id", task.id).eq("user_id", userId);
    if (updateError) setError(updateError.message); else loadData();
  }

  async function resolveNote(note) {
    const { error: updateError } = await supabase.from("ugc_agent_notes").update({ resolved: !note.resolved, updated_at: new Date().toISOString() }).eq("id", note.id).eq("user_id", userId);
    if (updateError) setError(updateError.message); else loadData();
  }

  return (
    <div className="ops-shell">
      <aside className="ops-sidebar">
        <div className="ops-logo">
          <div className="ops-brand-mark"><Sparkles size={19} /></div>
          <div><strong>UGC Ops</strong><span>TAION LABS</span></div>
        </div>
        <nav>
          <Nav active={tab === "overview"} icon={LayoutDashboard} label="Central do dia" onClick={() => setTab("overview")} />
          <Nav active={tab === "contracts"} icon={FileText} label="Contratos" badge={contracts.length} onClick={() => setTab("contracts")} />
          <Nav active={tab === "campaigns"} icon={Target} label="Campanhas" badge={campaigns.length} onClick={() => setTab("campaigns")} />
          <Nav active={tab === "content"} icon={Clapperboard} label="Conteúdo" badge={content.length} onClick={() => setTab("content")} />
          <Nav active={tab === "performance"} icon={TrendingUp} label="Performance" onClick={() => setTab("performance")} />
          <Nav active={tab === "copilot"} icon={Bot} label="Copiloto" badge={copilotActions.filter((item) => item.priority === 1).length} onClick={() => setTab("copilot")} />
          <Nav active={tab === "calendar"} icon={CalendarDays} label="Agenda" onClick={() => setTab("calendar")} />
          <Nav active={tab === "finance"} icon={CircleDollarSign} label="Financeiro" onClick={() => setTab("finance")} />
        </nav>
        <div className="ops-sidebar-footer">
          <div className="ops-system-status"><span /><div><strong>Sistema operacional</strong><small>{socialAccounts.length ? `${socialAccounts.length} conta(s) social(is)` : "APIs sociais ainda não conectadas"}</small></div></div>
          <button className="ops-nav" onClick={logout}><LogOut size={18} />Sair</button>
        </div>
      </aside>

      <main className="ops-main">
        <header className="ops-topbar">
          <div>
            <p className="ops-eyebrow">OPERAÇÃO UGC</p>
            <h1>{TABS[tab]}</h1>
            <span className="ops-subtitle">{tab === "overview" ? "O que merece sua atenção agora." : "Gestão centralizada da sua operação de creators."}</span>
          </div>
          <div className="ops-actions">
            <button className="ops-secondary" onClick={() => loadData()} disabled={syncing}><RefreshCw className={syncing ? "spin" : ""} size={17} />Sincronizar</button>
            <button className="ops-secondary ops-hide-mobile" onClick={() => setModal("post")}><Send size={17} />Registrar post</button>
            <button className="ops-primary" onClick={() => setModal("campaign")}><Plus size={18} />Nova campanha</button>
          </div>
        </header>

        {error && <div className="ops-error"><AlertTriangle size={18} />{error}</div>}

        {tab === "overview" && <Overview stats={stats} campaigns={campaigns} content={content} tasks={tasks} contracts={contracts} posts={posts} copilotActions={copilotActions} onTask={toggleTask} onGo={setTab} />}
        {tab === "contracts" && <ContractsView contracts={contracts} campaigns={campaigns} onNew={() => setModal("contract")} />}
        {tab === "campaigns" && <CampaignsView campaignPerformance={campaignPerformance} content={content} />}
        {tab === "content" && <ContentView campaigns={campaigns} content={content} onUpload={() => setModal("upload")} onAdvance={advanceContent} />}
        {tab === "performance" && <PerformanceView rows={performanceRows} campaignPerformance={campaignPerformance} onMetric={() => setModal("metric")} />}
        {tab === "copilot" && <CopilotView actions={copilotActions} notes={notes} campaigns={campaigns} onResolve={resolveNote} />}
        {tab === "calendar" && <CalendarView posts={posts} tasks={tasks} campaigns={campaigns} />}
        {tab === "finance" && <FinanceView campaigns={campaigns} payments={payments} contracts={contracts} />}
      </main>

      {modal === "campaign" && <NewCampaign userId={userId} onClose={() => setModal(null)} onSaved={() => { setModal(null); loadData(); }} />}
      {modal === "contract" && <NewContract userId={userId} clients={clients} campaigns={campaigns} onClose={() => setModal(null)} onSaved={() => { setModal(null); loadData(); }} />}
      {modal === "upload" && <UploadContent userId={userId} campaigns={campaigns} onClose={() => setModal(null)} onSaved={() => { setModal(null); loadData(); }} />}
      {modal === "post" && <RegisterPost userId={userId} campaigns={campaigns} content={content} onClose={() => setModal(null)} onSaved={() => { setModal(null); loadData(); }} />}
      {modal === "metric" && <AddMetric userId={userId} posts={posts} content={content} onClose={() => setModal(null)} onSaved={() => { setModal(null); loadData(); }} />}
    </div>
  );
}

function Nav({ active, icon: Icon, label, badge, onClick }) {
  return <button className={`ops-nav ${active ? "active" : ""}`} onClick={onClick}><Icon size={18} /><span>{label}</span>{badge > 0 && <em>{badge}</em>}</button>;
}

function Overview({ stats, campaigns, content, tasks, contracts, posts, copilotActions, onTask, onGo }) {
  const openTasks = tasks.filter((item) => !["done", "cancelled"].includes(item.status)).slice(0, 6);
  const ready = content.filter((item) => ["recorded", "editing", "review", "approved", "queued"].includes(item.status));
  const urgent = copilotActions.filter((item) => item.priority === 1).slice(0, 3);
  return (
    <div className="ops-stack">
      <section className="ops-hero">
        <div>
          <span className="ops-hero-kicker"><Rocket size={16} /> Command center</span>
          <h2>{urgent.length ? `${urgent.length} ponto${urgent.length > 1 ? "s" : ""} pedindo atenção.` : "Operação sob controle."}</h2>
          <p>O UGC Ops cruza contratos, produção e regras de campanha para organizar sua próxima ação.</p>
        </div>
        <button className="ops-hero-button" onClick={() => onGo("copilot")}>Abrir Copiloto <ArrowRight size={18} /></button>
      </section>

      <section className="ops-stat-grid">
        <Stat icon={FileText} label="Contratos no radar" value={stats.openContracts} hint={`${contracts.length} cadastrados`} />
        <Stat icon={Target} label="Campanhas em execução" value={stats.liveCampaigns} hint={`${campaigns.length} no total`} />
        <Stat icon={FileVideo2} label="Produção" value={`${stats.published}/${stats.target || 0}`} hint={`${ready.length} em andamento`} />
        <Stat icon={BarChart3} label="Views registradas" value={formatCompact(stats.views)} hint={`${posts.length} posts monitorados`} />
      </section>

      {urgent.length > 0 && <section className="ops-attention-grid">{urgent.map((item) => <AttentionCard key={item.key} item={item} />)}</section>}

      <section className="ops-grid-2">
        <Panel eyebrow="EXECUÇÃO" title="Próximas ações" icon={ListChecks}>
          {openTasks.length ? <div className="ops-task-list">{openTasks.map((task) => <TaskRow key={task.id} task={task} campaigns={campaigns} onToggle={() => onTask(task)} />)}</div> : <Empty icon={CheckCircle2} text="Nenhuma tarefa pendente." />}
        </Panel>
        <Panel eyebrow="PRODUÇÃO" title="Conteúdo em movimento" icon={Clapperboard}>
          {ready.length ? <div className="ops-moving-list">{ready.slice(0, 6).map((item) => { const campaign = campaigns.find((entry) => entry.id === item.campaign_id); return <div key={item.id}><span className={`ops-dot ${item.status}`} /><div><strong>{item.title}</strong><p>{campaign?.name || "Campanha"}</p></div><small>{CONTENT_STATUS[item.status]}</small></div>; })}</div> : <Empty icon={PlayCircle} text="Os vídeos que entrarem em produção aparecem aqui." />}
        </Panel>
      </section>

      <Panel eyebrow="PIPELINE" title="Campanhas prioritárias" icon={Zap}>
        <div className="ops-campaign-rows">
          {campaigns.slice(0, 6).map((campaign) => <CampaignRow key={campaign.id} campaign={campaign} content={content} />)}
        </div>
      </Panel>
    </div>
  );
}

function Stat({ icon: Icon, label, value, hint }) {
  return <article className="ops-stat"><div className="ops-stat-icon"><Icon size={20} /></div><p>{label}</p><strong>{value}</strong><span>{hint}</span></article>;
}

function Panel({ eyebrow, title, icon: Icon, action, children }) {
  return <section className="ops-panel"><header className="ops-panel-head"><div><p className="ops-eyebrow">{eyebrow}</p><h2>{title}</h2></div><div className="ops-panel-head-right">{action}{Icon && <Icon size={20} />}</div></header>{children}</section>;
}

function AttentionCard({ item }) {
  const Icon = item.icon || AlertTriangle;
  return <article className={`ops-attention p${item.priority}`}><div className="ops-attention-icon"><Icon size={20} /></div><div><span>{item.label}</span><strong>{item.title}</strong><p>{item.body}</p></div></article>;
}

function TaskRow({ task, campaigns, onToggle }) {
  const campaign = campaigns.find((item) => item.id === task.campaign_id);
  return <button className="ops-task-row" onClick={onToggle}><span className={`ops-task-check ${task.status === "done" ? "done" : ""}`}>{task.status === "done" && <Check size={14} />}</span><div><strong>{task.title}</strong><p>{campaign?.name || "Operação geral"}{task.notes ? ` · ${task.notes}` : ""}</p></div><span className={`ops-priority p${task.priority}`}>P{task.priority}</span></button>;
}

function CampaignRow({ campaign, content }) {
  const produced = content.filter((item) => item.campaign_id === campaign.id && item.status === "published").length;
  const target = Number(campaign.videos_target || 0);
  const progress = target ? Math.min(100, Math.round((produced / target) * 100)) : 0;
  return <div className="ops-campaign-row"><div className="ops-campaign-row-main"><div className="ops-row-title"><strong>{campaign.name}</strong><span className={`ops-pill ${campaign.status}`}>{STATUS_LABELS[campaign.status]}</span></div><p>{campaign.ugc_clients?.name || "Cliente"} · {POSTING_LABELS[campaign.posting_mode]}</p><div className="ops-progress"><span style={{ width: `${progress}%` }} /></div></div><div className="ops-row-score"><strong>{produced}/{target || "—"}</strong><small>{progress}%</small></div></div>;
}

function ContractsView({ contracts, campaigns, onNew }) {
  const active = contracts.filter((item) => ["accepted", "active"].includes(item.status)).length;
  const assessments = contracts.filter((item) => item.status === "assessment").length;
  return <div className="ops-stack">
    <section className="ops-stat-grid ops-stat-grid-3"><Stat icon={FileText} label="Contratos" value={contracts.length} hint="total cadastrado" /><Stat icon={Activity} label="Em assessment" value={assessments} hint="períodos de avaliação" /><Stat icon={CheckCircle2} label="Aceitos / ativos" value={active} hint="receita em execução" /></section>
    <div className="ops-section-actions"><button className="ops-primary" onClick={onNew}><Plus size={18} />Novo contrato</button></div>
    <section className="ops-contract-grid">
      {contracts.map((contract) => {
        const campaign = campaigns.find((item) => item.id === contract.campaign_id);
        return <article className="ops-contract-card" key={contract.id}><header><span className={`ops-pill ${contract.status}`}>{STATUS_LABELS[contract.status] || contract.status}</span><small>{contract.source || "Origem não informada"}</small></header><h2>{contract.title}</h2><p>{contract.notes || "Sem observações."}</p><div className="ops-contract-facts"><div><span>Campanha</span><strong>{campaign?.name || "Ainda não vinculada"}</strong></div><div><span>Volume</span><strong>{contract.videos_per_month ? `${contract.videos_per_month} vídeos/mês` : "A definir"}</strong></div><div><span>Valor</span><strong>{contract.monthly_amount ? formatMoney(contract.monthly_amount, contract.currency) : "A validar"}</strong></div></div>{contract.payment_notes && <div className="ops-callout"><MessageCircle size={17} /><span>{contract.payment_notes}</span></div>}{contract.contract_url && <a className="ops-text-link" href={contract.contract_url} target="_blank" rel="noreferrer"><Link2 size={15} />Abrir referência</a>}</article>;
      })}
    </section>
  </div>;
}

function CampaignsView({ campaignPerformance }) {
  return <section className="ops-campaign-grid">{campaignPerformance.map(({ campaign, views, publishedCount, target, productionProgress, viewGoal, viewProgress }) => {
    const rules = safeJson(campaign.rules);
    return <article className="ops-campaign-card" key={campaign.id}><header><span className={`ops-pill ${campaign.status}`}>{STATUS_LABELS[campaign.status]}</span><span className={`ops-mode ${campaign.posting_mode}`}>{POSTING_LABELS[campaign.posting_mode]}</span></header><h2>{campaign.name}</h2><p>{campaign.brief || "Sem briefing resumido."}</p><div className="ops-platforms">{(campaign.platforms || []).map((platform) => <span key={platform}>{platformLabel(platform)}</span>)}</div><div className="ops-kpi-row"><div><span>Produção</span><strong>{publishedCount}/{target || "—"}</strong></div><div><span>Views</span><strong>{formatCompact(views)}</strong></div><div><span>Meta de views</span><strong>{viewGoal ? formatCompact(viewGoal) : "—"}</strong></div></div><div className="ops-progress large"><span style={{ width: `${productionProgress}%` }} /></div>{viewProgress !== null && <div className="ops-view-goal"><Target size={16} /><span>{viewProgress}% da meta de visualizações</span></div>}{rules.manual_posting_required && <div className="ops-callout warning"><ShieldCheck size={17} /><span>Publicação manual obrigatória nesta campanha.</span></div>}</article>;
  })}</section>;
}

function ContentView({ campaigns, content, onUpload, onAdvance }) {
  const stages = ["idea", "scripted", "recorded", "editing", "review", "approved", "queued", "published"];
  return <div className="ops-stack"><div className="ops-section-actions"><button className="ops-primary" onClick={onUpload}><Upload size={18} />Enviar vídeo</button></div><section className="ops-kanban">{stages.map((stage) => {
    const items = content.filter((item) => item.status === stage);
    return <div className="ops-kanban-col" key={stage}><header><span>{CONTENT_STATUS[stage]}</span><b>{items.length}</b></header><div className="ops-kanban-items">{items.map((item) => {
      const campaign = campaigns.find((entry) => entry.id === item.campaign_id);
      const next = NEXT_CONTENT_STATUS[item.status];
      return <article key={item.id}><small>{campaign?.name || "Campanha"}</small><strong>{item.title}</strong>{item.hook && <p>“{item.hook}”</p>}<footer><span>{item.language}</span><span>{item.duration_seconds ? `${item.duration_seconds}s` : item.concept || "—"}</span></footer>{next && <button className="ops-card-action" onClick={() => onAdvance(item)}>Avançar para {CONTENT_STATUS[next]} <ChevronRight size={15} /></button>}</article>;
    })}{!items.length && <div className="ops-kanban-empty">—</div>}</div></div>;
  })}</section></div>;
}

function PerformanceView({ rows, campaignPerformance, onMetric }) {
  const chartData = campaignPerformance.filter((item) => item.views > 0).map((item) => ({ name: item.campaign.name.replace(" — ", " ").slice(0, 22), views: item.views }));
  return <div className="ops-stack"><div className="ops-section-actions"><button className="ops-primary" onClick={onMetric}><Plus size={18} />Registrar métricas</button></div>
    <section className="ops-grid-2">
      <Panel eyebrow="ALCANCE" title="Views por campanha" icon={BarChart3}>{chartData.length ? <div className="ops-chart"><ResponsiveContainer width="100%" height={260}><BarChart data={chartData}><CartesianGrid vertical={false} strokeDasharray="3 3" /><XAxis dataKey="name" tick={{ fontSize: 11 }} /><YAxis tickFormatter={formatCompact} width={42} /><Tooltip formatter={(value) => [Number(value).toLocaleString("pt-BR"), "Views"]} /><Bar dataKey="views" radius={[7,7,0,0]} /></BarChart></ResponsiveContainer></div> : <Empty icon={TrendingUp} text="Registre as primeiras métricas para liberar os gráficos." />}</Panel>
      <Panel eyebrow="SINAL" title="Leitura da operação" icon={BrainCircuit}><div className="ops-insight-list">{campaignPerformance.map((item) => <div key={item.campaign.id}><span className={`ops-health ${item.viewProgress !== null && item.viewProgress >= 100 ? "good" : item.productionProgress >= 50 ? "mid" : "low"}`} /><div><strong>{item.campaign.name}</strong><p>{item.viewGoal ? `${item.views.toLocaleString("pt-BR")} / ${item.viewGoal.toLocaleString("pt-BR")} views` : `${item.publishedCount}/${item.target || "—"} vídeos publicados`}</p></div></div>)}</div></Panel>
    </section>
    <Panel eyebrow="RANKING" title="Posts monitorados" icon={Activity}>{rows.length ? <div className="ops-table-wrap"><table><thead><tr><th>Conteúdo</th><th>Plataforma</th><th>Views</th><th>Engajamento</th><th>Captura</th></tr></thead><tbody>{rows.map((row) => <tr key={row.post.id}><td><strong>{row.item?.title || "Conteúdo"}</strong><small>{row.campaign?.name}</small></td><td>{platformLabel(row.post.platform)}</td><td>{row.views.toLocaleString("pt-BR")}</td><td>{row.engagement.toFixed(1)}%</td><td>{formatDate(row.metric?.captured_at, true)}</td></tr>)}</tbody></table></div> : <Empty icon={BarChart3} text="Nenhum post registrado ainda. O sistema já está pronto para receber dados manuais antes das APIs." />}</Panel>
  </div>;
}

function CopilotView({ actions, notes, campaigns, onResolve }) {
  return <div className="ops-stack">
    <section className="ops-copilot-hero"><div className="ops-copilot-orb"><WandSparkles size={28} /></div><div><p className="ops-eyebrow">COPILOTO OPERACIONAL</p><h2>Próxima melhor ação</h2><p>Regras, riscos e oportunidades calculados a partir do estado real da operação.</p></div></section>
    <section className="ops-grid-2">
      <Panel eyebrow="AGORA" title="Recomendações" icon={Bot}>{actions.length ? <div className="ops-action-list">{actions.map((item) => <div className={`ops-action-item p${item.priority}`} key={item.key}><div><span>{item.label}</span><strong>{item.title}</strong><p>{item.body}</p></div></div>)}</div> : <Empty icon={CheckCircle2} text="Nenhuma recomendação crítica agora." />}</Panel>
      <Panel eyebrow="MEMÓRIA" title="Notas persistentes" icon={BrainCircuit}>{notes.length ? <div className="ops-note-list">{notes.map((note) => { const campaign = campaigns.find((item) => item.id === note.campaign_id); return <button key={note.id} className={note.resolved ? "resolved" : ""} onClick={() => onResolve(note)}><span className={`ops-note-kind ${note.kind}`}>{note.kind}</span><div><strong>{note.title}</strong><p>{note.body}</p><small>{campaign?.name || "Operação geral"}</small></div><CheckCircle2 size={18} /></button>; })}</div> : <Empty icon={BrainCircuit} text="O Copiloto ainda não registrou notas." />}</Panel>
    </section>
    <Panel eyebrow="PLAYBOOK" title="Regras que o sistema nunca deve quebrar" icon={ShieldCheck}><div className="ops-rule-grid"><div><ShieldCheck size={20} /><strong>Manual continua manual</strong><p>Campanhas `MANUAL_ONLY` não podem entrar na fila de autopost.</p></div><div><Target size={20} /><strong>Briefing vem antes do algoritmo</strong><p>Volume, prazo, plataforma e restrições contratuais têm precedência.</p></div><div><Activity size={20} /><strong>Otimizar com dados reais</strong><p>Hooks e formatos são comparados após métricas, sem inventar performance.</p></div></div></Panel>
  </div>;
}

function CalendarView({ posts, tasks, campaigns }) {
  const items = [
    ...posts.filter((post) => post.scheduled_at || post.published_at).map((post) => ({ id: `post-${post.id}`, date: post.scheduled_at || post.published_at, title: `${platformLabel(post.platform)} — ${post.status === "published" ? "publicado" : "publicação"}`, type: "post", campaignId: post.campaign_id })),
    ...tasks.filter((task) => task.due_at && !["done", "cancelled"].includes(task.status)).map((task) => ({ id: `task-${task.id}`, date: task.due_at, title: task.title, type: "task", campaignId: task.campaign_id })),
  ].sort((a, b) => new Date(a.date) - new Date(b.date));
  return <Panel eyebrow="CRONOGRAMA" title="Agenda operacional" icon={CalendarDays}>{items.length ? <div className="ops-timeline">{items.map((item) => { const campaign = campaigns.find((entry) => entry.id === item.campaignId); return <div key={item.id}><time>{formatDate(item.date, true)}</time><span className={`ops-timeline-dot ${item.type}`} /><div><strong>{item.title}</strong><p>{campaign?.name || "Operação geral"}</p></div></div>; })}</div> : <Empty icon={CalendarDays} text="Nenhuma data definida ainda. Tarefas sem prazo continuam visíveis na Central do dia." />}</Panel>;
}

function FinanceView({ campaigns, payments, contracts }) {
  const expected = groupMoney(payments, (item) => !["paid", "cancelled"].includes(item.status));
  const paid = groupMoney(payments, (item) => item.status === "paid");
  const contracted = {};
  contracts.filter((item) => item.monthly_amount && ["accepted", "active"].includes(item.status)).forEach((item) => { contracted[item.currency || "USD"] = (contracted[item.currency || "USD"] || 0) + Number(item.monthly_amount); });
  const contractedLabel = Object.keys(contracted).length ? Object.entries(contracted).map(([currency, value]) => formatMoney(value, currency)).join(" + ") : "A validar";
  return <div className="ops-stack"><section className="ops-stat-grid ops-stat-grid-3"><Stat icon={CircleDollarSign} label="Receita mensal contratada" value={contractedLabel} hint="somente contratos com valor confirmado" /><Stat icon={Clock3} label="A receber" value={expected} hint="pagamentos em aberto" /><Stat icon={CheckCircle2} label="Recebido" value={paid} hint="pagamentos concluídos" /></section><Panel eyebrow="CAIXA" title="Pagamentos" icon={CircleDollarSign}>{payments.length ? <div className="ops-table-wrap"><table><thead><tr><th>Campanha</th><th>Descrição</th><th>Valor</th><th>Status</th><th>Vencimento</th></tr></thead><tbody>{payments.map((payment) => { const campaign = campaigns.find((item) => item.id === payment.campaign_id); return <tr key={payment.id}><td>{campaign?.name || "—"}</td><td>{payment.description || "Pagamento"}</td><td>{formatMoney(payment.amount, payment.currency)}</td><td><span className={`ops-pill ${payment.status}`}>{payment.status}</span></td><td>{formatDate(payment.due_at)}</td></tr>; })}</tbody></table></div> : <Empty icon={CircleDollarSign} text="Nenhum pagamento lançado. Valores ambíguos de propostas não entram como receita confirmada." />}</Panel></div>;
}

function buildCopilotActions({ campaigns, content, posts, tasks, contracts, notes, socialAccounts, campaignPerformance }) {
  const actions = [];
  const openTasks = tasks.filter((item) => !["done", "cancelled"].includes(item.status));
  const priorityTask = openTasks.find((item) => Number(item.priority) === 1);
  if (priorityTask) actions.push({ key: `task-${priorityTask.id}`, priority: 1, label: "FOCO", icon: ListChecks, title: priorityTask.title, body: priorityTask.notes || "Existe uma tarefa P1 aberta na operação." });

  campaigns.filter((item) => item.posting_mode === "manual_only" && ["preparing", "assessment", "active"].includes(item.status)).forEach((campaign) => {
    actions.push({ key: `manual-${campaign.id}`, priority: 1, label: "REGRA", icon: ShieldCheck, title: `${campaign.name}: publicação manual`, body: "O sistema pode preparar tudo, mas não deve autopublicar enquanto essa regra estiver ativa." });
  });

  campaignPerformance.filter((item) => item.viewGoal > 0).forEach((item) => {
    if (!item.views) actions.push({ key: `goal-start-${item.campaign.id}`, priority: 2, label: "ESTRATÉGIA", icon: Target, title: `Prepare a medição de ${item.campaign.name}`, body: `A campanha possui meta de ${item.viewGoal.toLocaleString("pt-BR")} views. Registre cada post e suas métricas para otimizar o próximo vídeo.` });
    else if (item.viewProgress < 60) actions.push({ key: `goal-${item.campaign.id}`, priority: 2, label: "PERFORMANCE", icon: TrendingUp, title: `${item.viewProgress}% da meta de views`, body: "Use os próximos conteúdos para repetir os hooks e formatos que estiverem acima da média." });
  });

  const approved = content.filter((item) => ["approved", "queued"].includes(item.status));
  if (approved.length) actions.push({ key: "approved-content", priority: 2, label: "FILA", icon: Send, title: `${approved.length} conteúdo(s) pronto(s) para publicação`, body: "Confirme a regra da campanha antes de publicar ou agendar." });

  const ambiguousContracts = contracts.filter((item) => !item.monthly_amount && item.payment_notes && ["assessment", "negotiating", "accepted"].includes(item.status));
  if (ambiguousContracts.length) actions.push({ key: "contract-values", priority: 2, label: "CONTRATO", icon: FileText, title: "Há remuneração que ainda precisa ser validada", body: "O Financeiro não contabiliza valores ambíguos como receita até existir confirmação." });

  if (!socialAccounts.length) actions.push({ key: "social-oauth", priority: 3, label: "INFRA", icon: Link2, title: "Contas sociais ainda não conectadas por API", body: "Enquanto isso, use Registrar post + Métricas. A operação já funciona em modo assistido/manual." });

  const unresolvedNotes = notes.filter((item) => !item.resolved && item.priority === 1);
  unresolvedNotes.slice(0, 2).forEach((note) => actions.push({ key: `note-${note.id}`, priority: note.priority, label: note.kind.toUpperCase(), icon: BrainCircuit, title: note.title, body: note.body }));

  return actions.sort((a, b) => a.priority - b.priority).slice(0, 10);
}

function NewCampaign({ userId, onClose, onSaved }) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ client: "", name: "", status: "pipeline", posting_mode: "assisted", videos_target: "", posts_target: "", base_amount: "", currency: "USD", platforms: ["tiktok"], brief: "" });
  const toggle = (platform) => setForm((state) => ({ ...state, platforms: state.platforms.includes(platform) ? state.platforms.filter((item) => item !== platform) : [...state.platforms, platform] }));
  async function save(event) {
    event.preventDefault(); setSaving(true);
    const { data: client, error: clientError } = await supabase.from("ugc_clients").insert({ user_id: userId, name: form.client || form.name, currency: form.currency }).select("id").single();
    if (clientError) { setSaving(false); return; }
    const { error } = await supabase.from("ugc_campaigns").insert({ user_id: userId, client_id: client.id, name: form.name, status: form.status, posting_mode: form.posting_mode, videos_target: form.videos_target ? Number(form.videos_target) : null, posts_target: form.posts_target ? Number(form.posts_target) : null, base_amount: form.base_amount ? Number(form.base_amount) : null, platforms: form.platforms, payment_model: "flat", brief: form.brief });
    setSaving(false); if (!error) onSaved();
  }
  return <Modal title="Nova campanha" onClose={onClose}><form className="ops-form" onSubmit={save}><label>Cliente<input value={form.client} onChange={(e) => setForm({ ...form, client: e.target.value })} required /></label><label>Campanha<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label><div className="ops-form-grid"><label>Status<select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}><option value="pipeline">No radar</option><option value="preparing">Preparando</option><option value="assessment">Assessment</option><option value="active">Ativa</option></select></label><label>Modo de publicação<select value={form.posting_mode} onChange={(e) => setForm({ ...form, posting_mode: e.target.value })}><option value="assisted">Assistido</option><option value="manual_only">Somente manual</option><option value="auto">Automático</option></select></label></div><div className="ops-form-grid"><label>Meta de vídeos<input type="number" min="0" value={form.videos_target} onChange={(e) => setForm({ ...form, videos_target: e.target.value })} /></label><label>Meta de posts<input type="number" min="0" value={form.posts_target} onChange={(e) => setForm({ ...form, posts_target: e.target.value })} /></label></div><label>Briefing resumido<textarea value={form.brief} onChange={(e) => setForm({ ...form, brief: e.target.value })} rows="3" /></label><fieldset><legend>Plataformas</legend><div className="ops-check-row">{["tiktok", "instagram", "youtube", "facebook"].map((platform) => <label key={platform}><input type="checkbox" checked={form.platforms.includes(platform)} onChange={() => toggle(platform)} />{platformLabel(platform)}</label>)}</div></fieldset><button className="ops-primary" disabled={saving}>{saving ? "Criando…" : "Criar campanha"}</button></form></Modal>;
}

function NewContract({ userId, clients, campaigns, onClose, onSaved }) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ title: "", client_id: clients[0]?.id || "", campaign_id: "", status: "pipeline", source: "", monthly_amount: "", currency: "USD", videos_per_month: "", min_months: "", payment_notes: "", contract_url: "", notes: "" });
  async function save(event) {
    event.preventDefault(); setSaving(true);
    const { error } = await supabase.from("ugc_contracts").insert({ user_id: userId, client_id: form.client_id || null, campaign_id: form.campaign_id || null, title: form.title, status: form.status, source: form.source || null, monthly_amount: form.monthly_amount ? Number(form.monthly_amount) : null, currency: form.currency, videos_per_month: form.videos_per_month ? Number(form.videos_per_month) : null, min_months: form.min_months ? Number(form.min_months) : null, payment_notes: form.payment_notes || null, contract_url: form.contract_url || null, notes: form.notes || null });
    setSaving(false); if (!error) onSaved();
  }
  return <Modal title="Novo contrato / proposta" onClose={onClose}><form className="ops-form" onSubmit={save}><label>Título<input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required /></label><div className="ops-form-grid"><label>Cliente<select value={form.client_id} onChange={(e) => setForm({ ...form, client_id: e.target.value })}><option value="">Sem vínculo</option>{clients.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Campanha<select value={form.campaign_id} onChange={(e) => setForm({ ...form, campaign_id: e.target.value })}><option value="">Sem vínculo</option>{campaigns.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div><div className="ops-form-grid"><label>Status<select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>{["pipeline","invited","assessment","negotiating","accepted","active","completed","rejected","paused"].map((status) => <option key={status} value={status}>{STATUS_LABELS[status] || status}</option>)}</select></label><label>Origem<input value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} placeholder="SideShift, e-mail..." /></label></div><div className="ops-form-grid"><label>Valor mensal confirmado<input type="number" min="0" step="0.01" value={form.monthly_amount} onChange={(e) => setForm({ ...form, monthly_amount: e.target.value })} /></label><label>Moeda<select value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}><option>USD</option><option>GBP</option><option>BRL</option><option>EUR</option></select></label></div><div className="ops-form-grid"><label>Vídeos/mês<input type="number" min="0" value={form.videos_per_month} onChange={(e) => setForm({ ...form, videos_per_month: e.target.value })} /></label><label>Compromisso mínimo (meses)<input type="number" min="0" value={form.min_months} onChange={(e) => setForm({ ...form, min_months: e.target.value })} /></label></div><label>Condições de pagamento<textarea rows="2" value={form.payment_notes} onChange={(e) => setForm({ ...form, payment_notes: e.target.value })} /></label><label>Link / contrato<input type="url" value={form.contract_url} onChange={(e) => setForm({ ...form, contract_url: e.target.value })} /></label><label>Observações<textarea rows="3" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label><button className="ops-primary" disabled={saving}>{saving ? "Salvando…" : "Salvar contrato"}</button></form></Modal>;
}

function UploadContent({ userId, campaigns, onClose, onSaved }) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ campaign_id: campaigns[0]?.id || "", title: "", hook: "", concept: "", status: "recorded" });
  const [file, setFile] = useState(null);
  async function save(event) {
    event.preventDefault(); if (!file || !form.campaign_id) return; setSaving(true);
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
    const path = `${userId}/${form.campaign_id}/${Date.now()}-${safeName}`;
    const { error: uploadError } = await supabase.storage.from("ugc-media").upload(path, file, { contentType: file.type || "video/mp4" });
    if (uploadError) { setSaving(false); return; }
    const { error } = await supabase.from("ugc_content").insert({ user_id: userId, campaign_id: form.campaign_id, title: form.title, hook: form.hook || null, concept: form.concept || null, status: form.status, storage_path: path });
    setSaving(false); if (!error) onSaved();
  }
  return <Modal title="Enviar conteúdo" onClose={onClose}><form className="ops-form" onSubmit={save}><label>Campanha<select value={form.campaign_id} onChange={(e) => setForm({ ...form, campaign_id: e.target.value })} required>{campaigns.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Título<input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required /></label><label>Hook<input value={form.hook} onChange={(e) => setForm({ ...form, hook: e.target.value })} placeholder="Primeiros 3 segundos…" /></label><label>Conceito<input value={form.concept} onChange={(e) => setForm({ ...form, concept: e.target.value })} placeholder="Hook + demo, storytelling..." /></label><label>Arquivo<input type="file" accept="video/mp4,video/quicktime,video/webm" onChange={(e) => setFile(e.target.files?.[0] || null)} required /></label><button className="ops-primary" disabled={saving}>{saving ? "Enviando…" : "Salvar vídeo"}</button></form></Modal>;
}

function RegisterPost({ userId, campaigns, content, onClose, onSaved }) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ content_id: content[0]?.id || "", platform: "tiktok", status: "published", post_url: "", published_at: new Date().toISOString().slice(0, 16) });
  const selectedContent = content.find((item) => item.id === form.content_id);
  const selectedCampaign = campaigns.find((item) => item.id === selectedContent?.campaign_id);
  const mode = selectedCampaign?.posting_mode || "assisted";
  async function save(event) {
    event.preventDefault(); if (!selectedContent || !selectedCampaign) return; setSaving(true);
    const { error } = await supabase.from("ugc_posts").insert({ user_id: userId, campaign_id: selectedCampaign.id, content_id: selectedContent.id, platform: form.platform, posting_mode: mode, status: form.status, post_url: form.post_url || null, published_at: form.status === "published" ? new Date(form.published_at).toISOString() : null });
    if (!error && form.status === "published") await supabase.from("ugc_content").update({ status: "published", updated_at: new Date().toISOString() }).eq("id", selectedContent.id).eq("user_id", userId);
    setSaving(false); if (!error) onSaved();
  }
  return <Modal title="Registrar publicação" onClose={onClose}><form className="ops-form" onSubmit={save}><label>Conteúdo<select value={form.content_id} onChange={(e) => setForm({ ...form, content_id: e.target.value })} required><option value="">Selecione</option>{content.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>{selectedCampaign && <div className={`ops-form-rule ${mode}`}><ShieldCheck size={18} /><div><strong>{POSTING_LABELS[mode]}</strong><span>{mode === "manual_only" ? "Registre aqui depois de publicar manualmente na rede social." : "O registro respeitará o modo configurado na campanha."}</span></div></div>}<div className="ops-form-grid"><label>Plataforma<select value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value })}>{(selectedCampaign?.platforms || ["tiktok","instagram","youtube"]).map((platform) => <option key={platform} value={platform}>{platformLabel(platform)}</option>)}</select></label><label>Status<select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}><option value="published">Publicado</option><option value="queued">Na fila</option><option value="draft">Rascunho</option></select></label></div>{form.status === "published" && <label>Data/hora<input type="datetime-local" value={form.published_at} onChange={(e) => setForm({ ...form, published_at: e.target.value })} /></label>}<label>URL do post<input type="url" value={form.post_url} onChange={(e) => setForm({ ...form, post_url: e.target.value })} placeholder="https://..." /></label><button className="ops-primary" disabled={saving}>{saving ? "Salvando…" : "Registrar post"}</button></form></Modal>;
}

function AddMetric({ userId, posts, content, onClose, onSaved }) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ post_id: posts[0]?.id || "", views: "", likes: "", comments: "", saves: "", shares: "", avg_watch_percentage: "" });
  const selectedPost = posts.find((item) => item.id === form.post_id);
  const selectedContent = content.find((item) => item.id === selectedPost?.content_id);
  async function save(event) {
    event.preventDefault(); if (!form.post_id) return; setSaving(true);
    const payload = { user_id: userId, post_id: form.post_id, views: Number(form.views || 0), likes: Number(form.likes || 0), comments: Number(form.comments || 0), saves: Number(form.saves || 0), shares: Number(form.shares || 0), avg_watch_percentage: form.avg_watch_percentage ? Number(form.avg_watch_percentage) : null };
    const { error } = await supabase.from("ugc_metrics").insert(payload);
    setSaving(false); if (!error) onSaved();
  }
  return <Modal title="Registrar métricas" onClose={onClose}><form className="ops-form" onSubmit={save}><label>Post<select value={form.post_id} onChange={(e) => setForm({ ...form, post_id: e.target.value })} required><option value="">Selecione</option>{posts.map((post) => { const item = content.find((entry) => entry.id === post.content_id); return <option key={post.id} value={post.id}>{platformLabel(post.platform)} — {item?.title || "Conteúdo"}</option>; })}</select></label>{selectedContent && <div className="ops-mini-preview"><strong>{selectedContent.title}</strong><span>{selectedContent.hook}</span></div>}<div className="ops-form-grid"><label>Views<input type="number" min="0" value={form.views} onChange={(e) => setForm({ ...form, views: e.target.value })} /></label><label>Likes<input type="number" min="0" value={form.likes} onChange={(e) => setForm({ ...form, likes: e.target.value })} /></label></div><div className="ops-form-grid"><label>Comentários<input type="number" min="0" value={form.comments} onChange={(e) => setForm({ ...form, comments: e.target.value })} /></label><label>Salvamentos<input type="number" min="0" value={form.saves} onChange={(e) => setForm({ ...form, saves: e.target.value })} /></label></div><div className="ops-form-grid"><label>Compartilhamentos<input type="number" min="0" value={form.shares} onChange={(e) => setForm({ ...form, shares: e.target.value })} /></label><label>Retenção média (%)<input type="number" min="0" max="100" step="0.1" value={form.avg_watch_percentage} onChange={(e) => setForm({ ...form, avg_watch_percentage: e.target.value })} /></label></div><button className="ops-primary" disabled={saving}>{saving ? "Salvando…" : "Salvar métricas"}</button></form></Modal>;
}

function Modal({ title, children, onClose }) {
  return <div className="ops-modal-backdrop" onMouseDown={onClose}><section className="ops-modal" onMouseDown={(event) => event.stopPropagation()}><header><h2>{title}</h2><button onClick={onClose}>×</button></header>{children}</section></div>;
}

function Empty({ icon: Icon = Users, text }) {
  return <div className="ops-empty"><Icon size={27} /><p>{text}</p></div>;
}
