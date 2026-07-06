import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase.js";
import { ThemeToggle } from "../components/ThemeToggle.jsx";

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
    <div className="lp lp-hero-bloco" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <nav className="lp-nav" style={{ justifyContent: 'space-between', padding: '32px' }}>
        <Link to="/" className="lp-logo" style={{ textDecoration: 'none' }}>
          <span className="lp-logo-marca" />
          VagaMatch
        </Link>
        <ThemeToggle />
      </nav>
      <div className="tela-auth">
        <h1 style={{ textAlign: "center", marginBottom: "1.5rem" }}>Entrar de volta</h1>
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
        <p style={{ textAlign: "center", marginTop: "1.5rem" }}>
          Não tem conta? <Link to="/cadastro" style={{ color: "#4fa87e", fontWeight: "bold" }}>Criar conta</Link>
        </p>
      </div>
    </div>
  );
}
