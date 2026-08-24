import { ArrowRight, BellRing, BriefcaseBusiness, FileCheck2, MapPin, Send, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import "../landing-premium.css";

const STEPS = [
  ["01", "Conte seu objetivo", "Cadastre seu perfil, experiências e o tipo de oportunidade que procura."],
  ["02", "Receba oportunidades", "O VagaMatch organiza vagas compatíveis e destaca o que merece sua atenção."],
  ["03", "Candidate-se preparado", "Use seu perfil e os materiais gerados para avançar com mais contexto."],
];

const BENEFITS = [
  [BriefcaseBusiness, "Oportunidades organizadas", "Menos abas abertas e mais clareza sobre onde agir primeiro."],
  [FileCheck2, "Perfil que evolui", "Revise suas experiências e mantenha seus materiais prontos para cada candidatura."],
  [Send, "Acompanhamento no Telegram", "Receba atualizações pelo canal que já faz parte da sua rotina."],
];

function ProductPreview() {
  return (
    <div className="landing-preview" aria-label="Demonstração da interface de oportunidades do VagaMatch">
      <div className="landing-preview__bar">
        <div><span className="landing-preview__eyebrow">Seu painel</span><strong>Oportunidades para você</strong></div>
        <span className="landing-preview__demo">Demonstração</span>
      </div>
      <div className="landing-preview__filters" aria-hidden="true"><span>Mais recentes</span><span>Remoto e híbrido</span></div>
      <article className="landing-job">
        <div className="landing-job__mark">VM</div>
        <div className="landing-job__content">
          <div className="landing-job__heading">
            <div><span className="landing-job__source">Nova oportunidade</span><h2>Desenvolvedor(a) Front-end</h2></div>
            <span className="landing-job__match"><Sparkles size={14} /> Boa aderência</span>
          </div>
          <div className="landing-job__meta">
            <span><MapPin size={15} /> Remoto</span><span><BriefcaseBusiness size={15} /> Tecnologia</span>
          </div>
          <p>Experiência com React, interfaces responsivas e colaboração com times de produto.</p>
          <div className="landing-job__actions"><span>Ver análise da vaga</span><ArrowRight size={17} /></div>
        </div>
      </article>
      <div className="landing-preview__notice">
        <BellRing size={18} /><div><strong>Você decide o próximo passo</strong><span>Informação relevante, sem ruído.</span></div>
      </div>
    </div>
  );
}

export function Landing() {
  return (
    <div className="landing">
      <a className="landing__skip" href="#conteudo-principal">Pular para o conteúdo</a>
      <header className="landing-header">
        <Link to="/" className="landing-brand" aria-label="VagaMatch, página inicial"><span className="landing-brand__mark">V</span><span>VagaMatch</span></Link>
        <nav className="landing-header__actions" aria-label="Acesso à conta">
          <Link to="/login" className="button button--quiet">Entrar</Link>
          <Link to="/cadastro" className="button button--primary">Criar conta</Link>
        </nav>
      </header>

      <main id="conteudo-principal">
        <section className="landing-hero" aria-labelledby="landing-title">
          <div className="landing-hero__copy">
            <p className="landing-kicker">Sua busca, mais bem direcionada</p>
            <h1 id="landing-title">VagaMatch</h1>
            <p className="landing-hero__headline">Encontre oportunidades compatíveis e avance com mais clareza.</p>
            <p className="landing-hero__description">Organize seu perfil, acompanhe vagas e prepare cada candidatura em um fluxo simples, feito para quem procura trabalho de verdade.</p>
            <div className="landing-hero__actions">
              <Link to="/cadastro" className="button button--primary button--large">Começar agora <ArrowRight size={18} /></Link>
              <Link to="/login" className="button button--secondary button--large">Já tenho uma conta</Link>
            </div>
            <p className="landing-hero__note">Você mantém o controle sobre onde e quando se candidatar.</p>
          </div>
          <ProductPreview />
        </section>

        <section className="landing-steps" aria-labelledby="steps-title">
          <div className="landing-section-heading"><p className="landing-kicker">Como funciona</p><h2 id="steps-title">Da descoberta à candidatura, sem perder o contexto.</h2></div>
          <ol className="landing-steps__list">
            {STEPS.map(([number, title, description]) => <li key={number}><span>{number}</span><h3>{title}</h3><p>{description}</p></li>)}
          </ol>
        </section>

        <section className="landing-benefits" aria-labelledby="benefits-title">
          <div className="landing-benefits__intro">
            <p className="landing-kicker">Feito para a rotina real</p><h2 id="benefits-title">Menos esforço operacional. Mais atenção ao que importa.</h2>
            <p>O VagaMatch reúne as informações necessárias para você comparar oportunidades e manter seu perfil em dia.</p>
          </div>
          <div className="landing-benefits__list">
            {BENEFITS.map(([Icon, title, description]) => <article key={title}><Icon size={22} aria-hidden="true" /><div><h3>{title}</h3><p>{description}</p></div></article>)}
          </div>
        </section>

        <section className="landing-cta" aria-labelledby="cta-title">
          <div><p className="landing-kicker">Seu próximo movimento</p><h2 id="cta-title">Comece com um perfil mais completo.</h2></div>
          <Link to="/cadastro" className="button button--primary button--large">Criar minha conta <ArrowRight size={18} /></Link>
        </section>
      </main>

      <footer className="landing-footer">
        <Link to="/" className="landing-brand"><span className="landing-brand__mark">V</span><span>VagaMatch</span></Link>
        <p>Uma experiência mais clara para acompanhar sua busca profissional.</p><Link to="/privacidade">Privacidade</Link><span>© 2026 VagaMatch</span>
      </footer>
    </div>
  );
}
