import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../lib/AuthContext.jsx";
import { supabase } from "../lib/supabase.js";

export function RotaAdmin({ children }) {
  const { session } = useAuth();
  const [ehAdmin, setEhAdmin] = useState(undefined); // undefined = carregando

  useEffect(() => {
    if (!session) return;
    supabase
      .from("profiles")
      .select("role")
      .eq("id", session.user.id)
      .maybeSingle()
      .then(({ data }) => setEhAdmin(data?.role === "admin"));
  }, [session]);

  if (session === undefined) return <p className="carregando">Carregando...</p>;
  if (session === null) return <Navigate to="/login" replace />;
  if (ehAdmin === undefined) return <p className="carregando">Verificando acesso...</p>;
  if (!ehAdmin) return <Navigate to="/dashboard" replace />;

  return children;
}
