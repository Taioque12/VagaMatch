import { Navigate } from "react-router-dom";
import { useAuth } from "../lib/AuthContext.jsx";

export function RotaProtegida({ children }) {
  const { session } = useAuth();

  if (session === undefined) return <p className="carregando">Carregando...</p>;
  if (session === null) return <Navigate to="/login" replace />;

  return children;
}
