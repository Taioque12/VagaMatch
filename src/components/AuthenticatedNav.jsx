import { BriefcaseBusiness, ShieldCheck, UserRound } from "lucide-react";
import { Link } from "react-router-dom";

const NAV_ITEMS = [
  { to: "/dashboard", label: "Oportunidades", Icon: BriefcaseBusiness },
  { to: "/onboarding", label: "Meu perfil", Icon: UserRound },
  { to: "/meus-dados", label: "Privacidade e dados", Icon: ShieldCheck },
];

export function AuthenticatedNav({
  activePath,
  email,
  isAdmin = false,
  onNavigate,
  accountActionLabel,
  accountActionIcon,
  onAccountAction,
}) {
  const items = isAdmin
    ? [...NAV_ITEMS, { to: "/admin", label: "Administração", Icon: ShieldCheck }]
    : NAV_ITEMS;

  function renderLink(item) {
    const { to, label, Icon } = item;
    const handleClick = onNavigate
      ? (event) => onNavigate(event, to)
      : undefined;

    return (
      <Link
        key={to}
        to={to}
        className={activePath === to ? "dbv2-nav-link ativo" : "dbv2-nav-link"}
        aria-current={activePath === to ? "page" : undefined}
        onClick={handleClick}
      >
        <Icon size={18} /> {label}
      </Link>
    );
  }

  const handleLogoClick = onNavigate
    ? (event) => onNavigate(event, "/dashboard")
    : undefined;

  return (
    <nav className="lp-nav" aria-label="Navegação principal">
      <Link
        to="/dashboard"
        className="lp-logo"
        style={{ textDecoration: "none" }}
        onClick={handleLogoClick}
      >
        <span className="lp-logo-marca">V</span>
        VagaMatch
      </Link>

      <div className="dbv2-primary-nav">
        <span className="dbv2-nav-label">Área do candidato</span>
        {items.map(renderLink)}
      </div>

      <details className="dbv2-user-menu">
        <summary aria-label="Abrir menu da conta">Menu</summary>
        <div className="dbv2-user-menu-conteudo">
          <span className="dbv2-avatar" title={email || ""}>
            {(email || "?").slice(0, 2).toUpperCase()}
          </span>
          <span className="dbv2-account-email">{email}</span>
          <div className="dbv2-mobile-nav" role="navigation" aria-label="Navegação móvel">
            {items.map(renderLink)}
          </div>
          {accountActionLabel && onAccountAction && (
            <button type="button" className="dbv2-btn-ghost" onClick={onAccountAction}>
              {accountActionIcon} {accountActionLabel}
            </button>
          )}
        </div>
      </details>
    </nav>
  );
}
