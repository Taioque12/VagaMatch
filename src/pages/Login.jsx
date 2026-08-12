import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase.js";

const authPageStyle = {
  minHeight: '100vh',
  display: 'flex',
  flexDirection: 'column',
};

const authKickerStyle = {
  textAlign: 'center',
  fontSize: '13px',
  fontWeight: 700,
  textTransform: 'uppercase',
  letterSpacing: '0.09em',
  color: '#94a3b8',
  margin: '0 0 0.75rem',
};

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
    if (error) {
      setErro(error.message);
      return;
    }
    navigate("/dashboard");
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
      const { error } = await supabase.auth.resetPasswordForEmail(emailNormalizado, {
        redirectTo: `${window.location.origin}/login`,
      });
      if (error) throw error;
      setMensagemRecuperacao("Se houver uma conta com este e-mail, enviaremos as instruções para recuperar sua senha.");
    } catch {
      setErroRecuperacao("Não foi possível enviar as instruções agora. Aguarde alguns minutos e tente novamente.");
    } finally {
      setEnviandoRecuperacao(false);
    }
  }

  async function handleAtualizarSenha(e) {
    e.preventDefault();
    setErroRecuperacao(null);
    setMensagemRecuperacao(null);

    if (novaSenha.length < 8) {
      setErroRecuperacao("A nova senha precisa ter pelo menos 8 caracteres.");
      return;
    }
    if (novaSenha !== confirmacaoSenha) {
      setErroRecuperacao("As senhas não coincidem.");
      return;
    }

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
    } finally {
      setAtualizandoSenha(false);
    }
  }

  return (
    <div className="lp lp-hero-bloco pv2-fundo" style={authPageStyle}>
      <nav className="lp-nav" style={{ justifyContent: 'space-between' }}>
        <Link to="/" className="lp-logo" style={{ textDecoration: 'none' }}>
          <span className="lp-logo-marca" />
          VagaMatch
        </Link>
      </nav>
      <main className="tela-auth" style={{ position: 'relative', zIndex: 1 }}>
        <p style={authKickerStyle}>Área do candidato</p>
        <h1 style={{ textAlign: "center", marginBottom: "0.5rem", fontSize: "28px" }}>
          {modoNovaSenha ? "Crie uma nova senha" : "Entrar de volta"}
        </h1>
        <p style={{ textAlign: "center", color: "#94a3b8", fontSize: "15px", margin: "0 0 1.75rem" }}>
          {modoNovaSenha ? "Use pelo menos 8 caracteres." : "Acesse seu painel de vagas compatíveis."}
        </p>
        {modoNovaSenha ? (
          <form onSubmit={handleAtualizarSenha}>
            <label>
              Nova senha
              <input type="password" name="new-password" autoComplete="new-password" minLength="8" value={novaSenha} onChange={(e) => setNovaSenha(e.target.value)} required />
            </label>
            <label>
              Confirmar nova senha
              <input type="password" name="confirm-password" autoComplete="new-password" minLength="8" value={confirmacaoSenha} onChange={(e) => setConfirmacaoSenha(e.target.value)} required />
            </label>
            <button type="submit" disabled={atualizandoSenha}>
              {atualizandoSenha ? "Atualizando…" : "Atualizar senha"}
            </button>
            {erroRecuperacao && <p className="erro" role="alert">{erroRecuperacao}</p>}
          </form>
        ) : (
          <form onSubmit={handleSubmit}>
            <label>
              E-mail
              <input type="email" name="email" autoComplete="email" spellCheck={false} value={email} onChange={(e) => setEmail(e.target.value)} required />
            </label>
            <label>
              Senha
              <input type="password" name="password" autoComplete="current-password" value={senha} onChange={(e) => setSenha(e.target.value)} required />
            </label>
            {erro && <p className="erro" role="alert">{erro}</p>}
            <button type="submit" disabled={carregando}>
              {carregando ? "Entrando…" : "Entrar"}
            </button>
            <button
              type="button"
              onClick={handleRecuperarSenha}
              disabled={enviandoRecuperacao}
              style={{ background: "transparent", color: "#34d399", boxShadow: "none", padding: "0.5rem", margin: "0.25rem auto 0" }}
            >
              {enviandoRecuperacao ? "Enviando instruções…" : "Esqueci minha senha"}
            </button>
            {erroRecuperacao && <p className="erro" role="alert">{erroRecuperacao}</p>}
          </form>
        )}
        {mensagemRecuperacao && <p className="sucesso" role="status" aria-live="polite">{mensagemRecuperacao}</p>}
        <p style={{ textAlign: "center", marginTop: "1.5rem", color: "#94a3b8", fontSize: "15px" }}>
          Não tem conta? <Link to="/cadastro" style={{ color: "#34d399", fontWeight: "bold" }}>Criar conta</Link>
        </p>
      </main>
    </div>
  );
}
