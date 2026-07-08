import { Link } from "react-router-dom";
import { ThemeToggle } from "../components/ThemeToggle.jsx";

export function Sucesso() {
  return (
    <div className="lp lp-hero-bloco" style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <nav className="lp-nav">
        <Link to="/" className="lp-logo" style={{ textDecoration: "none" }}>
          <span className="lp-logo-marca" />
          VagaMatch
        </Link>
        <ThemeToggle />
      </nav>

      <div className="onboarding onboarding-simples" style={{ textAlign: "center", marginTop: "10vh" }}>
        <h1 style={{ color: "var(--brand-green)" }}>🎉 Pagamento Aprovado!</h1>
        <p className="ajuda" style={{ maxWidth: 520, margin: "1rem auto 2rem" }}>
          Sua assinatura Premium foi ativada com sucesso. A partir de agora, o nosso robô vai buscar vagas para você automaticamente e te notificar sempre que encontrar um match perfeito.
        </p>

        <Link to="/dashboard" className="botao-principal" style={{ textDecoration: "none", display: "inline-block" }}>
          Ir para o Dashboard
        </Link>
      </div>
    </div>
  );
}
