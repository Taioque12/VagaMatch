import { useEffect, useState } from "react";
import { ArrowLeft, CheckCircle2, KeyRound, LogIn, Mail } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase.js";

function obterDestinoSeguro(from) {
  const fallback = "/dashboard";
  const destino = typeof from === "string"
    ? from
    : typeof from?.pathname === "string"
      ? `${from.pathname}${from.search ?? ""}${from.hash ?? ""}`
      : fallback;

  if (!destino.startsWith("/") || destino.startsWith("//") || destino.includes("\\")) {
    return fallback;
  }

  try {
    const url = new URL(destino, window.location.origin);
    if (url.origin !== window.location.origin || url.pathname === "/login") return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}

export function Login() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState(null);
  const [carregando, setCarregando] = useState(false);
  const [erroRecuperacao, setErroRecuperacao] = useState(null);
  const [mensagemRecuperacao, setMensagemRecuperacao] = useState(null);
  const [enviandoRecuperacao, setEnviandoRecuperacao] = useState(false);
  const [modoNovaSenha, setModoNovaSenha] = useState(() => window.location.hash.includes("type=recovery"));
  const [novaSenha, setNovaSenha] = useState("");
  const [confirmacaoSenha, setConfirmacaoSenha] = useState("");
  const [atualizandoSenha, setAtualizandoSenha] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setModoNovaSenha(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setErro(null);
    setCarregando(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
    setCarregando(false);
    if (error) { setErro("E-mail ou senha incorretos."); return; }
    navigate(obterDestinoSeguro(location.state?.from), { replace: true });
  }

  async function handleRecuperarSenha() {
    const emailNormalizado = email.trim();
    if (!/^\S+@\S+\.\S+$/.test(emailNormalizado)) {
      setMensagemRecuperacao(null);
      setErroRecuperacao("Digite um e-mail válido para recuperar a senha.");
      return;
    }
    setErroRecuperacao(null);
    setMensagemRecuperacao(null);
    setEnviandoRecuperacao(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(emailNormalizado, { redirectTo: `${window.location.origin}/login` });
      if (error) throw error;
      setMensagemRecuperacao("Se houver uma conta com este e-mail, enviaremos as instruções para recuperar sua senha.");
    } catch {
      setErroRecuperacao("Não foi possível enviar as instruções agora. Aguarde alguns minutos e tente novamente.");
    } finally { setEnviandoRecuperacao(false); }
  }

  async function handleAtualizarSenha(e) {
    e.preventDefault();
    setErroRecuperacao(null);
    setMensagemRecuperacao(null);
    if (novaSenha.length < 8) { setErroRecuperacao("A nova senha precisa ter pelo menos 8 caracteres."); return; }
    if (novaSenha !== confirmacaoSenha) { setErroRecuperacao("As senhas não coincidem."); return; }
    setAtualizandoSenha(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: novaSenha });
      if (error) throw error;
      const { error: erroSaida } = await supabase.auth.signOut({ scope: "local" });
      if (erroSaida) {
        setErroRecuperacao("A senha foi atualizada, mas não foi possível encerrar a sessão temporária. Feche esta aba antes de continuar.");
        return;
      }
      window.history.replaceState({}, document.title, "/login");
      setNovaSenha("");
      setConfirmacaoSenha("");
      setModoNovaSenha(false);
      setMensagemRecuperacao("Senha atualizada. Entre com sua nova senha.");
    } catch {
      setErroRecuperacao("O link expirou ou não é válido. Solicite uma nova recuperação de senha.");
    } finally { setAtualizandoSenha(false); }
  }

  return (
    <div className="auth-page">
      <header className="auth-header">
        <Link to="/" className="auth-brand"><span>V</span>VagaMatch</Link>
        <Link to="/" className="auth-back"><ArrowLeft size={17} /> Voltar ao início</Link>
      </header>
      <main className="auth-main">
        <section className="auth-intro" aria-labelledby="auth-title">
          <p className="auth-kicker">Área do candidato</p>
          <h1 id="auth-title">Sua busca continua daqui.</h1>
          <p>Acesse suas oportunidades, mantenha seu perfil atualizado e retome as próximas ações.</p>
          <ul>
            <li><CheckCircle2 size={18} /> Oportunidades organizadas</li>
            <li><CheckCircle2 size={18} /> Perfil e materiais no mesmo fluxo</li>
            <li><CheckCircle2 size={18} /> Você controla cada candidatura</li>
          </ul>
        </section>
        <section className="tela-auth" aria-labelledby="form-title">
          <div className="auth-form-heading">
            <span className="auth-form-icon">{modoNovaSenha ? <KeyRound size={20} /> : <LogIn size={20} />}</span>
            <div><p className="auth-kicker">Acesso seguro</p><h2 id="form-title">{modoNovaSenha ? "Crie uma nova senha" : "Entrar na conta"}</h2></div>
          </div>
          <p className="auth-form-description">{modoNovaSenha ? "Use pelo menos 8 caracteres." : "Use o mesmo e-mail informado no cadastro."}</p>
          {modoNovaSenha ? (
            <form onSubmit={handleAtualizarSenha} aria-busy={atualizandoSenha}>
              <label>Nova senha<input type="password" name="new-password" autoComplete="new-password" minLength="8" value={novaSenha} onChange={(e) => setNovaSenha(e.target.value)} aria-describedby={erroRecuperacao ? "recovery-error" : undefined} required /></label>
              <label>Confirmar nova senha<input type="password" name="confirm-password" autoComplete="new-password" minLength="8" value={confirmacaoSenha} onChange={(e) => setConfirmacaoSenha(e.target.value)} aria-describedby={erroRecuperacao ? "recovery-error" : undefined} required /></label>
              <button className="auth-submit" type="submit" disabled={atualizandoSenha}>{atualizandoSenha ? "Atualizando…" : "Atualizar senha"}</button>
              {erroRecuperacao && <p className="erro" id="recovery-error" role="alert">{erroRecuperacao}</p>}
            </form>
          ) : (
            <form onSubmit={handleSubmit} aria-busy={carregando || enviandoRecuperacao}>
              <label>E-mail<span className="auth-input"><Mail size={17} /><input type="email" name="email" autoComplete="email" spellCheck={false} value={email} onChange={(e) => setEmail(e.target.value)} aria-describedby={[erro && "login-error", erroRecuperacao && "email-recovery-error"].filter(Boolean).join(" ") || undefined} required /></span></label>
              <label>Senha<span className="auth-input"><KeyRound size={17} /><input type="password" name="password" autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} aria-describedby={erro ? "login-error" : undefined} required /></span></label>
              {erro && <p className="erro" id="login-error" role="alert">{erro}</p>}
              <button className="auth-submit" type="submit" disabled={carregando}>{carregando ? "Entrando…" : "Entrar"}</button>
              <button type="button" onClick={handleRecuperarSenha} disabled={enviandoRecuperacao} className="auth-link-button">{enviandoRecuperacao ? "Enviando instruções…" : "Esqueci minha senha"}</button>
              {erroRecuperacao && <p className="erro" id="email-recovery-error" role="alert">{erroRecuperacao}</p>}
            </form>
          )}
          {mensagemRecuperacao && <p className="sucesso" role="status" aria-live="polite">{mensagemRecuperacao}</p>}
          <p className="auth-switch">Não tem conta? <Link to="/cadastro">Criar conta</Link></p>
          <p className="auth-privacy-link"><Link to="/privacidade">Política de Privacidade</Link></p>
        </section>
      </main>
    </div>
  );
}
