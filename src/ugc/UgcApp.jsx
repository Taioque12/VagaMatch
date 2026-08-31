import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  Clapperboard,
  Clock3,
  FileVideo2,
  LayoutDashboard,
  LogOut,
  Plus,
  RefreshCw,
  Send,
  Settings2,
  Sparkles,
  Target,
  Upload,
  Users,
  Zap,
} from "lucide-react";
import { supabase } from "../lib/supabase.js";
import "./ugc.css";

const STATUS_LABELS = {
  pipeline: "No radar",
  preparing: "Preparando",
  assessment: "Assessment",
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

function money(value = 0, currency = "USD") {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(Number(value || 0));
}

function formatDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(new Date(value));
}

function platformLabel(platform) {
  return {
    tiktok: "TikTok",
    instagram: "Instagram",
    youtube: "YouTube",
    facebook: "Facebook",
  }[platform] || platform;
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
    <main className="ugc-login">
      <section className="ugc-login-card">
        <div className="ugc-brand-mark"><Sparkles size={24} /></div>
        <p className="ugc-eyebrow">TAION LABS</p>
        <h1>UGC Ops</h1>
        <p className="ugc-login-copy">Central de contratos, produção, publicação e performance UGC.</p>
        <form onSubmit={sendMagicLink}>
          <label>E-mail</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="voce@email.com" />
          <button className="ugc-primary" type="submit" disabled={loading}>
            {loading ? <RefreshCw className="spin" size={18} /> : <Send size={18} />}
            Enviar link de acesso
          </button>
        </form>
        {message && <p className="ugc-login-message">{message}</p>}
      </section>
    </main>
  );
}

export function UgcApp() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [tab, setTab] = useState("overview");
  const [campaigns, setCampaigns] = useState([]);
  const [content, setContent] = useState([]);
  const [posts, setPosts] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [payments, setPayments] = useState([]);
  const [metrics, setMetrics] = useState([]);
  const [showNewCampaign, setShowNewCampaign] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [error, setError] = useState("");

  const userId = session?.user?.id;

  const seedInitialCampaigns = useCallback(async (uid) => {
    const { data: existing, error: existingError } = await supabase
      .from("ugc_campaigns")
      .select("id")
      .eq("user_id", uid)
      .limit(1);
    if (existingError || existing?.length) return;

    const { data: clients, error: clientsError } = await supabase
      .from("ugc_clients")
      .insert([
        { user_id: uid, name: "Howbout", brand_url: "https://howbout.app", currency: "GBP", notes: "Trial de creator/ambassador." },
        { user_id: uid, name: "ReciBites", brand_url: "https://recibites.app", currency: "USD", notes: "Creator assessment de 5 dias." },
      ])
      .select("id,name");
    if (clientsError) throw clientsError;

    const howbout = clients.find((client) => client.name === "Howbout");
    const reci = clients.find((client) => client.name === "ReciBites");

    const { error: campaignError } = await supabase.from("ugc_campaigns").insert([
      {
        user_id: uid,
        client_id: howbout?.id,
        name: "Howbout Ambassador — Trial Week",
        status: "assessment",
        posting_mode: "assisted",
        language: "pt-BR",
        videos_target: 10,
        posts_target: 10,
        payment_model: "assessment",
        base_amount: 25,
        platforms: ["tiktok"],
        goals: { deadline: "sexta 10:00 Londres", max_per_day: 3 },
        rules: { dedicated_account: true },
        brief: "Publicar 10 vídeos no TikTok durante a semana de teste. Idealmente no máximo 3 por dia.",
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
        payment_model: "assessment",
        base_amount: 0,
        platforms: ["tiktok", "instagram", "youtube"],
        goals: { views: 10000, comments_or_saves: 50, assessment_days: 5 },
        rules: { max_unique_videos_per_day: 1, manual_posting_required: true, hashtag: "#ReciBites" },
        brief: "5 vídeos novos em 5 dias, cross-post em 3 plataformas. Publicação manual obrigatória durante o assessment.",
        source_url: "https://recibites.app/",
      },
    ]);
    if (campaignError) throw campaignError;
  }, []);

  const loadData = useCallback(async (uid = userId) => {
    if (!uid) return;
    setSyncing(true);
    setError("");
    try {
      await seedInitialCampaigns(uid);
      const [campaignResult, contentResult, postResult, taskResult, paymentResult, metricResult] = await Promise.all([
        supabase.from("ugc_campaigns").select("*, ugc_clients(name,currency)").eq("user_id", uid).order("created_at", { ascending: false }),
        supabase.from("ugc_content").select("*").eq("user_id", uid).order("created_at", { ascending: false }),
        supabase.from("ugc_posts").select("*").eq("user_id", uid).order("created_at", { ascending: false }),
        supabase.from("ugc_tasks").select("*").eq("user_id", uid).order("due_at", { ascending: true, nullsFirst: false }),
        supabase.from("ugc_payments").select("*").eq("user_id", uid).order("created_at", { ascending: false }),
        supabase.from("ugc_metrics").select("*").eq("user_id", uid).order("captured_at", { ascending: false }).limit(1000),
      ]);
      const firstError = [campaignResult, contentResult, postResult, taskResult, paymentResult, metricResult].find((result) => result.error)?.error;
      if (firstError) throw firstError;
      setCampaigns(campaignResult.data || []);
      setContent(contentResult.data || []);
      setPosts(postResult.data || []);
      setTasks(taskResult.data || []);
      setPayments(paymentResult.data || []);
      setMetrics(metricResult.data || []);
    } catch (err) {
      setError(err.message || "Não foi possível sincronizar o UGC Ops.");
    } finally {
      setSyncing(false);
    }
  }, [seedInitialCampaigns, userId]);

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

  const stats = useMemo(() => {
    const activeCampaigns = campaigns.filter((item) => ["assessment", "active", "preparing"].includes(item.status)).length;
    const publishedContent = content.filter((item) => item.status === "published").length;
    const totalTarget = campaigns.reduce((sum, item) => sum + Number(item.videos_target || 0), 0);
    const latestMetrics = new Map();
    metrics.forEach((metric) => {
      if (!latestMetrics.has(metric.post_id)) latestMetrics.set(metric.post_id, metric);
    });
    const views = [...latestMetrics.values()].reduce((sum, metric) => sum + Number(metric.views || 0), 0);
    const receivable = payments.filter((item) => !["paid", "cancelled"].includes(item.status)).reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const doneTasks = tasks.filter((item) => item.status === "done").length;
    return { activeCampaigns, publishedContent, totalTarget, views, receivable, doneTasks };
  }, [campaigns, content, metrics, payments, tasks]);

  if (loading) return <div className="ugc-loading"><RefreshCw className="spin" /> Carregando UGC Ops…</div>;
  if (!session) return <Login onSession={setSession} />;

  async function logout() {
    await supabase.auth.signOut();
  }

  return (
    <div className="ugc-shell">
      <aside className="ugc-sidebar">
        <div className="ugc-logo">
          <div className="ugc-brand-mark"><Sparkles size={19} /></div>
          <div><strong>UGC Ops</strong><span>TAION LABS</span></div>
        </div>
        <nav>
          <NavButton active={tab === "overview"} icon={LayoutDashboard} label="Visão geral" onClick={() => setTab("overview")} />
          <NavButton active={tab === "campaigns"} icon={Target} label="Campanhas" badge={campaigns.length} onClick={() => setTab("campaigns")} />
          <NavButton active={tab === "content"} icon={Clapperboard} label="Conteúdo" badge={content.length} onClick={() => setTab("content")} />
          <NavButton active={tab === "calendar"} icon={CalendarDays} label="Agenda" onClick={() => setTab("calendar")} />
          <NavButton active={tab === "finance"} icon={CircleDollarSign} label="Financeiro" onClick={() => setTab("finance")} />
        </nav>
        <div className="ugc-sidebar-bottom">
          <button className="ugc-nav-button"><Settings2 size={18} />Configurações</button>
          <button className="ugc-nav-button" onClick={logout}><LogOut size={18} />Sair</button>
        </div>
      </aside>

      <main className="ugc-main">
        <header className="ugc-topbar">
          <div>
            <p className="ugc-eyebrow">OPERAÇÃO UGC</p>
            <h1>{tab === "overview" ? "Painel de controle" : { campaigns: "Campanhas", content: "Conteúdo", calendar: "Agenda", finance: "Financeiro" }[tab]}</h1>
          </div>
          <div className="ugc-actions">
            <button className="ugc-secondary" onClick={() => loadData()} disabled={syncing}><RefreshCw className={syncing ? "spin" : ""} size={17} />Sincronizar</button>
            <button className="ugc-primary" onClick={() => setShowNewCampaign(true)}><Plus size={18} />Nova campanha</button>
          </div>
        </header>

        {error && <div className="ugc-error">{error}</div>}

        {tab === "overview" && <Overview stats={stats} campaigns={campaigns} content={content} tasks={tasks} posts={posts} />}
        {tab === "campaigns" && <Campaigns campaigns={campaigns} content={content} />}
        {tab === "content" && <ContentBoard campaigns={campaigns} content={content} setShowUpload={setShowUpload} />}
        {tab === "calendar" && <CalendarView posts={posts} tasks={tasks} campaigns={campaigns} />}
        {tab === "finance" && <FinanceView campaigns={campaigns} payments={payments} />}
      </main>

      {showNewCampaign && <NewCampaign userId={userId} onClose={() => setShowNewCampaign(false)} onSaved={() => { setShowNewCampaign(false); loadData(); }} />}
      {showUpload && <UploadContent userId={userId} campaigns={campaigns} onClose={() => setShowUpload(false)} onSaved={() => { setShowUpload(false); loadData(); }} />}
    </div>
  );
}

function NavButton({ active, icon: Icon, label, badge, onClick }) {
  return <button className={`ugc-nav-button ${active ? "active" : ""}`} onClick={onClick}><Icon size={18} /><span>{label}</span>{badge > 0 && <em>{badge}</em>}</button>;
}

function Overview({ stats, campaigns, content, tasks, posts }) {
  const openTasks = tasks.filter((task) => !["done", "cancelled"].includes(task.status)).slice(0, 5);
  return (
    <div className="ugc-page-stack">
      <section className="ugc-stat-grid">
        <StatCard icon={Target} label="Campanhas em andamento" value={stats.activeCampaigns} hint={`${campaigns.length} no total`} />
        <StatCard icon={FileVideo2} label="Produção" value={`${stats.publishedContent}/${stats.totalTarget || 0}`} hint="vídeos publicados / meta" />
        <StatCard icon={BarChart3} label="Visualizações" value={stats.views.toLocaleString("pt-BR")} hint="última captura por post" />
        <StatCard icon={CircleDollarSign} label="A receber" value={money(stats.receivable)} hint="pagamentos esperados" />
      </section>

      <section className="ugc-grid-2">
        <div className="ugc-panel">
          <div className="ugc-panel-head"><div><p className="ugc-eyebrow">PIPELINE</p><h2>Campanhas prioritárias</h2></div><Zap size={20} /></div>
          <div className="ugc-campaign-list">
            {campaigns.slice(0, 5).map((campaign) => <CampaignRow key={campaign.id} campaign={campaign} content={content} />)}
          </div>
        </div>
        <div className="ugc-panel">
          <div className="ugc-panel-head"><div><p className="ugc-eyebrow">EXECUÇÃO</p><h2>Próximas tarefas</h2></div><Clock3 size={20} /></div>
          {openTasks.length ? <div className="ugc-task-list">{openTasks.map((task) => <TaskRow key={task.id} task={task} campaigns={campaigns} />)}</div> : <EmptyState text="Nenhuma tarefa pendente. Crie conteúdo ou uma campanha para começar." />}
        </div>
      </section>

      <section className="ugc-panel">
        <div className="ugc-panel-head"><div><p className="ugc-eyebrow">PUBLICAÇÃO</p><h2>Fila de posts</h2></div><Send size={20} /></div>
        {posts.length ? <div className="ugc-table-wrap"><table><thead><tr><th>Plataforma</th><th>Status</th><th>Modo</th><th>Agendado</th></tr></thead><tbody>{posts.slice(0, 8).map((post) => <tr key={post.id}><td>{platformLabel(post.platform)}</td><td><span className={`ugc-pill ${post.status}`}>{post.status}</span></td><td>{POSTING_LABELS[post.posting_mode]}</td><td>{formatDate(post.scheduled_at)}</td></tr>)}</tbody></table></div> : <EmptyState text="A fila será preenchida quando os vídeos forem aprovados para publicação." />}
      </section>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, hint }) {
  return <article className="ugc-stat"><div className="ugc-stat-icon"><Icon size={21} /></div><p>{label}</p><strong>{value}</strong><span>{hint}</span></article>;
}

function CampaignRow({ campaign, content }) {
  const produced = content.filter((item) => item.campaign_id === campaign.id && item.status === "published").length;
  const target = Number(campaign.videos_target || 0);
  const progress = target ? Math.min(100, Math.round((produced / target) * 100)) : 0;
  return <div className="ugc-campaign-row"><div><div className="ugc-row-title"><strong>{campaign.name}</strong><span className={`ugc-pill ${campaign.status}`}>{STATUS_LABELS[campaign.status]}</span></div><p>{campaign.ugc_clients?.name || "Cliente"} · {POSTING_LABELS[campaign.posting_mode]}</p><div className="ugc-progress"><span style={{ width: `${progress}%` }} /></div></div><b>{produced}/{target || "—"}</b></div>;
}

function TaskRow({ task, campaigns }) {
  const campaign = campaigns.find((item) => item.id === task.campaign_id);
  return <div className="ugc-task-row"><span className={`ugc-priority p${task.priority}`} /><div><strong>{task.title}</strong><p>{campaign?.name || "Operação geral"}</p></div><time>{formatDate(task.due_at)}</time></div>;
}

function Campaigns({ campaigns, content }) {
  return <section className="ugc-card-grid">{campaigns.map((campaign) => {
    const campaignContent = content.filter((item) => item.campaign_id === campaign.id);
    const done = campaignContent.filter((item) => item.status === "published").length;
    return <article className="ugc-campaign-card" key={campaign.id}><div className="ugc-campaign-card-top"><span className={`ugc-pill ${campaign.status}`}>{STATUS_LABELS[campaign.status]}</span><span className={`ugc-mode ${campaign.posting_mode}`}>{POSTING_LABELS[campaign.posting_mode]}</span></div><h2>{campaign.name}</h2><p>{campaign.brief || "Sem briefing resumido."}</p><div className="ugc-platforms">{(campaign.platforms || []).map((platform) => <span key={platform}>{platformLabel(platform)}</span>)}</div><div className="ugc-campaign-kpis"><div><span>Meta</span><strong>{campaign.videos_target || "—"} vídeos</strong></div><div><span>Produzidos</span><strong>{done}</strong></div><div><span>Modelo</span><strong>{campaign.payment_model || "—"}</strong></div></div>{campaign.goals && Object.keys(campaign.goals).length > 0 && <div className="ugc-goal-box"><Target size={17} /><span>{campaign.goals.views ? `${Number(campaign.goals.views).toLocaleString("pt-BR")} views` : "Meta contratual configurada"}</span></div>}</article>;
  })}</section>;
}

function ContentBoard({ campaigns, content, setShowUpload }) {
  const stages = ["idea", "scripted", "recorded", "editing", "approved", "published"];
  return <div className="ugc-page-stack"><div className="ugc-section-actions"><button className="ugc-primary" onClick={() => setShowUpload(true)}><Upload size={18} />Enviar vídeo</button></div><section className="ugc-kanban">{stages.map((stage) => <div className="ugc-kanban-col" key={stage}><header><span>{CONTENT_STATUS[stage]}</span><b>{content.filter((item) => item.status === stage).length}</b></header>{content.filter((item) => item.status === stage).map((item) => { const campaign = campaigns.find((camp) => camp.id === item.campaign_id); return <article key={item.id}><small>{campaign?.name || "Campanha"}</small><strong>{item.title}</strong>{item.hook && <p>“{item.hook}”</p>}<footer>{item.language}<span>{item.duration_seconds ? `${item.duration_seconds}s` : "—"}</span></footer></article>; })}</div>)}</section></div>;
}

function CalendarView({ posts, tasks, campaigns }) {
  const items = [
    ...posts.filter((post) => post.scheduled_at).map((post) => ({ id: `post-${post.id}`, date: post.scheduled_at, title: `${platformLabel(post.platform)} — publicação`, type: "post", campaignId: post.campaign_id })),
    ...tasks.filter((task) => task.due_at && !["done", "cancelled"].includes(task.status)).map((task) => ({ id: `task-${task.id}`, date: task.due_at, title: task.title, type: "task", campaignId: task.campaign_id })),
  ].sort((a, b) => new Date(a.date) - new Date(b.date));
  return <section className="ugc-panel"><div className="ugc-panel-head"><div><p className="ugc-eyebrow">CRONOGRAMA</p><h2>Próximas entregas</h2></div><CalendarDays size={20} /></div>{items.length ? <div className="ugc-timeline">{items.map((item) => { const campaign = campaigns.find((c) => c.id === item.campaignId); return <div key={item.id}><time>{formatDate(item.date)}</time><span className={`ugc-timeline-dot ${item.type}`} /><div><strong>{item.title}</strong><p>{campaign?.name || "Operação geral"}</p></div></div>; })}</div> : <EmptyState text="Nenhuma entrega agendada." />}</section>;
}

function FinanceView({ campaigns, payments }) {
  const expected = payments.filter((p) => !["paid", "cancelled"].includes(p.status)).reduce((s, p) => s + Number(p.amount || 0), 0);
  const paid = payments.filter((p) => p.status === "paid").reduce((s, p) => s + Number(p.amount || 0), 0);
  const potential = campaigns.reduce((s, c) => s + Number(c.base_amount || 0), 0);
  return <div className="ugc-page-stack"><section className="ugc-stat-grid ugc-stat-grid-3"><StatCard icon={CircleDollarSign} label="Previsto em campanhas" value={money(potential)} hint="base cadastrada" /><StatCard icon={Clock3} label="A receber" value={money(expected)} hint="pagamentos em aberto" /><StatCard icon={CheckCircle2} label="Recebido" value={money(paid)} hint="pagamentos concluídos" /></section><section className="ugc-panel"><div className="ugc-panel-head"><div><p className="ugc-eyebrow">CAIXA</p><h2>Pagamentos</h2></div></div>{payments.length ? <div className="ugc-table-wrap"><table><thead><tr><th>Campanha</th><th>Descrição</th><th>Valor</th><th>Status</th><th>Vencimento</th></tr></thead><tbody>{payments.map((payment) => { const campaign = campaigns.find((item) => item.id === payment.campaign_id); return <tr key={payment.id}><td>{campaign?.name || "—"}</td><td>{payment.description || "Pagamento"}</td><td>{money(payment.amount, payment.currency)}</td><td><span className={`ugc-pill ${payment.status}`}>{payment.status}</span></td><td>{formatDate(payment.due_at)}</td></tr>; })}</tbody></table></div> : <EmptyState text="Ainda não há pagamentos registrados." />}</section></div>;
}

function NewCampaign({ userId, onClose, onSaved }) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ client: "", name: "", status: "pipeline", posting_mode: "assisted", videos_target: "", base_amount: "", currency: "USD", platforms: ["tiktok"] });
  const togglePlatform = (platform) => setForm((state) => ({ ...state, platforms: state.platforms.includes(platform) ? state.platforms.filter((item) => item !== platform) : [...state.platforms, platform] }));
  async function save(event) {
    event.preventDefault(); setSaving(true);
    const { data: client, error: clientError } = await supabase.from("ugc_clients").insert({ user_id: userId, name: form.client || form.name, currency: form.currency }).select("id").single();
    if (clientError) { setSaving(false); return; }
    const { error } = await supabase.from("ugc_campaigns").insert({ user_id: userId, client_id: client.id, name: form.name, status: form.status, posting_mode: form.posting_mode, videos_target: form.videos_target ? Number(form.videos_target) : null, base_amount: form.base_amount ? Number(form.base_amount) : null, platforms: form.platforms, payment_model: "flat" });
    setSaving(false); if (!error) onSaved();
  }
  return <Modal title="Nova campanha" onClose={onClose}><form className="ugc-form" onSubmit={save}><label>Cliente<input value={form.client} onChange={(e) => setForm({ ...form, client: e.target.value })} required /></label><label>Nome da campanha<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label><div className="ugc-form-grid"><label>Status<select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}><option value="pipeline">No radar</option><option value="preparing">Preparando</option><option value="assessment">Assessment</option><option value="active">Ativa</option></select></label><label>Publicação<select value={form.posting_mode} onChange={(e) => setForm({ ...form, posting_mode: e.target.value })}><option value="assisted">Assistida</option><option value="manual_only">Somente manual</option><option value="auto">Automática</option></select></label></div><div className="ugc-form-grid"><label>Meta de vídeos<input type="number" min="0" value={form.videos_target} onChange={(e) => setForm({ ...form, videos_target: e.target.value })} /></label><label>Valor base<input type="number" min="0" step="0.01" value={form.base_amount} onChange={(e) => setForm({ ...form, base_amount: e.target.value })} /></label></div><fieldset><legend>Plataformas</legend><div className="ugc-check-row">{["tiktok", "instagram", "youtube", "facebook"].map((platform) => <label key={platform}><input type="checkbox" checked={form.platforms.includes(platform)} onChange={() => togglePlatform(platform)} />{platformLabel(platform)}</label>)}</div></fieldset><button className="ugc-primary" disabled={saving}>{saving ? "Salvando…" : "Criar campanha"}</button></form></Modal>;
}

function UploadContent({ userId, campaigns, onClose, onSaved }) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ campaign_id: campaigns[0]?.id || "", title: "", hook: "", status: "recorded" });
  const [file, setFile] = useState(null);
  async function save(event) {
    event.preventDefault(); if (!file || !form.campaign_id) return; setSaving(true);
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
    const path = `${userId}/${form.campaign_id}/${Date.now()}-${safeName}`;
    const { error: uploadError } = await supabase.storage.from("ugc-media").upload(path, file, { contentType: file.type || "video/mp4" });
    if (uploadError) { setSaving(false); return; }
    const { error } = await supabase.from("ugc_content").insert({ user_id: userId, campaign_id: form.campaign_id, title: form.title, hook: form.hook, status: form.status, storage_path: path });
    setSaving(false); if (!error) onSaved();
  }
  return <Modal title="Enviar conteúdo" onClose={onClose}><form className="ugc-form" onSubmit={save}><label>Campanha<select value={form.campaign_id} onChange={(e) => setForm({ ...form, campaign_id: e.target.value })} required>{campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}</select></label><label>Título<input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required /></label><label>Hook<input value={form.hook} onChange={(e) => setForm({ ...form, hook: e.target.value })} placeholder="Primeiros 3 segundos…" /></label><label>Arquivo de vídeo<input type="file" accept="video/mp4,video/quicktime,video/webm" onChange={(e) => setFile(e.target.files?.[0] || null)} required /></label><button className="ugc-primary" disabled={saving}>{saving ? "Enviando…" : "Salvar conteúdo"}</button></form></Modal>;
}

function Modal({ title, children, onClose }) {
  return <div className="ugc-modal-backdrop" onMouseDown={onClose}><section className="ugc-modal" onMouseDown={(e) => e.stopPropagation()}><header><h2>{title}</h2><button onClick={onClose}>×</button></header>{children}</section></div>;
}

function EmptyState({ text }) {
  return <div className="ugc-empty"><Users size={26} /><p>{text}</p></div>;
}
