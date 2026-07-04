import { Link } from "react-router-dom";

export function Landing() {
  return (
    <div className="landing">
      <header className="landing-hero">
        <h1>Vaga certa, direto no seu Telegram.</h1>
        <p>
          Sem precisar ficar entrando em site. Você cadastra seu currículo uma vez, a gente monitora as vagas
          e manda o currículo já ajustado pra cada oportunidade — direto no seu Telegram.
        </p>
        <div className="landing-cta">
          <Link to="/cadastro" className="botao-primario">Criar conta grátis</Link>
          <Link to="/login" className="botao-secundario">Já tenho conta</Link>
        </div>
      </header>

      <section className="landing-como-funciona">
        <h2>Como funciona</h2>
        <ol>
          <li>Cadastre seu currículo e diga que tipo de vaga procura</li>
          <li>Vincule seu Telegram (leva 1 minuto)</li>
          <li>Pronto. A gente avisa quando aparecer vaga que combina com você</li>
        </ol>
      </section>

      <section className="landing-beneficios">
        <h2>Por que usar</h2>
        <ul>
          <li>Currículo ajustado automaticamente pra cada vaga, sem inventar experiência</li>
          <li>Nunca candidata sozinho — você decide, a gente só avisa</li>
          <li>Escolha buscar na sua região ou no Brasil todo</li>
          <li>100% pelo Telegram, sem precisar ficar checando site</li>
        </ul>
      </section>

      <footer className="landing-footer">
        <Link to="/cadastro">Começar agora</Link>
      </footer>
    </div>
  );
}
