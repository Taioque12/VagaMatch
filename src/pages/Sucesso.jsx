import { Link } from "react-router-dom";
import "../dashboard-premium-v2.css";

export function Sucesso() {
  const titulo = "Pagamento em processamento";
  const mensagem =
    "Recebemos sua confirmação. A ativação do plano é concluída automaticamente após a validação do pagamento.";

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
          border: "1px solid rgba(16, 185, 129, 0.35)",
          boxShadow:
            "0 20px 60px -18px rgba(16, 185, 129, 0.4), 0 8px 32px -12px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(236, 253, 245, 0.12), inset 0 0 60px -20px rgba(16, 185, 129, 0.18)",
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
            background: "rgba(16, 185, 129, 0.12)",
            border: "1px solid rgba(16, 185, 129, 0.35)",
            fontSize: 26,
          }}
        >
          ✅
        </div>
        <h1
          style={{
            margin: 0,
            fontFamily: "'Outfit', sans-serif",
            fontWeight: 800,
            letterSpacing: "-0.02em",
            fontSize: "clamp(26px, 5vw, 34px)",
            color: "#10b981",
          }}
        >
          {titulo}
        </h1>
        <p className="dbv2-metric-sub" style={{ maxWidth: 460, margin: 0, fontSize: 15, lineHeight: 1.6 }}>
          {mensagem}
        </p>

        <Link to="/dashboard" className="botao-principal" style={{ textDecoration: "none", display: "inline-block" }}>
          Ir para o Dashboard
        </Link>
      </div>
    </div>
  );
}
