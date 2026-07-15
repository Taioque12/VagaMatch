import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./lib/AuthContext.jsx";
import { ThemeProvider } from "./lib/ThemeContext.jsx";
import { RotaProtegida } from "./components/RotaProtegida.jsx";
import { RotaAdmin } from "./components/RotaAdmin.jsx";
import { Landing } from "./pages/Landing.jsx";
import { Login } from "./pages/Login.jsx";
import { Cadastro } from "./pages/Cadastro.jsx";
import { Onboarding } from "./pages/Onboarding.jsx";
import { Dashboard } from "./pages/Dashboard.jsx";
import { Admin } from "./pages/Admin.jsx";
import { Gerador } from "./pages/Gerador.jsx";
import { Sucesso } from "./pages/Sucesso.jsx";
import { Cancelado } from "./pages/Cancelado.jsx";
import { Upgrade } from "./pages/Upgrade.jsx";

export function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
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
        </Routes>
      </BrowserRouter>
    </AuthProvider>
    </ThemeProvider>
  );
}
