import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./lib/AuthContext.jsx";
import { RotaProtegida } from "./components/RotaProtegida.jsx";
import { Login } from "./pages/Login.jsx";
import { Cadastro } from "./pages/Cadastro.jsx";
import { Onboarding } from "./pages/Onboarding.jsx";
import { Dashboard } from "./pages/Dashboard.jsx";

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
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
            path="/"
            element={
              <RotaProtegida>
                <Dashboard />
              </RotaProtegida>
            }
          />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
