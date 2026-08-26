import { useEffect, useState } from "react";
import { ArrowLeft, KeyRound, ShieldCheck, Smartphone } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { supabase } from "../lib/supabase.js";

export function Seguranca() {
  const location = useLocation();
  const [factor, setFactor] = useState(null);
  const [enrollment, setEnrollment] = useState(null);
  const [codigo, setCodigo] = useState("");
  const [aal, setAal] = useState(null);
  const [status, setStatus] = useState("loading");
  const [erro, setErro] = useState(null);
  const [mensagem, setMensagem] = useState(null);

  async function carregar() {
    const [{ data: factors, error: factorsError }, { data: assurance, error: assuranceError }] = await Promise.all([
      supabase.auth.mfa.listFactors(),
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    ]);
    if (factorsError || assuranceError) throw factorsError ?? assuranceError;
    setFactor(factors.totp.find((item) => item.status === "verified") ?? null);
    setAal(assurance);
  }

  useEffect(() => {
    let ativo = true;
    carregar()
      .catch(() => { if (ativo) setErro("Não foi possível carregar as configurações de segurança."); })
      .finally(() => { if (ativo) setStatus("ready"); });
    return () => { ativo = false; };
  }, []);

  async function iniciarCadastro() {
    setErro(null);
    setMensagem(null);
    setStatus("submitting");
    try {
      const { data: factors, error: factorsError } = await supabase.auth.mfa.listFactors();
      if (factorsError) throw factorsError;
      const pendentes = factors.totp.filter((item) => item.status === "unverified");
      for (const pendente of pendentes) {
        const { error: cleanupError } = await supabase.auth.mfa.unenroll({ factorId: pendente.id });
        if (cleanupError) throw cleanupError;
      }
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "Microsoft Authenticator",
      });
      if (error) throw error;
      setEnrollment({ factorId: data.id, qrCode: data.totp.qr_code });
    } catch {
      setErro("Não foi possível iniciar o cadastro do autenticador.");
    } finally { setStatus("ready"); }
  }

  async function cancelarCadastro() {
    if (enrollment?.factorId) await supabase.auth.mfa.unenroll({ factorId: enrollment.factorId });
    setEnrollment(null);
    setCodigo("");
    setErro(null);
  }

  async function confirmarCadastro(event) {
    event.preventDefault();
    if (!enrollment?.factorId || !/^\d{6}$/.test(codigo)) {
      setErro("Digite o código de seis dígitos do Microsoft Authenticator.");
      return;
    }
    setStatus("submitting");
    setErro(null);
    try {
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId: enrollment.factorId });
      if (challengeError) throw challengeError;
      const { error: verifyError } = await supabase.auth.mfa.verify({ factorId: enrollment.factorId, challengeId: challenge.id, code: codigo });
      if (verifyError) throw verifyError;
      setEnrollment(null);
      setCodigo("");
      await carregar();
      setMensagem("Autenticação em duas etapas ativada com sucesso.");
    } catch {
      setErro("Código inválido ou expirado. Gere um novo código no aplicativo e tente novamente.");
      setCodigo("");
    } finally { setStatus("ready"); }
  }

  return (
    <div className="privacy-center">
      <header className="legal-header">
        <Link to="/dashboard" className="auth-brand"><span>V</span>VagaMatch</Link>
        <Link to="/onboarding" className="auth-back"><ArrowLeft size={17} /> Voltar ao perfil</Link>
      </header>
      <main className="privacy-center__content">
        <header><p className="dbv2-page-kicker">Conta e segurança</p><h1>Autenticação em duas etapas</h1><p>Proteja o acesso administrativo com um código temporário do Microsoft Authenticator.</p></header>
        {location.state?.mfaRequired && <p className="mfa-notice" role="status">Ative o autenticador para acessar a área administrativa.</p>}
        {status === "loading" ? <p role="status">Carregando configurações...</p> : (
          <section className="privacy-action mfa-security-action">
            <div><ShieldCheck size={22} /><h2>{factor ? "Proteção ativa" : "Microsoft Authenticator"}</h2><p>{factor ? `Fator ${factor.friendly_name || "TOTP"} cadastrado. ${aal?.currentLevel === "aal2" ? "Esta sessão está verificada." : "Confirme o código no próximo acesso administrativo."}` : "Escaneie um QR Code e confirme um código de seis dígitos para ativar."}</p></div>
            {!factor && !enrollment && <button className="dbv2-btn-primario" type="button" onClick={iniciarCadastro} disabled={status === "submitting"}><Smartphone size={17} /> Ativar autenticador</button>}
          </section>
        )}
        {enrollment && (
          <section className="mfa-enrollment" aria-labelledby="mfa-enrollment-title">
            <div><p className="auth-kicker">Etapa 1</p><h2 id="mfa-enrollment-title">Escaneie o QR Code</h2><p>No Microsoft Authenticator, toque em <strong>+</strong>, escolha <strong>Outra conta</strong> e escaneie este código.</p></div>
            <img src={enrollment.qrCode} alt="QR Code temporário para cadastrar o Microsoft Authenticator" />
            <form onSubmit={confirmarCadastro} aria-busy={status === "submitting"}>
              <label htmlFor="enrollment-code">Código gerado no aplicativo</label>
              <span className="auth-input"><KeyRound size={18} /><input id="enrollment-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength="6" value={codigo} onChange={(event) => setCodigo(event.target.value.replace(/\D/g, "").slice(0, 6))} required /></span>
              <div className="mfa-actions"><button className="dbv2-btn-primario" type="submit" disabled={status === "submitting"}>{status === "submitting" ? "Confirmando..." : "Confirmar ativação"}</button><button className="dbv2-btn-ghost" type="button" onClick={cancelarCadastro} disabled={status === "submitting"}>Cancelar</button></div>
            </form>
          </section>
        )}
        {erro && <p className="erro" role="alert">{erro}</p>}
        {mensagem && <p className="sucesso" role="status" aria-live="polite">{mensagem}</p>}
      </main>
    </div>
  );
}
