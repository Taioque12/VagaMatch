import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../lib/AuthContext.jsx";

export function RotaProtegida({ children }) {
  const { session, authStatus } = useAuth();
  const location = useLocation();

  if (authStatus === "loading") return <p className="carregando" role="status">Carregando...</p>;
  if (authStatus === "error") {
    return <p className="erro" role="alert">Não foi possível verificar sua sessão. Recarregue a página e tente novamente.</p>;
  }
  if (authStatus === "anonymous" || session === null) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return children;
}
