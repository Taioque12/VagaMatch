import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { PRECOS, PLANO_FEATURES, PLANO_PLUS_FEATURES } from "../lib/planos.js";

const STEPS = [
  { num: "01", title: "Assine", desc: "Escolhe o plano, ativa em dois minutos. Sem contrato, sem carência." },
  {
    num: "02",
    title: "Envie seu currículo",
    desc: "Manda o PDF ou cola o texto no Telegram. É a única informação que o sistema precisa de você.",
  },
  {
    num: "03",
    title: "O sistema cruza com as vagas",
    desc: "Região onde você mora + vagas remotas de todo o Brasil, atualizadas o dia inteiro.",
  },
  {
    num: "04",
    title: "Você recebe pronto pra aplicar",
    desc: "Currículo formatado pra vaga específica e mensagem de abordagem já escrita, direto no seu Telegram.",
  },
];

const STATS = [
  { value: "11.400+", label: "vagas monitoradas por mês" },
  { value: "60+", label: "fontes de vaga cruzadas automaticamente" },
  { value: "24/7", label: "monitoramento contínuo, sem pausa" },
  { value: "3min", label: "tempo médio entre a vaga abrir e chegar até você" },
];

const FAQS = [
  {
    q: "Preciso mandar o currículo toda vez?",
    a: "Não. Você envia uma vez, o sistema reaproveita e ajusta pra cada vaga automaticamente.",
  },
  {
    q: "Recebo vagas de outras regiões também?",
    a: "Sim. Você recebe vagas da sua região e vagas remotas de qualquer lugar do Brasil.",
  },
  {
    q: "Como funciona a mensagem de abordagem?",
    a: "Pra cada vaga, o sistema já escreve um texto curto de contato baseado no seu currículo e na vaga. É só copiar e mandar.",
  },
  { q: "Posso cancelar quando quiser?", a: "Pode. Sem multa, sem processo de retenção passivo-agressivo." },
  {
    q: "O que muda entre os planos?",
    a: "O plano Plus cruza mais fontes de vaga e entrega com mais frequência ao longo do dia.",
  },
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

function fmt(n) {
  return `R$ ${n}`;
}

export function Landing() {
  const [billing, setBilling] = useState("monthly");
  const [faqAberta, setFaqAberta] = useState(0);

  const [stepsRef, stepsRevelado] = useReveal();
  const [benefitsRef, benefitsRevelado] = useReveal();
  const [proofRef, proofRevelado] = useReveal();
  const [pricingRef, pricingRevelado] = useReveal();
  const [faqRef, faqRevelado] = useReveal();

  const preco = billing === "monthly" ? PRECOS.monthlyPrice : PRECOS.annualMonthlyEquivalent;
  const precoPlus = billing === "monthly" ? PRECOS.monthlyPricePlus : PRECOS.annualMonthlyEquivalentPlus;

  const revelar = (revelado) => ({
    opacity: revelado ? 1 : 0,
    transform: revelado ? "translateY(0)" : "translateY(14px)",
  });

  return (
    <div className="lp">
      <nav className="lp-nav">
        <div className="lp-logo">
          <span className="lp-logo-marca" />
          VagaMatch
        </div>
        <a href="#planos" className="lp-botao-escuro">
          Ativar minhas vagas
        </a>
      </nav>

      <section className="lp-hero">
        <div className="lp-hero-texto">
          <div className="lp-status">
            <span className="lp-status-ponto" />
            <span>rodando agora para quem já assinou</span>
          </div>
          <h1 className="lp-titulo">
            As vagas encontram você.
            <br />
            Não o contrário.
          </h1>
          <p className="lp-subtitulo">
            Você assina, manda o currículo, e passa a receber vagas da sua região e do Brasil todo direto no
            Telegram — já com currículo formatado e mensagem de abordagem pronta. Sem abrir site, sem
            preencher formulário.
          </p>
          <div className="lp-hero-cta">
            <a href="#planos" className="lp-botao-escuro">
              Ativar minhas vagas
            </a>
            <span className="lp-hero-nota">cancele quando quiser, sem burocracia</span>
          </div>
        </div>

        <div className="lp-hero-visual">
          <div className="lp-chat">
            <div className="lp-chat-topo">
              <div className="lp-chat-avatar">MV</div>
              <div>
                <div className="lp-chat-nome">VagaMatch bot</div>
                <div className="lp-chat-status">online</div>
              </div>
            </div>
            <div className="lp-chat-corpo">
              <div className="lp-chat-bolha-enviada">currículo recebido ✓</div>
              <div className="lp-chat-vaga">
                <div className="lp-chat-vaga-tag">NOVA VAGA · SÃO PAULO, SP</div>
                <div className="lp-chat-vaga-titulo">Analista de Dados Pleno</div>
                <div className="lp-chat-vaga-info">Vaga híbrida · publicada há 40min</div>
                <div className="lp-chat-anexo">📎 currículo_ajustado.pdf</div>
                <div className="lp-chat-abordagem">
                  "Vi a vaga de Analista de Dados e quero me candidatar — trago experiência direta com SQL e
                  dashboards que se encaixa no que vocês pedem."
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section ref={stepsRef} style={revelar(stepsRevelado)} className="lp-secao lp-transicao">
        <div className="lp-secao-cabecalho">
          <div className="lp-etiqueta">COMO FUNCIONA</div>
          <h2 className="lp-h2">Quatro passos. Depois disso, é o sistema que trabalha.</h2>
        </div>
        <div className="lp-passos">
          {STEPS.map((step) => (
            <div className="lp-passo" key={step.num}>
              <div className="lp-passo-num">{step.num}</div>
              <div>
                <div className="lp-passo-titulo">{step.title}</div>
                <div className="lp-passo-desc">{step.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section ref={benefitsRef} style={revelar(benefitsRevelado)} className="lp-secao lp-transicao">
        <div className="lp-secao-cabecalho">
          <div className="lp-etiqueta">O QUE VOCÊ RECEBE</div>
          <h2 className="lp-h2">Não é só uma lista de vagas.</h2>
        </div>
        <div className="lp-beneficios">
          <div className="lp-beneficio-grande">
            <div className="lp-beneficio-grande-titulo">
              Currículo reformatado automaticamente para cada vaga.
            </div>
            <div className="lp-beneficio-grande-texto">
              Nada de um currículo genérico pra tudo. Cada envio chega ajustado ao que a vaga pede —
              palavras-chave, ordem de experiências, ênfase certa.
            </div>
          </div>
          <div className="lp-beneficios-pequenos">
            <div className="lp-beneficio-card">
              <div className="lp-beneficio-card-titulo">Filtro por região + Brasil todo</div>
              <div className="lp-beneficio-card-texto">
                Vagas perto de você e remotas do país inteiro, sem duplicar esforço em cinco sites diferentes.
              </div>
            </div>
            <div className="lp-beneficio-card">
              <div className="lp-beneficio-card-titulo">Mensagem de abordagem pronta</div>
              <div className="lp-beneficio-card-texto">Texto de contato já escrito pra cada vaga. Copiou, colou, aplicou.</div>
            </div>
          </div>
        </div>
      </section>

      <section ref={proofRef} style={revelar(proofRevelado)} className="lp-secao lp-transicao lp-prova">
        <div className="lp-prova-conteudo">
          <div className="lp-etiqueta">O SISTEMA EM NÚMEROS</div>
          <div className="lp-stats">
            {STATS.map((stat) => (
              <div className="lp-stat" key={stat.label}>
                <div className="lp-stat-valor">{stat.value}</div>
                <div className="lp-stat-label">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="planos" ref={pricingRef} style={revelar(pricingRevelado)} className="lp-secao lp-transicao">
        <div className="lp-pricing-cabecalho">
          <div className="lp-etiqueta">PLANOS</div>
          <h2 className="lp-h2">Um valor. Sem letra miúda.</h2>
          <div className="lp-toggle">
            <button
              className={billing === "monthly" ? "lp-toggle-opcao ativo" : "lp-toggle-opcao"}
              onClick={() => setBilling("monthly")}
            >
              Mensal
            </button>
            <button
              className={billing === "annual" ? "lp-toggle-opcao ativo" : "lp-toggle-opcao"}
              onClick={() => setBilling("annual")}
            >
              Anual · 2 meses de graça
            </button>
          </div>
        </div>

        <div className="lp-planos">
          <div className="lp-plano">
            <div className="lp-plano-nome">Vaga Certa</div>
            <div className="lp-plano-subtitulo">pra quem quer testar sem compromisso</div>
            <div className="lp-plano-preco">
              <span className="lp-plano-preco-valor">{fmt(preco)}</span>
              <span className="lp-plano-preco-periodo">/mês</span>
            </div>
            <div className="lp-plano-features">
              {PLANO_FEATURES.map((f) => (
                <div className="lp-plano-feature" key={f}>
                  <span>—</span>
                  {f}
                </div>
              ))}
            </div>
            <Link to="/cadastro" className="lp-plano-botao">
              Ativar minhas vagas
            </Link>
          </div>

          <div className="lp-plano lp-plano-destaque">
            <div className="lp-plano-selo">RECOMENDADO PRA QUEM ESTÁ NA BUSCA ATIVA</div>
            <div className="lp-plano-nome">Vaga Certa Plus</div>
            <div className="lp-plano-subtitulo">mais fontes de vaga, mais rápido</div>
            <div className="lp-plano-preco">
              <span className="lp-plano-preco-valor">{fmt(precoPlus)}</span>
              <span className="lp-plano-preco-periodo">/mês</span>
            </div>
            <div className="lp-plano-features">
              {PLANO_PLUS_FEATURES.map((f) => (
                <div className="lp-plano-feature" key={f}>
                  <span>—</span>
                  {f}
                </div>
              ))}
            </div>
            <Link to="/cadastro" className="lp-plano-botao lp-plano-botao-destaque">
              Ativar minhas vagas
            </Link>
          </div>
        </div>
        <div className="lp-preco-nota">preços ilustrativos — ajuste antes de publicar</div>
      </section>

      <section ref={faqRef} style={revelar(faqRevelado)} className="lp-secao lp-transicao lp-faq-secao">
        <div className="lp-secao-cabecalho">
          <div className="lp-etiqueta">PERGUNTAS FREQUENTES</div>
          <h2 className="lp-h2-pequeno">Antes de perguntar no Telegram.</h2>
        </div>
        <div>
          {FAQS.map((faq, i) => {
            const aberta = faqAberta === i;
            return (
              <div className="lp-faq-item" key={faq.q}>
                <button className="lp-faq-pergunta" onClick={() => setFaqAberta(aberta ? -1 : i)}>
                  {faq.q}
                  <span className={aberta ? "lp-faq-mais aberto" : "lp-faq-mais"}>+</span>
                </button>
                <div className="lp-faq-resposta" style={{ maxHeight: aberta ? "200px" : "0" }}>
                  <div className="lp-faq-resposta-texto">{faq.a}</div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="lp-cta-final">
        <div>
          <h2 className="lp-cta-final-titulo">Pare de procurar. Deixe a vaga te achar.</h2>
          <a href="#planos" className="lp-cta-final-botao">
            Ativar minhas vagas
          </a>
        </div>
      </section>

      <footer className="lp-footer">
        <div className="lp-footer-marca">VagaMatch</div>
        <div className="lp-footer-nota">© 2026 VagaMatch. Sem spam, sem rodeio.</div>
      </footer>
    </div>
  );
}
