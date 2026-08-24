import { ArrowLeft, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";

const UPDATED_AT = "21 de agosto de 2026";

export function Privacidade() {
  return (
    <div className="legal-page">
      <header className="legal-header">
        <Link to="/" className="auth-brand"><span>V</span>VagaMatch</Link>
        <Link to="/" className="auth-back"><ArrowLeft size={17} /> Voltar ao início</Link>
      </header>
      <main className="legal-content">
        <div className="legal-title"><ShieldCheck size={24} /><div><p>Privacidade</p><h1>Política de Privacidade</h1></div></div>
        <p className="legal-updated">Versão 1.0 · Atualizada em {UPDATED_AT}</p>
        <p>Esta política explica como o VagaMatch trata dados pessoais durante a organização de oportunidades, preparação de candidaturas e comunicação com candidatos.</p>

        <section><h2>Responsável pelo tratamento</h2><p><strong>Controlador:</strong> a definir.</p><p><strong>Canal de privacidade e encarregado:</strong> a definir.</p></section>
        <section><h2>Dados tratados</h2><p>Podemos tratar dados da conta, nome, e-mail, localização, currículo, experiências, formação, habilidades, preferências profissionais, histórico de oportunidades, candidaturas, entrevistas, feedback, identificador do Telegram, assinatura e metadados técnicos de segurança.</p></section>
        <section><h2>Finalidades</h2><p>Os dados são usados para manter a conta, organizar vagas, comparar oportunidades com o perfil, preparar materiais solicitados pelo usuário, enviar comunicações, processar pagamentos, prevenir abuso e atender direitos de privacidade.</p><p><strong>Bases legais por finalidade:</strong> a definir após validação jurídica.</p></section>
        <section><h2>Inteligência artificial</h2><p>Conteúdos do currículo e das vagas podem ser enviados ao Google Gemini para extração estruturada, geração de embeddings, análise de compatibilidade e preparação de materiais. O VagaMatch não deve usar esses resultados para tomar, sozinho, uma decisão final de contratação.</p></section>
        <section><h2>Compartilhamento e operadores</h2><p>O serviço utiliza infraestrutura ou integrações de Supabase, Vercel, Google Gemini, Telegram, Stripe e Mercado Pago conforme a funcionalidade utilizada. Contratos, regiões de processamento, subprocessadores e mecanismos de transferência internacional ainda precisam de validação formal.</p></section>
        <section><h2>Armazenamento local e cookies</h2><p>A autenticação utiliza armazenamento local necessário para manter a sessão. O código de indicação pode ser guardado temporariamente até o primeiro acesso. Não foi identificado uso atual de cookies publicitários pelo aplicativo.</p></section>
        <section><h2>Retenção e eliminação</h2><p>Os prazos de retenção por categoria estão a definir. Solicitações de exclusão passam por revisão para separar dados elimináveis daqueles cuja conservação seja necessária por obrigação legal, defesa de direitos, prevenção a fraude ou registros de pagamento.</p></section>
        <section><h2>Segurança</h2><p>Adotamos autenticação, isolamento por usuário, controle de acesso, limitação de requisições, validação de webhooks e proteção de credenciais. Nenhum sistema é totalmente imune a incidentes.</p></section>
        <section><h2>Seus direitos</h2><p>O titular pode solicitar confirmação de tratamento, acesso, correção, informações sobre compartilhamento, portabilidade quando aplicável, revisão e eliminação nos limites legais. Usuários autenticados podem exportar seus dados ou registrar uma solicitação de exclusão na área de privacidade.</p><Link className="button button--primary" to="/meus-dados">Acessar meus dados</Link></section>
      </main>
    </div>
  );
}
