import { useState } from "react";
import {
  Activity,
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
  ListChecks,
  Rocket,
  ShieldCheck,
  Sparkles,
  Target,
  TrendingUp,
  Zap,
} from "lucide-react";
import "./ugc-v2.css";
import "./ugc-intelligence.css";

const ideas = [
  ["01", "200 receitas salvas e nunca encontro", "Dor real + demonstração", "Problema"],
  ["02", "Como eu só descobri isso agora?", "Curiosidade / comment bait", "Curiosidade"],
  ["03", "Você manda receita pra você mesmo?", "Identificação", "Identificação"],
  ["04", "Minha esposa manda e eu perco", "Storytelling cotidiano", "Storytelling"],
  ["05", "O melhor jeito que encontrei", "Resultado primeiro", "Descoberta"],
];

const NAV = [
  ["overview", "Central do dia", LayoutDashboard],
  ["contracts", "Contratos", FileText, "2"],
  ["campaigns", "Campanhas", Target, "2"],
  ["content", "Conteúdo", Clapperboard, "5"],
  ["performance", "Performance", TrendingUp],
  ["copilot", "Copiloto", Bot, "3"],
  ["calendar", "Agenda", CalendarDays],
  ["finance", "Financeiro", CircleDollarSign],
];

const TITLES = {
  overview: ["Central do dia", "O que merece atenção agora."],
  contracts: ["Contratos", "Propostas, assessments e acordos em um único lugar."],
  campaigns: ["Campanhas", "Metas, regras, progresso e risco operacional."],
  content: ["Conteúdo", "Do conceito até a publicação."],
  performance: ["Performance", "Aprendizado baseado em métricas reais."],
  copilot: ["Copiloto", "Próxima melhor ação com base na operação."],
  calendar: ["Agenda", "Prazos e entregas sem perder nenhuma janela."],
  finance: ["Financeiro", "Receita, valores pendentes e pagamentos."],
};

function SideItem({ icon: Icon, label, active, badge, onClick }) {
  return <button type="button" className={`ops-nav ${active ? "active" : ""}`} onClick={onClick}><Icon size={18} /><span>{label}</span>{badge ? <em>{badge}</em> : null}</button>;
}

function PreviewStat({ icon: Icon, label, value, hint }) {
  return <article className="ops-stat"><div className="ops-stat-icon"><Icon size={20} /></div><p>{label}</p><strong>{value}</strong><span>{hint}</span></article>;
}

function Panel({ eyebrow, title, icon: Icon, children }) {
  return <section className="ops-panel"><header className="ops-panel-head"><div><p className="ops-eyebrow">{eyebrow}</p><h2>{title}</h2></div>{Icon ? <Icon size={20} /> : null}</header>{children}</section>;
}

function Overview({ go }) {
  return <div className="ops-stack">
    <section className="ops-hero">
      <div><span className="ops-hero-kicker"><Rocket size={16} /> UGC Command Center</span><h2>Do contrato ao vídeo publicado, sem perder regra, prazo ou dinheiro.</h2><p>O painel separa o que pode ser automatizado do que exige publicação manual e mantém cada contrato no ritmo certo.</p></div>
      <button className="ops-hero-button" type="button" onClick={() => go("copilot")}>Abrir Copiloto <Zap size={18} /></button>
    </section>

    <section className="ops-stat-grid">
      <PreviewStat icon={FileText} label="Contratos organizados" value="2" hint="Howbout + ReciBites" />
      <PreviewStat icon={Target} label="Assessments no radar" value="2" hint="prioridade definida" />
      <PreviewStat icon={FileVideo2} label="Blueprint de conteúdo" value="5" hint="ReciBites preparado" />
      <PreviewStat icon={BarChart3} label="Analytics" value="Pronto" hint="aguardando métricas reais" />
    </section>

    <section className="ops-attention-grid">
      <article className="ops-attention p1"><div className="ops-attention-icon"><Zap size={20} /></div><div><span>FOCO</span><strong>Howbout primeiro</strong><p>A trial já está em andamento; o Copiloto mantém a prioridade nela.</p></div></article>
      <article className="ops-attention p1"><div className="ops-attention-icon"><ShieldCheck size={20} /></div><div><span>REGRA PROTEGIDA</span><strong>ReciBites = MANUAL_ONLY</strong><p>O assessment exige publicação manual. A automação prepara, mas não publica.</p></div></article>
      <article className="ops-attention p2"><div className="ops-attention-icon"><AlertTriangle size={20} /></div><div><span>CONTRATO</span><strong>Valor ainda precisa ser validado</strong><p>O financeiro não transforma uma faixa ambígua em receita confirmada.</p></div></article>
    </section>

    <section className="ops-grid-2">
      <Panel eyebrow="PIPELINE" title="Campanhas prioritárias" icon={Target}>
        <div className="ops-campaign-rows">
          <button className="ops-campaign-row" type="button" onClick={() => go("campaigns")}><div className="ops-campaign-row-main"><div className="ops-row-title"><strong>Howbout Ambassador — Trial Week</strong><span className="ops-pill assessment">Assessment</span></div><p>Howbout · Assistido</p><div className="ops-progress"><span style={{width:"0%"}} /></div></div><div className="ops-row-score"><strong>0/10</strong><small>ver campanha</small></div></button>
          <button className="ops-campaign-row" type="button" onClick={() => go("campaigns")}><div className="ops-campaign-row-main"><div className="ops-row-title"><strong>ReciBites — Creator Assessment</strong><span className="ops-pill preparing">Preparando</span></div><p>ReciBites · Somente manual</p><div className="ops-progress"><span style={{width:"0%"}} /></div></div><div className="ops-row-score"><strong>0/5</strong><small>ver campanha</small></div></button>
        </div>
      </Panel>
      <Panel eyebrow="COPILOTO" title="Próxima melhor ação" icon={Bot}>
        <div className="ops-action-list">
          <div className="ops-action-item p1"><div><span>AGORA</span><strong>Executar a trial Howbout</strong><p>Evitar abrir duas frentes de assessment antes de estabilizar a entrega atual.</p></div></div>
          <div className="ops-action-item p2"><div><span>DEPOIS</span><strong>Aquecer ReciBites por 2–3 dias</strong><p>Preparar os cinco vídeos antes que o relógio de cinco dias comece.</p></div></div>
          <button className="ops-card-action" type="button" onClick={() => go("copilot")}>Ver todas as recomendações</button>
        </div>
      </Panel>
    </section>
  </div>;
}

function Contracts() {
  return <div className="ops-stack"><section className="ops-stat-grid ops-stat-grid-3"><PreviewStat icon={FileText} label="No radar" value="2" hint="oportunidades cadastradas" /><PreviewStat icon={Activity} label="Em assessment" value="2" hint="janelas de avaliação" /><PreviewStat icon={CheckCircle2} label="Ativos pagos" value="0" hint="ainda sem contrato definitivo" /></section>
    <section className="ops-contract-grid">
      <article className="ops-contract-card"><header><span className="ops-pill assessment">Assessment</span><small>Convite direto</small></header><h2>Howbout Ambassador</h2><p>Trial week com 10 vídeos no TikTok e limite recomendado de até 3 por dia.</p><div className="ops-contract-facts"><div><span>Trial</span><strong>£25</strong></div><div><span>Status</span><strong>Em execução</strong></div></div></article>
      <article className="ops-contract-card"><header><span className="ops-pill assessment">Assessment</span><small>SideShift</small></header><h2>ReciBites Creator Program</h2><p>5 vídeos em 5 dias, 15 publicações e meta combinada de 10k views. Publicação manual obrigatória.</p><div className="ops-callout warning"><AlertTriangle size={17}/><span>Valor mensal ainda precisa ser confirmado antes de contabilizar receita.</span></div></article>
    </section>
    <a className="ops-primary ops-showcase-link" href="?live=1">Cadastrar novo contrato no painel real <Link2 size={17}/></a>
  </div>;
}

function Campaigns() {
  return <section className="ops-campaign-grid">
    <article className="ops-campaign-card"><header><span className="ops-pill assessment">Assessment</span><span className="ops-mode assisted">Assistido</span></header><h2>Howbout Ambassador — Trial Week</h2><p>10 vídeos no TikTok. O sistema prioriza a entrega atual antes de iniciar outra janela crítica.</p><div className="ops-platforms"><span>TikTok</span></div><div className="ops-kpi-row"><div><span>Produção</span><strong>0/10</strong></div><div><span>Health</span><strong>72</strong></div><div><span>Risco</span><strong>Médio</strong></div></div><div className="ops-progress large"><span style={{width:"0%"}}/></div></article>
    <article className="ops-campaign-card"><header><span className="ops-pill preparing">Preparando</span><span className="ops-mode manual_only">Somente manual</span></header><h2>ReciBites — Creator Assessment</h2><p>5 vídeos, 3 plataformas por vídeo, meta de 10k views combinadas. Preparar tudo antes do primeiro post.</p><div className="ops-platforms"><span>TikTok</span><span>Instagram</span><span>YouTube</span></div><div className="ops-kpi-row"><div><span>Produção</span><strong>0/5</strong></div><div><span>Meta</span><strong>10k</strong></div><div><span>Health</span><strong>88</strong></div></div><div className="ops-callout warning"><ShieldCheck size={17}/><span>MANUAL_ONLY protegido no banco.</span></div></article>
  </section>;
}

function Content() {
  return <div className="ops-stack"><Panel eyebrow="RECIBITES" title="Blueprint dos 5 vídeos" icon={Clapperboard}><div className="ops-showcase-ideas">{ideas.map(([number,title,concept,dna]) => <div key={number}><span>{number}</span><div><strong>{title}</strong><p>{concept} · DNA: {dna}</p></div><CheckCircle2 size={17}/></div>)}</div></Panel>
    <Panel eyebrow="PIPELINE" title="Fluxo operacional" icon={ListChecks}><div className="ops-rule-grid"><div><strong>1. Ideia</strong><p>Hook, ângulo, formato e hipótese.</p></div><div><strong>2. Produção</strong><p>Gravado, edição, revisão e aprovação.</p></div><div><strong>3. Publicação</strong><p>Fila automática, assistida ou manual.</p></div></div></Panel>
    <a className="ops-primary ops-showcase-link" href="?live=1">Abrir Kanban real <Link2 size={17}/></a>
  </div>;
}

function Performance() {
  return <div className="ops-stack"><section className="ops-stat-grid ops-stat-grid-3"><PreviewStat icon={BarChart3} label="Views" value="—" hint="sem dados inventados"/><PreviewStat icon={TrendingUp} label="Engajamento" value="—" hint="entra após os primeiros posts"/><PreviewStat icon={Activity} label="Retenção" value="—" hint="quando disponível por plataforma"/></section>
    <section className="ops-grid-2"><Panel eyebrow="LEARNING LOOP" title="Como o sistema aprende" icon={Bot}><div className="ops-action-list"><div className="ops-action-item p2"><div><span>1</span><strong>Publica</strong><p>Um conteúdo entra nas plataformas permitidas.</p></div></div><div className="ops-action-item p2"><div><span>2</span><strong>Mede</strong><p>Views, comentários, saves, shares e retenção.</p></div></div><div className="ops-action-item p2"><div><span>3</span><strong>Compara</strong><p>O sistema cruza resultado com Content DNA.</p></div></div><div className="ops-action-item p1"><div><span>4</span><strong>Recomenda</strong><p>Prioriza hooks e formatos acima da média.</p></div></div></div></Panel><Panel eyebrow="CONTENT DNA" title="O que será comparado" icon={Sparkles}><div className="ops-rule-grid"><div><strong>Hook</strong><p>Curiosidade, dor, identificação, história.</p></div><div><strong>Formato</strong><p>Demo, POV, talking head, screen recording.</p></div><div><strong>CTA / Ângulo</strong><p>Comentário, save, share ou descoberta.</p></div></div></Panel></section>
    <a className="ops-primary ops-showcase-link" href="?live=1">Registrar primeiras métricas <Link2 size={17}/></a>
  </div>;
}

function Copilot() {
  return <div className="ops-stack"><section className="ops-copilot-hero"><div className="ops-copilot-orb"><Sparkles size={28}/></div><div><p className="ops-eyebrow">COPILOTO OPERACIONAL</p><h2>Próxima melhor ação</h2><p>Regras, riscos e oportunidades calculados a partir do estado da operação.</p></div></section>
    <section className="ops-grid-2"><Panel eyebrow="AGORA" title="Recomendações" icon={Bot}><div className="ops-action-list"><div className="ops-action-item p1"><div><span>FOCO</span><strong>Howbout é prioridade</strong><p>Concluir a trial atual antes de iniciar o relógio da ReciBites.</p></div></div><div className="ops-action-item p1"><div><span>REGRA</span><strong>Não automatizar ReciBites</strong><p>Durante o assessment, o sistema apenas prepara o conteúdo.</p></div></div><div className="ops-action-item p2"><div><span>CONTRATO</span><strong>Validar remuneração</strong><p>Confirmar a base mensal antes de reconhecer receita.</p></div></div></div></Panel><Panel eyebrow="PLAYBOOK" title="Regras que não quebram" icon={ShieldCheck}><div className="ops-rule-grid"><div><strong>Manual continua manual</strong><p>Sem autopost em campanha protegida.</p></div><div><strong>Briefing antes do algoritmo</strong><p>Prazo e regra contratual têm precedência.</p></div><div><strong>Dados antes de opinião</strong><p>Sem inventar performance.</p></div></div></Panel></section>
  </div>;
}

function Calendar() {
  return <Panel eyebrow="CRONOGRAMA" title="Agenda operacional" icon={CalendarDays}><div className="ops-timeline"><div><time>Agora</time><span className="ops-timeline-dot task"/><div><strong>Executar trial Howbout</strong><p>Prioridade P1</p></div></div><div><time>Depois</time><span className="ops-timeline-dot task"/><div><strong>Aquecer conta ReciBites</strong><p>2–3 dias antes do primeiro post</p></div></div><div><time>Pré-assessment</time><span className="ops-timeline-dot post"/><div><strong>Deixar os 5 vídeos prontos</strong><p>Evita produzir sob pressão do relógio</p></div></div></div></Panel>;
}

function Finance() {
  return <div className="ops-stack"><section className="ops-stat-grid ops-stat-grid-3"><PreviewStat icon={CircleDollarSign} label="Receita confirmada" value="£25" hint="trial Howbout, condicionada à conclusão"/><PreviewStat icon={AlertTriangle} label="ReciBites" value="A validar" hint="não contabilizado como receita"/><PreviewStat icon={CheckCircle2} label="Recebido" value="—" hint="nenhum pagamento lançado"/></section><Panel eyebrow="CONTROLE" title="Regra financeira" icon={ShieldCheck}><div className="ops-callout warning"><AlertTriangle size={17}/><span>O sistema não transforma faixas de proposta em receita contratada até existir valor confirmado.</span></div></Panel><a className="ops-primary ops-showcase-link" href="?live=1">Abrir financeiro real <Link2 size={17}/></a></div>;
}

export function UgcShowcase() {
  const [tab, setTab] = useState("overview");
  const [title, subtitle] = TITLES[tab];
  return <div className="ops-shell">
    <aside className="ops-sidebar">
      <div className="ops-logo"><div className="ops-brand-mark"><Sparkles size={19}/></div><div><strong>UGC Ops</strong><span>TAION LABS</span></div></div>
      <nav>{NAV.map(([key,label,Icon,badge]) => <SideItem key={key} icon={Icon} label={label} badge={badge} active={tab===key} onClick={() => setTab(key)}/>)}</nav>
      <div className="ops-sidebar-footer"><div className="ops-system-status"><span/><div><strong>Preview interativo</strong><small>Navegação habilitada · dados demonstrativos</small></div></div></div>
    </aside>

    <main className="ops-main">
      <header className="ops-topbar"><div><p className="ops-eyebrow">OPERAÇÃO UGC</p><h1>{title}</h1><span className="ops-subtitle">{subtitle} Preview sem login.</span></div><div className="ops-actions"><a className="ops-primary ops-showcase-link" href="?live=1"><Link2 size={17}/>Entrar no painel real</a></div></header>
      {tab === "overview" && <Overview go={setTab}/>} 
      {tab === "contracts" && <Contracts/>}
      {tab === "campaigns" && <Campaigns/>}
      {tab === "content" && <Content/>}
      {tab === "performance" && <Performance/>}
      {tab === "copilot" && <Copilot/>}
      {tab === "calendar" && <Calendar/>}
      {tab === "finance" && <Finance/>}
    </main>
  </div>;
}
