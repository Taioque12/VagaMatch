import { Link } from "react-router-dom";
import "../dashboard-premium-v2.css";

export function Cancelado() {
  return (
    <div className="dbv2-page">
      <nav className="lp-nav" style={{ width: "100%" }}>
        <Link to="/" className="lp-logo" style={{ textDecoration: "none" }}>
          <span className="lp-logo-marca" />
          VagaMatch
        </Link>
      </nav>

      <div
        className="dbv2-card"
        style={{
          maxWidth: 560,
          width: "100%",
          marginTop: "10vh",
          textAlign: "center",
          alignItems: "center",
          padding: "44px 36px",
        }}
      >
        <div
          aria-hidden="true"
          style={{
            width: 56,
            height: 56,
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(255, 255, 255, 0.04)",
            border: "1px solid rgba(255, 255, 255, 0.12)",
            fontSize: 26,
          }}
        >
          ✋
        </div>
        <h1
          style={{
            margin: 0,
            fontFamily: "'Outfit', sans-serif",
            fontWeight: 800,
            letterSpacing: "-0.02em",
            fontSize: "clamp(26px, 5vw, 34px)",
            color: "#f8fafc",
          }}
        >
          Pagamento Cancelado
        </h1>
        <p className="dbv2-metric-sub" style={{ maxWidth: 460, margin: 0, fontSize: 15, lineHeight: 1.6 }}>
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
