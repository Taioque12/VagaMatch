import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase.js";

export function Cadastro() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState(null);
  const [sucesso, setSucesso] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const navigate = useNavigate();

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
    // Se confirmação de e-mail estiver desligada, já vem com sessão ativa
    if (data.session) {
      navigate("/onboarding");
    } else {
      setSucesso(true);
    }
  }

  if (sucesso) {
    return (
      <div className="tela-auth">
        <h1>Confirme seu e-mail</h1>
        <p>Enviamos um link de confirmação para {email}. Clique nele para ativar sua conta.</p>
      </div>
    );
  }

  return (
    <div className="tela-auth">
      <h1>Criar conta no VagaMatch</h1>
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
      <p>
        Já tem conta? <Link to="/login">Entrar</Link>
      </p>
    </div>
  );
}
