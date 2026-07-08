import { Link } from "react-router-dom";
import { ThemeToggle } from "../components/ThemeToggle.jsx";

export function Cancelado() {
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
        <h1>Pagamento Cancelado</h1>
        <p className="ajuda" style={{ maxWidth: 520, margin: "1rem auto 2rem" }}>
          O processo de checkout foi interrompido e nenhuma cobrança foi feita. 
          Se você teve algum problema técnico ou ficou com alguma dúvida, sinta-se à vontade para nos chamar.
        </p>

        <Link to="/dashboard" className="botao-secundario" style={{ textDecoration: "none", display: "inline-block" }}>
          Voltar para o Dashboard
        </Link>
      </div>
    </div>
  );
}
