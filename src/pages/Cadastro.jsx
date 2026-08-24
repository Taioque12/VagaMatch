import { useState } from "react";
import { ArrowLeft, CheckCircle2, KeyRound, Mail, UserPlus } from "lucide-react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase.js";
import { persistirIndicacaoPendente, processarIndicacaoPendente } from "../lib/AuthContext.jsx";

function mensagemFalhaIndicacao(resultado) {
  const complemento = resultado.pendingRetained
    ? "A indicação permanece pendente para uma nova tentativa."
    : "O convite não ficou salvo neste navegador; entre na conta e abra novamente o link de convite.";

  if (resultado.status === "session_mismatch") {
    return `A conta foi criada, mas a sessão mudou antes de registrar a indicação. ${complemento}`;
  }
  if (resultado.status === "storage_error" || resultado.status === "discarded_invalid") {
    return `A conta foi criada, mas o navegador não conseguiu manter o registro seguro da indicação. ${complemento}`;
  }
  if (resultado.status === "failed" && resultado.reason === "session") {
    return `A conta foi criada, mas não foi possível validar a sessão para registrar a indicação. ${complemento}`;
  }
  if (resultado.status === "failed" && resultado.reason === "rpc") {
    return `A conta foi criada, mas o serviço de indicação não respondeu agora. ${complemento}`;
  }
  return `A conta foi criada, mas a indicação não pôde ser concluída agora. ${complemento}`;
}

export function Cadastro() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState(null);
  const [sucesso, setSucesso] = useState(false);
  const [confirmacaoEmail, setConfirmacaoEmail] = useState(false);
  const [avisoIndicacao, setAvisoIndicacao] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const codigoIndicacao = searchParams.get("ref");

  async function handleSubmit(e) {
    e.preventDefault();
    setErro(null);
    setAvisoIndicacao(null);
    setCarregando(true);
    let contaCriada = false;

    try {
      const { data, error } = await supabase.auth.signUp({ email, password: senha });
      if (error) {
        setErro(error.code === "weak_password"
          ? "A senha não atende aos requisitos de segurança. Use uma senha mais forte."
          : "Não foi possível criar a conta. Revise os dados ou tente novamente mais tarde.");
        return;
      }

      contaCriada = true;
      setConfirmacaoEmail(!data.session);

      if (codigoIndicacao) {
        const userId = data.user?.id;
        if (!userId) {
          setAvisoIndicacao("Sua conta foi criada, mas não foi possível identificar com segurança o destinatário da indicação. Entre na conta e abra novamente o link de convite.");
          setSucesso(true);
          return;
        }

        const persistencia = persistirIndicacaoPendente(codigoIndicacao, userId);
        const persistida = persistencia.status === "persisted";

        if (!data.session) {
          if (!persistida) {
            setAvisoIndicacao("Sua conta foi criada, mas o convite não ficou salvo neste navegador. Após confirmar o e-mail, entre na conta e abra novamente o link de convite.");
          }
          setSucesso(true);
          return;
        }

        const resultado = await processarIndicacaoPendente(
          userId,
          persistida ? undefined : persistencia.pendente,
        );
        if (resultado.status !== "processed") {
          setAvisoIndicacao(mensagemFalhaIndicacao(resultado));
          setSucesso(true);
          return;
        }
      }

      if (data.session) navigate("/onboarding");
      else setSucesso(true);
    } catch (error) {
      if (contaCriada) {
        console.error("Falha após a criação da conta.", error);
        setAvisoIndicacao("Sua conta foi criada, mas não foi possível concluir a indicação. Entre na conta e abra novamente o link de convite.");
        setSucesso(true);
      } else {
        console.error("Falha ao criar a conta.", error);
        setErro("Não foi possível criar a conta agora. Tente novamente mais tarde.");
      }
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="auth-page">
      <header className="auth-header">
        <Link to="/" className="auth-brand"><span>V</span>VagaMatch</Link>
        <Link to="/" className="auth-back"><ArrowLeft size={17} /> Voltar ao início</Link>
      </header>
      <main className="auth-main">
        <section className="auth-intro" aria-labelledby="auth-title">
          <p className="auth-kicker">Comece pelo seu perfil</p>
          <h1 id="auth-title">Transforme sua busca em próximos passos.</h1>
          <p>Crie sua conta para organizar oportunidades e preparar candidaturas com mais contexto.</p>
          <ul>
            <li><CheckCircle2 size={18} /> Cadastro rápido e objetivo</li>
            <li><CheckCircle2 size={18} /> Preferências ajustadas ao seu momento</li>
            <li><CheckCircle2 size={18} /> Controle sobre todas as ações</li>
          </ul>
        </section>
        <section className="tela-auth" aria-labelledby="form-title">
          {sucesso ? (
            <div className="auth-confirmation" role="status" aria-live="polite">
              <span className="auth-form-icon"><Mail size={21} /></span>
              <p className="auth-kicker">{confirmacaoEmail ? "Quase lá" : "Conta criada"}</p>
              <h2 id="form-title">{confirmacaoEmail ? "Confirme seu e-mail" : "Sua conta está pronta"}</h2>
              {confirmacaoEmail ? (
                <p>Enviamos um link de confirmação para <strong>{email}</strong>. Clique nele para ativar sua conta.</p>
              ) : (
                <p>Continue para completar seu perfil e configurar suas preferências.</p>
              )}
              {avisoIndicacao && <p className="erro" role="alert">{avisoIndicacao}</p>}
              <Link to={confirmacaoEmail ? "/login" : "/onboarding"} className="auth-secondary-link">
                {confirmacaoEmail ? "Voltar para o login" : "Continuar para o perfil"}
              </Link>
            </div>
          ) : (
            <>
              <div className="auth-form-heading">
                <span className="auth-form-icon"><UserPlus size={20} /></span>
                <div><p className="auth-kicker">Sua conta</p><h2 id="form-title">Criar conta</h2></div>
              </div>
              <p className="auth-form-description">Comece com seu e-mail e complete o perfil na próxima etapa.</p>
              <form onSubmit={handleSubmit} aria-busy={carregando}>
                <label>E-mail<span className="auth-input"><Mail size={17} /><input type="email" name="email" autoComplete="email" spellCheck={false} value={email} onChange={(e) => setEmail(e.target.value)} aria-describedby={erro ? "signup-error" : undefined} required /></span></label>
                <label>Senha<span className="auth-input"><KeyRound size={17} /><input type="password" name="password" autoComplete="new-password" value={senha} onChange={(e) => setSenha(e.target.value)} minLength={8} aria-describedby={erro ? "signup-error" : "signup-password-hint"} required /></span><small id="signup-password-hint">Use pelo menos 8 caracteres.</small></label>
                {erro && <p className="erro" id="signup-error" role="alert">{erro}</p>}
                <button className="auth-submit" type="submit" disabled={carregando}>{carregando ? "Criando…" : "Criar conta"}</button>
              </form>
              <p className="auth-switch">Já tem conta? <Link to="/login">Entrar</Link></p>
              <p className="auth-privacy-link">Ao criar uma conta, leia nossa <Link to="/privacidade">Política de Privacidade</Link>.</p>
            </>
          )}
        </section>
      </main>
    </div>
  );
}
