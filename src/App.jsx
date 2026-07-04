import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./lib/AuthContext.jsx";
import { RotaProtegida } from "./components/RotaProtegida.jsx";
import { RotaAdmin } from "./components/RotaAdmin.jsx";
import { Landing } from "./pages/Landing.jsx";
import { Login } from "./pages/Login.jsx";
import { Cadastro } from "./pages/Cadastro.jsx";
import { Onboarding } from "./pages/Onboarding.jsx";
import { Dashboard } from "./pages/Dashboard.jsx";
import { Admin } from "./pages/Admin.jsx";

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/cadastro" element={<Cadastro />} />
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
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
