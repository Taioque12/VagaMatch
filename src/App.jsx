import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Link, Routes, Route, useLocation } from "react-router-dom";
import { AuthProvider } from "./lib/AuthContext.jsx";
import { RotaProtegida } from "./components/RotaProtegida.jsx";
import { RotaAdmin } from "./components/RotaAdmin.jsx";
import { Landing } from "./pages/Landing.jsx";

// Lazy por rota: Landing fica no chunk principal (primeiro paint/SEO);
// o resto — incluindo recharts/jspdf do app logado — só carrega ao navegar.
const Login = lazy(() => import("./pages/Login.jsx").then((m) => ({ default: m.Login })));
const Cadastro = lazy(() => import("./pages/Cadastro.jsx").then((m) => ({ default: m.Cadastro })));
const Onboarding = lazy(() => import("./pages/Onboarding.jsx").then((m) => ({ default: m.Onboarding })));
const Dashboard = lazy(() => import("./pages/Dashboard.jsx").then((m) => ({ default: m.Dashboard })));
const Admin = lazy(() => import("./pages/Admin.jsx").then((m) => ({ default: m.Admin })));
const Gerador = lazy(() => import("./pages/Gerador.jsx").then((m) => ({ default: m.Gerador })));
const Sucesso = lazy(() => import("./pages/Sucesso.jsx").then((m) => ({ default: m.Sucesso })));
const Cancelado = lazy(() => import("./pages/Cancelado.jsx").then((m) => ({ default: m.Cancelado })));
const Upgrade = lazy(() => import("./pages/Upgrade.jsx").then((m) => ({ default: m.Upgrade })));

function FallbackCarregando() {
  return (
    <div role="status" aria-live="polite" style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#0a0e11", color: "#94a3b8" }}>
      Carregando…
    </div>
  );
}

function RestaurarRolagem() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [pathname]);

  return null;
}

function PaginaNaoEncontrada() {
  return (
    <main className="pagina-nao-encontrada">
      <section className="pagina-nao-encontrada__conteudo" aria-labelledby="titulo-404">
        <p className="pagina-nao-encontrada__codigo">Erro 404</p>
        <h1 id="titulo-404">Esta página não existe</h1>
        <p>O endereço pode ter mudado ou sido digitado incorretamente.</p>
        <Link className="pagina-nao-encontrada__acao" to="/">Voltar ao início</Link>
      </section>
    </main>
  );
}

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <RestaurarRolagem />
        <Suspense fallback={<FallbackCarregando />}>
          <Routes>
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/cadastro" element={<Cadastro />} />
            <Route path="/sucesso" element={<RotaProtegida><Sucesso /></RotaProtegida>} />
            <Route path="/cancelado" element={<RotaProtegida><Cancelado /></RotaProtegida>} />
            <Route path="/upgrade" element={<RotaProtegida><Upgrade /></RotaProtegida>} />
            <Route
              path="/onboarding"
              element={
                <RotaProtegida>
                  <Onboarding />
                </RotaProtegida>
              }
            />
            <Route
              path="/dashboard"
              element={
                <RotaProtegida>
                  <Dashboard />
                </RotaProtegida>
              }
            />
            <Route
              path="/admin"
              element={
                <RotaAdmin>
                  <Admin />
                </RotaAdmin>
              }
            />
            <Route
              path="/gerador/:id"
              element={
                <RotaProtegida>
                  <Gerador />
                </RotaProtegida>
              }
            />
            <Route path="*" element={<PaginaNaoEncontrada />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </AuthProvider>
  );
}
