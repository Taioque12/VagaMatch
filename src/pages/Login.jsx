import { useState } from "react";
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
  const navigate = useNavigate();

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

  return (
    <div className="lp lp-hero-bloco pv2-fundo" style={authPageStyle}>
      <nav className="lp-nav" style={{ justifyContent: 'space-between' }}>
        <Link to="/" className="lp-logo" style={{ textDecoration: 'none' }}>
          <span className="lp-logo-marca" />
          VagaMatch
        </Link>
      </nav>
      <div className="tela-auth" style={{ position: 'relative', zIndex: 1 }}>
        <p style={authKickerStyle}>Área do candidato</p>
        <h1 style={{ textAlign: "center", marginBottom: "0.5rem", fontSize: "28px" }}>Entrar de volta</h1>
        <p style={{ textAlign: "center", color: "#94a3b8", fontSize: "15px", margin: "0 0 1.75rem" }}>
          Acesse seu painel de vagas compatíveis.
        </p>
        <form onSubmit={handleSubmit}>
          <label>
            E-mail
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label>
            Senha
            <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} required />
          </label>
          {erro && <p className="erro">{erro}</p>}
          <button type="submit" disabled={carregando}>
            {carregando ? "Entrando..." : "Entrar"}
          </button>
        </form>
        <p style={{ textAlign: "center", marginTop: "1.5rem", color: "#94a3b8", fontSize: "15px" }}>
          Não tem conta? <Link to="/cadastro" style={{ color: "#34d399", fontWeight: "bold" }}>Criar conta</Link>
        </p>
      </div>
    </div>
  );
}
