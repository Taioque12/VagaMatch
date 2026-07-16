import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
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

export function Cadastro() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState(null);
  const [sucesso, setSucesso] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const codigoIndicacao = searchParams.get("ref");

  async function handleSubmit(e) {
    e.preventDefault();
    setErro(null);
    setCarregando(true);
    const { data, error } = await supabase.auth.signUp({ email, password: senha });
    setCarregando(false);
    if (error) {
      setErro(error.message);
      return;
    }
    if (codigoIndicacao) {
      if (data.session) {
        await supabase.rpc("registrar_indicacao", { p_codigo: codigoIndicacao });
      } else {
        // Confirmação de e-mail ativa: guarda pra registrar no primeiro login.
        localStorage.setItem("vagamatch_ref_pendente", codigoIndicacao);
      }
    }
    // Se confirmação de e-mail estiver desligada, já vem com sessão ativa
    if (data.session) {
      navigate("/onboarding");
    } else {
      setSucesso(true);
    }
  }

  if (sucesso) {
    return (
      <div className="lp lp-hero-bloco pv2-fundo" style={authPageStyle}>
        <nav className="lp-nav" style={{ justifyContent: 'space-between' }}>
          <Link to="/" className="lp-logo" style={{ textDecoration: 'none' }}>
            <span className="lp-logo-marca" />
            VagaMatch
          </Link>
        </nav>
        <div className="tela-auth" style={{ textAlign: "center", position: 'relative', zIndex: 1 }}>
          <p style={authKickerStyle}>Quase lá</p>
          <h1 style={{ marginBottom: "1rem", fontSize: "28px" }}>Confirme seu e-mail</h1>
          <p style={{ color: "#94a3b8", fontSize: "15px" }}>Enviamos um link de confirmação para <strong style={{ color: "#f8fafc" }}>{email}</strong>. Clique nele para ativar sua conta.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="lp lp-hero-bloco pv2-fundo" style={authPageStyle}>
      <nav className="lp-nav" style={{ justifyContent: 'space-between' }}>
        <Link to="/" className="lp-logo" style={{ textDecoration: 'none' }}>
          <span className="lp-logo-marca" />
          VagaMatch
        </Link>
      </nav>
      <div className="tela-auth" style={{ position: 'relative', zIndex: 1 }}>
        <p style={authKickerStyle}>Comece grátis</p>
        <h1 style={{ textAlign: "center", marginBottom: "0.5rem", fontSize: "28px" }}>Criar conta</h1>
        <p style={{ textAlign: "center", color: "#94a3b8", fontSize: "15px", margin: "0 0 1.75rem" }}>
          Vagas compatíveis com o seu perfil, todos os dias.
        </p>
        <form onSubmit={handleSubmit}>
          <label>
            E-mail
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label>
            Senha
            <input
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              minLength={6}
              required
            />
          </label>
          {erro && <p className="erro">{erro}</p>}
          <button type="submit" disabled={carregando}>
            {carregando ? "Criando..." : "Criar conta"}
          </button>
        </form>
        <p style={{ textAlign: "center", marginTop: "1.5rem", color: "#94a3b8", fontSize: "15px" }}>
          Já tem conta? <Link to="/login" style={{ color: "#34d399", fontWeight: "bold" }}>Entrar</Link>
        </p>
      </div>
    </div>
  );
}
