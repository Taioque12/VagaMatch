import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase.js";
import { useAuth } from "../lib/AuthContext.jsx";

const STATUS_LABEL = {
  descoberta: "Descoberta",
  notificada: "Notificada",
  candidatado: "Candidatado",
  descartada: "Descartada",
  erro: "Erro",
};

export function Dashboard() {
  const { session } = useAuth();
  const [vagas, setVagas] = useState(null);
  const [erro, setErro] = useState(null);

  useEffect(() => {
    if (!session) return;
    supabase
      .from("vagas_vistas")
      .select("*")
      .eq("user_id", session.user.id)
      .order("data_encontrada", { ascending: false })
      .limit(50)
      .then(({ data, error }) => {
        if (error) setErro(error.message);
        else setVagas(data);
      });
  }, [session]);

  async function sair() {
    await supabase.auth.signOut();
  }

  return (
    <div className="dashboard">
      <header className="topo">
        <h1>VagaMatch</h1>
        <nav>
          <Link to="/onboarding">Meu perfil</Link>
          <button onClick={sair}>Sair</button>
        </nav>
      </header>

      <h2>Suas vagas</h2>
      {erro && <p className="erro">{erro}</p>}
      {vagas === null && !erro && <p className="carregando">Carregando...</p>}
      {vagas?.length === 0 && (
        <p className="ajuda">
          Nenhuma vaga encontrada ainda. Confira se seu perfil está completo em{" "}
          <Link to="/onboarding">Meu perfil</Link>.
        </p>
      )}

      <ul className="lista-vagas">
        {vagas?.map((v) => (
          <li key={v.id} className={`vaga status-${v.status}`}>
            <div className="vaga-cabecalho">
              <strong>{v.titulo}</strong>
              <span className="score">⭐ {v.score}</span>
            </div>
            <p className="vaga-empresa">
              {v.empresa} — {v.fonte}
            </p>
            <div className="vaga-rodape">
              <span className="badge">{STATUS_LABEL[v.status] ?? v.status}</span>
              {v.feedback && <span className="badge">{v.feedback === "positivo" ? "👍" : "👎"}</span>}
              {v.url && (
                <a href={v.url} target="_blank" rel="noreferrer">
                  Ver vaga
                </a>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
