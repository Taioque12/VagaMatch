// Entrevista simulada por texto (MVP) — a IA faz papel de recrutador da vaga.
// Estado da sessão vive na tabela `entrevistas`; uma sessão em andamento por usuário.
// Cota: MAX_ENTREVISTAS_SEMANA por usuário; MAX_PERGUNTAS por sessão.

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") || "";

export const MAX_PERGUNTAS = 5;
const MAX_ENTREVISTAS_SEMANA = 3;

type Supabase = any; // cliente supabase-js criado no index.ts
type EnviarMensagem = (chatId: string | number, texto: string) => Promise<unknown>;

async function chamarGemini(systemPrompt: string, historico: any[], mensagemUsuario?: string): Promise<string> {
  const contents = historico.map((m: any) => ({
    role: m.papel === "recrutador" ? "model" : "user",
    parts: [{ text: m.texto }],
  }));
  if (mensagemUsuario) contents.push({ role: "user", parts: [{ text: mensagemUsuario }] });
  // Gemini exige que a conversa comece com 'user'
  if (!contents.length || contents[0].role !== "user") {
    contents.unshift({ role: "user", parts: [{ text: "Pode começar a entrevista." }] });
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents,
      }),
    }
  );
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Gemini ${res.status}: ${errorText.slice(0, 200)}`);
  }
  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join("") ?? "";
}

function montarSystemPrompt(vaga: any, curriculo: any, nomeCompleto: string, perguntasFeitas: number): string {
  const habilidades = (curriculo?.habilidades ?? []).join(", ");
  const experiencias = (curriculo?.experiencias ?? [])
    .map((e: any) => `- ${e.cargo} | ${e.empresa} | ${e.periodo}`)
    .join("\n");

  return `Você é um recrutador técnico experiente conduzindo uma entrevista simulada em português do Brasil, por texto, no Telegram.

VAGA:
Título: ${vaga.titulo}
Empresa: ${vaga.empresa ?? "não informada"}
Descrição: ${(vaga.descricao ?? "não informada").slice(0, 2000)}

CANDIDATO: ${nomeCompleto}
Habilidades: ${habilidades || "não informadas"}
Experiências:
${experiencias || "não informadas"}

REGRAS:
- Faça UMA pergunta por vez (técnica ou comportamental), relevante para a vaga e o perfil.
- Quando o candidato responder, dê primeiro um feedback construtivo curto (o que foi bom, o que melhorar), depois faça a próxima pergunta.
- Esta é a pergunta ${perguntasFeitas + 1} de ${MAX_PERGUNTAS}. ${perguntasFeitas + 1 >= MAX_PERGUNTAS ? "Esta é a ÚLTIMA pergunta — após o candidato responder, dê o feedback final da entrevista inteira (pontos fortes, pontos a melhorar, nota de 0 a 10) e encerre." : ""}
- Tom profissional e encorajador. Mensagens curtas, adequadas ao Telegram (sem markdown pesado).
- Nunca invente dados sobre o candidato; use só o que está acima.`;
}

// Oferece a entrevista logo após a entrega do currículo on-demand.
export async function oferecerEntrevista(
  supabase: Supabase,
  enviar: EnviarMensagem,
  chatId: string | number,
  userId: string,
  vagaId: string
) {
  // Cota semanal
  const seteDiasAtras = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from("entrevistas")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", seteDiasAtras);
  if ((count ?? 0) >= MAX_ENTREVISTAS_SEMANA) return;

  // Encerra oferta/sessão anterior pendurada (índice único permite só uma em andamento)
  await supabase
    .from("entrevistas")
    .update({ status: "encerrada", updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .in("status", ["oferecida", "ativa"]);

  const { error } = await supabase
    .from("entrevistas")
    .insert({ user_id: userId, vaga_id: vagaId, status: "oferecida" });
  if (error) {
    console.error("Erro ao criar oferta de entrevista:", error.message);
    return;
  }

  await enviar(
    chatId,
    "🎤 Quer treinar para a entrevista dessa vaga agora? Responda com 'Sim' para começarmos. (Ou 'Não' para dispensar.)"
  );
}

// Retorna a sessão em andamento (oferecida ou ativa) do usuário, se houver.
export async function buscarSessao(supabase: Supabase, userId: string) {
  const { data } = await supabase
    .from("entrevistas")
    .select("id, vaga_id, status, historico, perguntas_feitas")
    .eq("user_id", userId)
    .in("status", ["oferecida", "ativa"])
    .maybeSingle();
  return data;
}

// Processa mensagem de texto de quem tem sessão em andamento.
// Retorna true se a mensagem foi consumida pelo fluxo de entrevista.
export async function processarMensagemEntrevista(
  supabase: Supabase,
  enviar: EnviarMensagem,
  chatId: string | number,
  userId: string,
  texto: string
): Promise<boolean> {
  const sessao = await buscarSessao(supabase, userId);
  if (!sessao) return false;

  const t = texto.trim().toLowerCase();

  if (t === "/parar" || t === "parar") {
    await supabase
      .from("entrevistas")
      .update({ status: "encerrada", updated_at: new Date().toISOString() })
      .eq("id", sessao.id);
    await enviar(chatId, "Entrevista encerrada. Bons estudos e boa sorte na vaga! 🍀");
    return true;
  }

  // ── Oferta pendente: só reage a sim/não; qualquer outra coisa passa pros comandos ──
  if (sessao.status === "oferecida") {
    if (["sim", "s", "yes", "quero", "bora", "vamos"].includes(t)) {
      return await iniciarEntrevista(supabase, enviar, chatId, userId, sessao);
    }
    if (["não", "nao", "n", "no"].includes(t)) {
      await supabase
        .from("entrevistas")
        .update({ status: "encerrada", updated_at: new Date().toISOString() })
        .eq("id", sessao.id);
      await enviar(chatId, "Sem problemas! Se mudar de ideia, é só se candidatar a outra vaga. 😉");
      return true;
    }
    return false; // não era resposta à oferta — deixa comandos normais funcionarem
  }

  // ── Sessão ativa: texto é resposta do candidato ──
  if (texto.startsWith("/")) return false; // comandos têm precedência

  const [{ data: vaga }, { data: perfil }, { data: curriculo }] = await Promise.all([
    supabase.from("vagas_vistas").select("titulo, empresa, descricao").eq("id", sessao.vaga_id).maybeSingle(),
    supabase.from("profiles").select("nome_completo").eq("id", userId).maybeSingle(),
    supabase.from("curriculos").select("habilidades, experiencias, resumo_profissional").eq("user_id", userId).maybeSingle(),
  ]);

  const historico = Array.isArray(sessao.historico) ? sessao.historico : [];
  const ultimaPergunta = sessao.perguntas_feitas >= MAX_PERGUNTAS;

  try {
    const systemPrompt = montarSystemPrompt(
      vaga ?? { titulo: "vaga", empresa: null, descricao: null },
      curriculo,
      perfil?.nome_completo || "Candidato",
      sessao.perguntas_feitas
    );
    const resposta = await chamarGemini(systemPrompt, historico, texto);

    const novoHistorico = [
      ...historico,
      { papel: "candidato", texto },
      { papel: "recrutador", texto: resposta },
    ];

    await supabase
      .from("entrevistas")
      .update({
        historico: novoHistorico,
        perguntas_feitas: ultimaPergunta ? sessao.perguntas_feitas : sessao.perguntas_feitas + 1,
        status: ultimaPergunta ? "encerrada" : "ativa",
        updated_at: new Date().toISOString(),
      })
      .eq("id", sessao.id);

    await enviar(chatId, resposta);
    if (ultimaPergunta) {
      await enviar(chatId, "🏁 Entrevista concluída! Você pode treinar de novo se candidatando a outra vaga.");
    }
  } catch (e) {
    console.error("Erro na entrevista simulada:", e);
    await enviar(chatId, "⚠️ Tive um problema para processar sua resposta. Tente de novo em instantes, ou envie /parar para encerrar.");
  }
  return true;
}

async function iniciarEntrevista(
  supabase: Supabase,
  enviar: EnviarMensagem,
  chatId: string | number,
  userId: string,
  sessao: any
): Promise<boolean> {
  const [{ data: vaga }, { data: perfil }, { data: curriculo }] = await Promise.all([
    supabase.from("vagas_vistas").select("titulo, empresa, descricao").eq("id", sessao.vaga_id).maybeSingle(),
    supabase.from("profiles").select("nome_completo").eq("id", userId).maybeSingle(),
    supabase.from("curriculos").select("habilidades, experiencias, resumo_profissional").eq("user_id", userId).maybeSingle(),
  ]);

  await enviar(chatId, "🎬 Ótimo! Preparando a entrevista com base na vaga e no seu currículo...");

  try {
    const systemPrompt = montarSystemPrompt(
      vaga ?? { titulo: "vaga", empresa: null, descricao: null },
      curriculo,
      perfil?.nome_completo || "Candidato",
      0
    );
    const pergunta = await chamarGemini(systemPrompt, []);

    await supabase
      .from("entrevistas")
      .update({
        status: "ativa",
        historico: [{ papel: "recrutador", texto: pergunta }],
        perguntas_feitas: 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", sessao.id);

    await enviar(chatId, pergunta);
    await enviar(chatId, `(Responda por texto. São até ${MAX_PERGUNTAS} perguntas — envie /parar para encerrar a qualquer momento.)`);
  } catch (e) {
    console.error("Erro ao iniciar entrevista:", e);
    await supabase
      .from("entrevistas")
      .update({ status: "encerrada", updated_at: new Date().toISOString() })
      .eq("id", sessao.id);
    await enviar(chatId, "⚠️ Não consegui iniciar a entrevista agora. Tente de novo mais tarde.");
  }
  return true;
}
