import { Link, useSearchParams } from "react-router-dom";
import { ThemeToggle } from "../components/ThemeToggle.jsx";

export function Sucesso() {
  const [params] = useSearchParams();

  // Mercado Pago retorna status/collection_status no back_url
  const status = params.get("status") || params.get("collection_status");
  const aprovado = status === "approved";

  const titulo = aprovado ? "🎉 Pagamento Aprovado!" : "✅ Pagamento em processamento";
  const mensagem = aprovado
    ? "Sua assinatura foi ativada com sucesso. A partir de agora, o nosso robô vai buscar vagas para você automaticamente e te notificar sempre que encontrar um match perfeito."
    : "Recebemos a confirmação do Mercado Pago. Seu pagamento está em processamento e seu plano ativa em instantes — você já pode voltar ao dashboard, tudo acontece automaticamente.";

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
        <h1 style={{ color: "var(--brand-green)" }}>{titulo}</h1>
        <p className="ajuda" style={{ maxWidth: 520, margin: "1rem auto 2rem" }}>
          {mensagem}
        </p>

        <Link to="/dashboard" className="botao-principal" style={{ textDecoration: "none", display: "inline-block" }}>
          Ir para o Dashboard
        </Link>
      </div>
    </div>
  );
}
