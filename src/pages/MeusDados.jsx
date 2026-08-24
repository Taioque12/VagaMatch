import { useEffect, useState } from "react";
import { ArrowLeft, Download, ShieldCheck, Trash2, XCircle } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase.js";

function baixarJson(data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `vagamatch-meus-dados-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}
export function MeusDados() {
  const [solicitacao, setSolicitacao] = useState(null);
  const [ocupado, setOcupado] = useState(null);
  const [erro, setErro] = useState(null);
  const [mensagem, setMensagem] = useState(null);

  useEffect(() => {
    supabase.from("lgpd_requests").select("id, status, requested_at, updated_at")
      .eq("request_type", "account_deletion")
      .in("status", ["pending", "in_review"])
      .maybeSingle()
      .then(({ data }) => setSolicitacao(data ?? null));
  }, []);

  async function executar(action) {
    setOcupado(action); setErro(null); setMensagem(null);
    try {
      const { data, error } = await supabase.functions.invoke("lgpd-rights", { body: { action } });
      if (error) throw error;
      if (action === "export") {
        baixarJson(data);
        setMensagem("Arquivo preparado e baixado neste dispositivo.");
      } else {
        setSolicitacao(data?.request?.status === "cancelled" ? null : data?.request ?? null);
        setMensagem(action === "cancel_deletion" ? "Solicitação cancelada." : "Solicitação registrada para análise.");
      }
    } catch {
      setErro("Não foi possível concluir a solicitação agora.");
    } finally { setOcupado(null); }
  }

  return (
    <div className="privacy-center">
      <header className="legal-header">
        <Link to="/dashboard" className="auth-brand"><span>V</span>VagaMatch</Link>
        <Link to="/onboarding" className="auth-back"><ArrowLeft size={17} /> Voltar ao perfil</Link>
      </header>
      <main className="privacy-center__content">
        <header><p className="dbv2-page-kicker">Conta e privacidade</p><h1>Seus dados no VagaMatch</h1><p>Consulte uma cópia das informações associadas à sua conta ou registre uma solicitação de exclusão.</p></header>
        <section className="privacy-action"><div><ShieldCheck size={22} /><h2>Política de Privacidade</h2><p>Entenda quais dados são tratados, para quais finalidades e com quais fornecedores.</p></div><Link className="dbv2-btn-ghost" to="/privacidade">Ler política</Link></section>
        <section className="privacy-action"><div><Download size={22} /><h2>Exportar meus dados</h2><p>Baixe um arquivo JSON com dados da conta, perfil, currículo, preferências e histórico relacionado.</p></div><button className="dbv2-btn-primario" type="button" disabled={ocupado} onClick={() => executar("export")}>{ocupado === "export" ? "Preparando…" : "Baixar meus dados"}</button></section>
        <section className="privacy-action privacy-action--danger"><div><Trash2 size={22} /><h2>Solicitar exclusão da conta</h2><p>A solicitação será revisada antes da eliminação. Alguns registros podem precisar ser preservados nos limites legais.</p></div>{solicitacao ? <div className="privacy-request"><p>Status: <strong>{solicitacao.status === "in_review" ? "Em análise" : "Pendente"}</strong></p>{solicitacao.status === "pending" && <button className="dbv2-btn-ghost" type="button" disabled={ocupado} onClick={() => executar("cancel_deletion")}><XCircle size={16} /> Cancelar solicitação</button>}</div> : <button className="privacy-danger-button" type="button" disabled={ocupado} onClick={() => { if (window.confirm("Deseja registrar a solicitação de exclusão da sua conta?")) executar("request_deletion"); }}>{ocupado === "request_deletion" ? "Registrando…" : "Solicitar exclusão"}</button>}</section>
        {erro && <p className="erro" role="alert">{erro}</p>}
        {mensagem && <p className="sucesso" role="status" aria-live="polite">{mensagem}</p>}
      </main>
    </div>
  );
}
