import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ThemeToggle } from "../components/ThemeToggle.jsx";
import { PRECOS, PLANO_FEATURES, PLANO_PLUS_FEATURES } from "../lib/planos.js";
import "../landing-premium.css";

const BENEFITS = [
  {
    icon: "✨",
    title: "Currículo Reformatado",
    desc: "Cada envio chega ajustado ao que a vaga pede — palavras-chave, ordem de experiências, ênfase certa.",
    size: "large"
  },
  {
    icon: "🌍",
    title: "Região + Remoto",
    desc: "Vagas perto de você e remotas do país inteiro, sem duplicar esforço.",
  },
  {
    icon: "✉️",
    title: "Abordagem Pronta",
    desc: "Texto de contato já escrito pra cada vaga. Copiou, colou, aplicou.",
  },
  {
    icon: "🚀",
    title: "Tudo no Telegram",
    desc: "Sem dashboard pra abrir, sem senha pra lembrar. A vaga chega onde você já está.",
    size: "large"
  }
];

function useReveal() {
  const ref = useRef(null);
  const [revelado, setRevelado] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setRevelado(true);
      },
      { threshold: 0.15 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return [ref, revelado];
}

function CheckIcon() {
  return (
    <svg className="lp-feature-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12"></polyline>
    </svg>
  );
}

export function Landing() {
  const [billing, setBilling] = useState("monthly");

  const [bentoRef, bentoRevelado] = useReveal();
  const [pricingRef, pricingRevelado] = useReveal();

  const preco = billing === "monthly" ? PRECOS.monthlyPrice : PRECOS.annualMonthlyEquivalent;
  const precoPlus = billing === "monthly" ? PRECOS.monthlyPricePlus : PRECOS.annualMonthlyEquivalentPlus;

  const animClass = (rev) => `animate-on-scroll ${rev ? "visible" : ""}`;

  return (
    <div className="lp-premium-wrap">
      {/* Ambient Lights */}
      <div className="lp-glow-1"></div>
      <div className="lp-glow-2"></div>
      <div className="lp-glow-3"></div>

      {/* Nav */}
      <nav className="lp-nav-p">
        <Link to="/" className="lp-logo-p">
          <div className="lp-logo-dot"></div>
          VagaMatch
        </Link>
        <div style={{ display: "flex", gap: "1.5rem", alignItems: "center" }}>
          <Link to="/login" className="lp-btn-ghost">Entrar</Link>
          <a href="#planos" className="lp-btn-primary">Começar Agora</a>
        </div>
      </nav>

      {/* Hero */}
      <section className="lp-hero-p">
        <div className="lp-hero-content">
          <div className="lp-badge-p">
            <span className="lp-pulse-dot"></span>
            Monitoramento 24/7 Ativo
          </div>
          <h1 className="lp-h1-p">
            Pare de procurar.<br />
            <span className="lp-text-gradient">Deixe a vaga te achar.</span>
          </h1>
          <p className="lp-hero-sub-p">
            Você envia o currículo uma vez. Nós cruzamos com centenas de fontes e enviamos vagas perfeitas direto no seu Telegram, já com currículo ajustado para cada empresa.
          </p>
          <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
            <a href="#planos" className="lp-btn-primary" style={{ padding: "1rem 2rem", fontSize: "1.1rem" }}>
              Ativar Minhas Vagas
            </a>
          </div>
        </div>

        <div className="lp-hero-visual-p">
          <div className="lp-mockup-glass">
            <div className="lp-chat-header-p">
              <div className="lp-chat-avatar-p">VM</div>
              <div>
                <div style={{ fontWeight: 700, color: "#fff" }}>VagaMatch Bot</div>
                <div style={{ fontSize: "0.8rem", color: "var(--neon-green)" }}>Online</div>
              </div>
            </div>
            
            <div className="lp-chat-bubble-user">
              Currículo PDF enviado ✓
            </div>
            
            <div className="lp-chat-bubble-bot">
              <div className="lp-chat-vaga-tag-p">Match 95% • São Paulo, SP</div>
              <div className="lp-chat-vaga-title-p">Desenvolvedor Front-end Pleno</div>
              <div style={{ fontSize: "0.85rem", color: "var(--text-body)" }}>Empresa: TechStart • Há 10 min</div>
              
              <div className="lp-chat-attachment-p">
                <span style={{ fontSize: "1.2rem" }}>📄</span>
                <div>
                  <div style={{ color: "#fff", fontWeight: 500 }}>curriculo_TechStart.pdf</div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-body)" }}>Ajustado para React e UI/UX</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Bento Grid Features */}
      <section className="lp-section-p" ref={bentoRef}>
        <div className={`lp-section-title-p ${animClass(bentoRevelado)}`}>
          <div className="lp-section-tag-p">Como Funciona</div>
          <h2 className="lp-h2-p">Um robô trabalhando <span className="lp-text-gradient-green">por você</span></h2>
        </div>
        
        <div className={`lp-bento-grid ${animClass(bentoRevelado)}`} style={{ transitionDelay: "0.2s" }}>
          {BENEFITS.map((b, i) => (
            <div key={i} className={`lp-bento-card ${b.size === "large" ? "lp-bento-large" : ""}`}>
              <div className="lp-bento-icon">{b.icon}</div>
              <h3 className="lp-bento-title">{b.title}</h3>
              <p className="lp-bento-desc">{b.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="planos" className="lp-section-p" ref={pricingRef}>
        <div className={`lp-section-title-p ${animClass(pricingRevelado)}`}>
          <div className="lp-section-tag-p">Investimento</div>
          <h2 className="lp-h2-p">Sua carreira no <span className="lp-text-gradient-green">automático</span></h2>
        </div>

        <div className={`lp-pricing-grid ${animClass(pricingRevelado)}`} style={{ transitionDelay: "0.2s" }}>
          {/* Basic Plan */}
          <div className="lp-pricing-card">
            <h3 style={{ fontSize: "1.5rem", color: "#fff", marginBottom: "0.5rem" }}>Match</h3>
            <p style={{ color: "var(--text-body)", marginBottom: "2rem" }}>Para quem quer testar sem compromisso</p>
            <div className="lp-price-val">
              <span>R$</span>{preco}<span>/mês</span>
            </div>
            
            <div className="lp-feature-list">
              {PLANO_FEATURES.map((f, i) => (
                <div key={i} className="lp-feature-item">
                  <CheckIcon /> {f}
                </div>
              ))}
            </div>
            <Link to="/cadastro" className="lp-btn-ghost" style={{ display: "block", textAlign: "center", marginTop: "2.5rem", padding: "1rem", border: "1px solid var(--glass-border)", borderRadius: "999px" }}>
              Assinar Match
            </Link>
          </div>

          {/* Premium Plan */}
          <div className="lp-pricing-card premium">
            <div style={{ position: "absolute", top: 0, left: "50%", transform: "translate(-50%, -50%)", background: "var(--neon-green)", color: "#000", fontWeight: 800, padding: "6px 20px", borderRadius: "999px", fontSize: "0.85rem", letterSpacing: "0.05em" }}>RECOMENDADO</div>
            <h3 style={{ fontSize: "1.8rem", color: "#fff", marginBottom: "0.5rem" }}>Match Plus</h3>
            <p style={{ color: "var(--text-body)", marginBottom: "2rem" }}>Mais fontes de vagas, velocidade máxima</p>
            <div className="lp-price-val" style={{ color: "var(--neon-green)" }}>
              <span style={{ color: "var(--text-body)" }}>R$</span>{precoPlus}<span style={{ color: "var(--text-body)" }}>/mês</span>
            </div>
            
            <div className="lp-feature-list">
              {PLANO_PLUS_FEATURES.map((f, i) => (
                <div key={i} className="lp-feature-item" style={{ color: "#fff" }}>
                  <CheckIcon /> {f}
                </div>
              ))}
            </div>
            <Link to="/cadastro" className="lp-btn-primary" style={{ display: "block", textAlign: "center", marginTop: "2.5rem", padding: "1rem" }}>
              Ativar Match Plus 🚀
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ borderTop: "1px solid var(--glass-border)", padding: "3rem 2rem", textAlign: "center", color: "var(--text-body)", position: "relative", zIndex: 10 }}>
        <div style={{ fontFamily: "'Outfit', sans-serif", fontSize: "1.5rem", fontWeight: 800, color: "#fff", marginBottom: "1rem" }}>
          VagaMatch
        </div>
        <p>© 2026 VagaMatch. Desenvolvido para acelerar sua carreira.</p>
      </footer>
    </div>
  );
}
