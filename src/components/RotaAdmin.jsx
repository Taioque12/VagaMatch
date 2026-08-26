import { useEffect, useState } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../lib/AuthContext.jsx";
import { supabase } from "../lib/supabase.js";

export function RotaAdmin({ children }) {
  const { session, authStatus } = useAuth();
  const location = useLocation();
  const userId = session?.user?.id ?? null;
  const [verificacao, setVerificacao] = useState({
    userId: null,
    status: "idle",
  });
  const [tentativa, setTentativa] = useState(0);

  useEffect(() => {
    let ativo = true;

    if (authStatus !== "authenticated" || !userId) {
      setVerificacao({ userId: null, status: "idle" });
      return () => {
        ativo = false;
      };
    }

    setVerificacao({ userId, status: "loading" });

    async function verificarAcesso() {
      try {
        const { data: aal, error: aalError } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (aalError) throw aalError;
        if (!ativo) return;
        if (aal.currentLevel !== "aal2") {
          setVerificacao({
            userId,
            status: aal.nextLevel === "aal2" ? "mfa_required" : "mfa_enrollment_required",
          });
          return;
        }
        const { data, error } = await supabase.rpc("is_admin");
        if (error) throw error;
        if (!ativo) return;

        setVerificacao({
          userId,
          status: data === true ? "authorized" : "denied",
        });
      } catch {
        if (ativo) {
          setVerificacao({ userId, status: "error" });
        }
      }
    }

    void verificarAcesso();

    return () => {
      ativo = false;
    };
  }, [authStatus, userId, tentativa]);

  if (authStatus === "loading") return <p className="carregando" role="status">Carregando...</p>;
  if (authStatus === "error") {
    return <p className="erro" role="alert">Não foi possível verificar sua sessão. Recarregue a página e tente novamente.</p>;
  }
  if (authStatus === "anonymous" || session === null) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  const verificacaoAtual = verificacao.userId === userId ? verificacao.status : "loading";
  if (verificacaoAtual === "idle" || verificacaoAtual === "loading") {
    return <p className="carregando" role="status">Verificando acesso...</p>;
  }
  if (verificacaoAtual === "error") {
    return (
      <main>
        <p className="erro" role="alert">Não foi possível verificar sua permissão administrativa.</p>
        <button type="button" onClick={() => setTentativa((valor) => valor + 1)}>
          Tentar novamente
        </button>
      </main>
    );
  }
  if (verificacaoAtual === "mfa_required") {
    return <Navigate to="/mfa" replace state={{ from: location }} />;
  }
  if (verificacaoAtual === "mfa_enrollment_required") {
    return <Navigate to="/seguranca" replace state={{ mfaRequired: true }} />;
  }
  if (verificacaoAtual === "denied") {
    return (
      <main>
        <p className="erro" role="alert">Acesso negado. Esta área é exclusiva para administradores.</p>
        <Link to="/dashboard">Voltar ao dashboard</Link>
      </main>
    );
  }

  return children;
}
