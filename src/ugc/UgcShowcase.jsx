import {
  AlertTriangle,
  BarChart3,
  Bot,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  Clapperboard,
  FileText,
  FileVideo2,
  LayoutDashboard,
  Link2,
  Rocket,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  Zap,
} from "lucide-react";
import "./ugc-v2.css";

const ideas = [
  ["01", "200 receitas salvas e nunca encontro", "Dor real + demonstração"],
  ["02", "Como eu só descobri isso agora?", "Curiosidade / comment bait"],
  ["03", "Você manda receita pra você mesmo?", "Identificação"],
  ["04", "Minha esposa manda e eu perco", "Storytelling cotidiano"],
  ["05", "O melhor jeito que encontrei", "Resultado primeiro"],
];

function SideItem({ icon: Icon, label, active, badge }) {
  return <div className={`ops-nav ${active ? "active" : ""}`}><Icon size={18} /><span>{label}</span>{badge ? <em>{badge}</em> : null}</div>;
}

function PreviewStat({ icon: Icon, label, value, hint }) {
  return <article className="ops-stat"><div className="ops-stat-icon"><Icon size={20} /></div><p>{label}</p><strong>{value}</strong><span>{hint}</span></article>;
}

export function UgcShowcase() {
  return <div className="ops-shell">
    <aside className="ops-sidebar">
      <div className="ops-logo"><div className="ops-brand-mark"><Sparkles size={19} /></div><div><strong>UGC Ops</strong><span>TAION LABS</span></div></div>
      <nav>
        <SideItem icon={LayoutDashboard} label="Central do dia" active />
        <SideItem icon={FileText} label="Contratos" badge="2" />
        <SideItem icon={Target} label="Campanhas" badge="2" />
        <SideItem icon={Clapperboard} label="Conteúdo" badge="5" />
        <SideItem icon={TrendingUp} label="Performance" />
        <SideItem icon={Bot} label="Copiloto" badge="3" />
        <SideItem icon={CalendarDays} label="Agenda" />
        <SideItem icon={CircleDollarSign} label="Financeiro" />
      </nav>
      <div className="ops-sidebar-footer"><div className="ops-system-status"><span /><div><strong>Preview V2</strong><small>Banco e deployment ativos</small></div></div></div>
    </aside>

    <main className="ops-main">
      <header className="ops-topbar">
        <div><p className="ops-eyebrow">OPERAÇÃO UGC</p><h1>Central do dia</h1><span className="ops-subtitle">Preview sem login — os dados reais ficam no painel autenticado.</span></div>
        <div className="ops-actions"><a className="ops-primary ops-showcase-link" href="?live=1"><Link2 size={17} />Entrar no painel real</a></div>
      </header>

      <div className="ops-stack">
        <section className="ops-hero">
          <div><span className="ops-hero-kicker"><Rocket size={16} /> UGC Command Center</span><h2>Do contrato ao vídeo publicado, sem perder regra, prazo ou dinheiro.</h2><p>O painel foi desenhado para permitir vários contratos simultâneos e separar automaticamente o que pode ser automatizado do que exige publicação manual.</p></div>
          <a className="ops-hero-button ops-showcase-link" href="?live=1">Abrir operação <Zap size={18} /></a>
        </section>

        <section className="ops-stat-grid">
          <PreviewStat icon={FileText} label="Contratos organizados" value="2" hint="Howbout + ReciBites" />
          <PreviewStat icon={Target} label="Assessments no radar" value="2" hint="prioridade definida" />
          <PreviewStat icon={FileVideo2} label="Blueprint de conteúdo" value="5" hint="ReciBites preparado" />
          <PreviewStat icon={BarChart3} label="Analytics" value="Pronto" hint="sem inventar métricas" />
        </section>

        <section className="ops-attention-grid">
          <article className="ops-attention p1"><div className="ops-attention-icon"><Zap size={20} /></div><div><span>FOCO</span><strong>Howbout primeiro</strong><p>A trial já está em andamento; o Copiloto mantém a prioridade operacional nela.</p></div></article>
          <article className="ops-attention p1"><div className="ops-attention-icon"><ShieldCheck size={20} /></div><div><span>REGRA PROTEGIDA</span><strong>ReciBites = MANUAL_ONLY</strong><p>O assessment proíbe agendadores. A automação prepara, mas não aperta “publicar”.</p></div></article>
          <article className="ops-attention p2"><div className="ops-attention-icon"><AlertTriangle size={20} /></div><div><span>CONTRATO</span><strong>Valor ainda precisa ser validado</strong><p>O financeiro não transforma US$400–700 / até US$600 em receita confirmada sem contrato.</p></div></article>
        </section>

        <section className="ops-grid-2">
          <section className="ops-panel">
            <header className="ops-panel-head"><div><p className="ops-eyebrow">PIPELINE</p><h2>Campanhas prioritárias</h2></div><Target size={20} /></header>
            <div className="ops-campaign-rows">
              <div className="ops-campaign-row"><div className="ops-campaign-row-main"><div className="ops-row-title"><strong>Howbout Ambassador — Trial Week</strong><span className="ops-pill assessment">Assessment</span></div><p>Howbout · Assistido</p><div className="ops-progress"><span style={{width:"0%"}} /></div></div><div className="ops-row-score"><strong>0/10</strong><small>aguardando posts</small></div></div>
              <div className="ops-campaign-row"><div className="ops-campaign-row-main"><div className="ops-row-title"><strong>ReciBites — Creator Assessment</strong><span className="ops-pill preparing">Preparando</span></div><p>ReciBites · Somente manual</p><div className="ops-progress"><span style={{width:"0%"}} /></div></div><div className="ops-row-score"><strong>0/5</strong><small>5 ideias prontas</small></div></div>
            </div>
          </section>

          <section className="ops-panel">
            <header className="ops-panel-head"><div><p className="ops-eyebrow">COPILOTO</p><h2>Próxima melhor ação</h2></div><Bot size={20} /></header>
            <div className="ops-action-list">
              <div className="ops-action-item p1"><div><span>AGORA</span><strong>Executar a trial Howbout</strong><p>Evitar abrir duas frentes de assessment antes de estabilizar a entrega atual.</p></div></div>
              <div className="ops-action-item p2"><div><span>DEPOIS</span><strong>Aquecer ReciBites por 2–3 dias</strong><p>Preparar os cinco vídeos antes que o relógio de cinco dias comece.</p></div></div>
              <div className="ops-action-item p3"><div><span>INFRA</span><strong>Conectar APIs sociais depois</strong><p>Até lá, posts e métricas podem ser registrados manualmente no painel.</p></div></div>
            </div>
          </section>
        </section>

        <section className="ops-panel">
          <header className="ops-panel-head"><div><p className="ops-eyebrow">RECIBITES</p><h2>Blueprint dos 5 vídeos</h2></div><Clapperboard size={20} /></header>
          <div className="ops-showcase-ideas">{ideas.map(([number,title,concept]) => <div key={number}><span>{number}</span><div><strong>{title}</strong><p>{concept}</p></div><CheckCircle2 size={17} /></div>)}</div>
        </section>

        <section className="ops-rule-grid">
          <div><ShieldCheck size={20} /><strong>RLS por usuário</strong><p>Contratos, campanhas e arquivos privados ficam isolados no Supabase.</p></div>
          <div><Zap size={20} /><strong>Vercel Preview</strong><p>A branch do UGC Ops está separada da produção do VagaMatch.</p></div>
          <div><BarChart3 size={20} /><strong>Performance real</strong><p>Views, comentários, saves, shares e retenção entram por post.</p></div>
        </section>
      </div>
    </main>
  </div>;
}
