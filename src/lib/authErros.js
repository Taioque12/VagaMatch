// Traduz os erros do Supabase Auth (sempre em inglês) para mensagens úteis em
// português. Sem isso o testador vê "Invalid login credentials" e desiste.

const MENSAGENS = [
  [/invalid login credentials/i, "E-mail ou senha incorretos."],
  [/user already registered|already been registered/i, "Este e-mail já tem conta. Faça login."],
  [/password should be at least/i, "A senha precisa ter no mínimo 6 caracteres."],
  [/unable to validate email|invalid format/i, "E-mail inválido."],
  [/email not confirmed/i, "Confirme seu e-mail antes de entrar."],
  [/email rate limit exceeded|over_email_send_rate_limit/i, "Muitas tentativas seguidas. Aguarde alguns minutos."],
  [/for security purposes.*(\d+) seconds/i, "Aguarde alguns segundos antes de tentar de novo."],
  [/signups not allowed|signup is disabled/i, "Os cadastros estão temporariamente fechados."],
  [/database error/i, "Erro ao criar sua conta. Tente novamente em instantes."],
  [/failed to fetch|networkerror/i, "Sem conexão com o servidor. Verifique sua internet."],
];

export function traduzErroAuth(error) {
  if (!error) return null;
  const bruto = error.message || String(error);
  for (const [padrao, texto] of MENSAGENS) {
    if (padrao.test(bruto)) return texto;
  }
  return "Não foi possível concluir. Tente novamente.";
}
