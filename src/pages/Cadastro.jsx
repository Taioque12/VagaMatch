import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase.js";
import { ThemeToggle } from "../components/ThemeToggle.jsx";

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
      <div className="lp lp-hero-bloco" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <nav className="lp-nav" style={{ justifyContent: 'space-between' }}>
          <Link to="/" className="lp-logo" style={{ textDecoration: 'none' }}>
            <span className="lp-logo-marca" />
            VagaMatch
          </Link>
          <ThemeToggle />
        </nav>
        <div className="tela-auth" style={{ textAlign: "center" }}>
          <h1 style={{ marginBottom: "1rem" }}>Confirme seu e-mail</h1>
          <p style={{ color: "#a19c8e" }}>Enviamos um link de confirmação para <strong>{email}</strong>. Clique nele para ativar sua conta.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="lp lp-hero-bloco" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <nav className="lp-nav" style={{ justifyContent: 'space-between' }}>
        <Link to="/" className="lp-logo" style={{ textDecoration: 'none' }}>
          <span className="lp-logo-marca" />
          VagaMatch
        </Link>
        <ThemeToggle />
      </nav>
      <div className="tela-auth">
        <h1 style={{ textAlign: "center", marginBottom: "1.5rem" }}>Criar conta</h1>
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
        <p style={{ textAlign: "center", marginTop: "1.5rem" }}>
          Já tem conta? <Link to="/login" style={{ color: "#4fa87e", fontWeight: "bold" }}>Entrar</Link>
        </p>
      </div>
    </div>
  );
}
