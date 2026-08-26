import { useEffect, useState } from "react";
import { KeyRound, ShieldCheck } from "lucide-react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/AuthContext.jsx";
import { obterDestinoMfaSeguro } from "../lib/mfa.js";
import { supabase } from "../lib/supabase.js";

export function MfaChallenge() {
  const { session, authStatus } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [factorId, setFactorId] = useState(null);
  const [codigo, setCodigo] = useState("");
  const [status, setStatus] = useState("loading");
  const [erro, setErro] = useState(null);

  useEffect(() => {
    let ativo = true;

    async function preparar() {
      try {
        const [{ data: aal, error: aalError }, { data: factors, error: factorsError }] = await Promise.all([
          supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
          supabase.auth.mfa.listFactors(),
        ]);
        if (aalError || factorsError) throw aalError ?? factorsError;
        if (!ativo) return;
        if (aal.currentLevel === "aal2") {
          navigate(obterDestinoMfaSeguro(location.state?.from), { replace: true });
          return;
        }
        const factor = factors.totp.find((item) => item.status === "verified");
        if (!factor) {
          navigate("/seguranca", { replace: true, state: { mfaRequired: true } });
          return;
        }
        setFactorId(factor.id);
        setStatus("ready");
      } catch {
        if (ativo) {
          setErro("Não foi possível preparar a verificação em duas etapas.");
          setStatus("error");
        }
      }
    }

    if (authStatus === "authenticated") void preparar();
    return () => { ativo = false; };
  }, [authStatus, location.state?.from, navigate]);

  async function verificar(event) {
    event.preventDefault();
    if (!factorId || !/^\d{6}$/.test(codigo)) {
      setErro("Digite o código de seis dígitos do Microsoft Authenticator.");
      return;
    }
    setStatus("submitting");
    setErro(null);
    try {
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
      if (challengeError) throw challengeError;
      const { error: verifyError } = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.id,
        code: codigo,
      });
      if (verifyError) throw verifyError;
      navigate(obterDestinoMfaSeguro(location.state?.from), { replace: true });
    } catch {
      setErro("Código inválido ou expirado. Confira o aplicativo e tente novamente.");
      setStatus("ready");
      setCodigo("");
    }
  }

  if (authStatus === "loading") return <p className="carregando" role="status">Carregando...</p>;
  if (authStatus === "anonymous" || session === null) return <Navigate to="/login" replace />;

  return (
    <main className="mfa-page">
      <section className="mfa-panel" aria-labelledby="mfa-title">
        <span className="mfa-icon"><ShieldCheck size={24} /></span>
        <p className="auth-kicker">Acesso administrativo</p>
        <h1 id="mfa-title">Confirme sua identidade</h1>
        <p>Abra o Microsoft Authenticator e informe o código atual da conta VagaMatch.</p>
        {status === "loading" ? <p role="status">Preparando verificação...</p> : (
          <form onSubmit={verificar} aria-busy={status === "submitting"}>
            <label htmlFor="mfa-code">Código de seis dígitos</label>
            <span className="auth-input"><KeyRound size={18} /><input id="mfa-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength="6" value={codigo} onChange={(event) => setCodigo(event.target.value.replace(/\D/g, "").slice(0, 6))} required autoFocus /></span>
            <button className="auth-submit" type="submit" disabled={status === "submitting"}>{status === "submitting" ? "Verificando..." : "Confirmar acesso"}</button>
          </form>
        )}
        {erro && <p className="erro" role="alert">{erro}</p>}
      </section>
    </main>
  );
}
