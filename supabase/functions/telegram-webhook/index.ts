import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { oferecerEntrevista, processarMensagemEntrevista } from "./interview.ts"

const TELEGRAM_BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") || "";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const API = (metodo: string) => `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${metodo}`;

async function chamarApi(metodo: string, body: any) {
  const res = await fetch(API(metodo), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok || data.ok === false) {
    console.error(`Telegram ${metodo} error:`, data);
  }
  return data;
}

const STATUS_POR_TIPO: Record<string, string> = { cand: "candidatado", desc: "descartada" };
const TEXTOS_STATUS: Record<string, string> = { cand: "Marcado como candidatado ✅ Gerando currículo ajustado...", desc: "Vaga descartada 🗑️" };

async function enviarMenu(chatId: string | number) {
  await chamarApi("sendMessage", {
    chat_id: chatId,
    text: "O que você quer fazer?",
    reply_markup: {
      inline_keyboard: [
        [{ text: "🔍 Buscar vagas agora", callback_data: "busca:agora" }],
        [{ text: "📍 Configurar região", callback_data: "menu:regiao" }],
        [{ text: "🔄 Atualizar Perfil (Site)", url: "https://vaga-match-coral.vercel.app/onboarding" }],
      ],
    },
  });
}

async function enviarMenuRegiao(chatId: string | number) {
  await chamarApi("sendMessage", {
    chat_id: chatId,
    text: "Buscar vaga onde?",
    reply_markup: {
      inline_keyboard: [
        [{ text: "📍 Minha região (raio 100km)", callback_data: "modo:regiao:100" }],
        [{ text: "📍 Minha região (raio 500km)", callback_data: "modo:regiao:500" }],
        [{ text: "🌎 Brasil todo", callback_data: "modo:brasil:0" }],
      ],
    },
  });
}

async function enviarMensagemSimples(chatId: string | number, texto: string) {
  await chamarApi("sendMessage", { chat_id: chatId, text: texto, parse_mode: "Markdown" });
}

// Sem parse_mode: texto livre vindo do Gemini pode conter caracteres que quebram
// o parser de Markdown do Telegram (mensagem seria rejeitada inteira).
async function enviarTextoPuro(chatId: string | number, texto: string) {
  await chamarApi("sendMessage", { chat_id: chatId, text: texto });
}

// ─── Passo 5: Geração de currículo on-demand via Gemini ─────────────────────
// Chamada diretamente na Edge Function quando o usuário clica "Candidatei-me".
// Usa a API REST do Gemini em vez do SDK Node (não disponível em Deno).
async function gerarCurriculoOnDemand(vaga: any, curriculo: any, nomeCompleto: string): Promise<string> {
  const curriculoBase = [
    `Nome: ${nomeCompleto}`,
    "",
    "Resumo profissional:",
    curriculo.resumo_profissional || "(não informado)",
    "",
    ...(curriculo.habilidades?.length ? ["Habilidades técnicas:", curriculo.habilidades.join(", "), ""] : []),
    ...(curriculo.experiencias?.length ? [
      "Experiência profissional (mais recente primeiro):",
      ...curriculo.experiencias.flatMap((exp: any) => [
        `- ${exp.cargo} | ${exp.empresa} | ${exp.periodo}`,
        ...(exp.bullets ?? []).map((b: string) => `  - ${b}`),
      ]),
      "",
    ] : []),
    ...(curriculo.formacao?.length ? ["Formação acadêmica:", ...curriculo.formacao.map((f: string) => `- ${f}`), ""] : []),
    ...(curriculo.cursos?.length ? ["Cursos complementares:", ...curriculo.cursos.map((c: string) => `- ${c}`), ""] : []),
    ...(curriculo.projetos?.length ? ["Projetos paralelos:", ...curriculo.projetos.map((p: string) => `- ${p}`)] : []),
  ].join("\n");

  const systemPrompt = `Você é um especialista em currículos técnicos no Brasil.

Sua tarefa: ajustar o currículo-base abaixo para uma vaga específica.

REGRAS INEGOCIÁVEIS:
- NUNCA invente experiência, certificação, curso ou dado que não esteja no currículo-base.
- Você pode: reordenar bullets, reescrever o resumo profissional destacando o que a vaga pede, selecionar/priorizar cursos mais relevantes, incorporar palavras-chave da vaga QUANDO correspondem a experiência real.
- Mantenha datas, empresas e cargos exatamente como estão.
- Escreva em português do Brasil.
- "resumo_profissional" é a frase de apresentação do candidato: EXATAMENTE 5 linhas, tom direto,
  resumindo quem é, principais competências e o que busca — alinhado à vaga, sem inventar nada.

CURRÍCULO-BASE:
${curriculoBase}`;

  const userPrompt = `Ajuste o currículo para esta vaga:\n\nTítulo: ${vaga.titulo}\nEmpresa: ${vaga.empresa}\nLocal: ${vaga.local || "Não informado"}\n\nDescrição:\n${vaga.descricao || vaga.resumo || "Não informado"}`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ parts: [{ text: userPrompt }] }],
        generationConfig: { responseMimeType: "application/json" },
      }),
    }
  );

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Gemini ${res.status}: ${errorText.slice(0, 200)}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join("") ?? "";
  return text;
}

// Formata o currículo gerado como texto Markdown legível no Telegram
function formatarCurriculoTelegram(cvJson: string, nomeCompleto: string): string {
  try {
    const cv = JSON.parse(cvJson);
    const linhas: string[] = [];

    linhas.push(`📄 *Currículo Ajustado para a Vaga*`);
    linhas.push(`👤 *${nomeCompleto}*`);
    linhas.push("");

    if (cv.resumo_profissional) {
      linhas.push("*Resumo Profissional:*");
      linhas.push(cv.resumo_profissional);
      linhas.push("");
    }

    if (cv.habilidades?.length) {
      linhas.push("*Habilidades Técnicas:*");
      linhas.push(cv.habilidades.join(" · "));
      linhas.push("");
    }

    if (cv.experiencias?.length) {
      linhas.push("*Experiência Profissional:*");
      for (const exp of cv.experiencias) {
        linhas.push(`▸ *${exp.cargo}* | ${exp.empresa} | ${exp.periodo}`);
        for (const b of exp.bullets ?? []) {
          linhas.push(`  • ${b}`);
        }
      }
      linhas.push("");
    }

    if (cv.formacao?.length) {
      linhas.push("*Formação Acadêmica:*");
      for (const f of cv.formacao) linhas.push(`  • ${f}`);
      linhas.push("");
    }

    if (cv.cursos?.length) {
      linhas.push("*Cursos Complementares:*");
      for (const c of cv.cursos) linhas.push(`  • ${c}`);
      linhas.push("");
    }

    if (cv.projetos?.length) {
      linhas.push("*Projetos:*");
      for (const pr of cv.projetos) linhas.push(`  • ${pr}`);
      linhas.push("");
    }

    if (cv.palavras_chave_da_vaga_cobertas?.length) {
      linhas.push(`✅ *Palavras-chave cobertas:* ${cv.palavras_chave_da_vaga_cobertas.join(", ")}`);
    }

    linhas.push("");
    linhas.push("_Copie o texto acima para usar no seu currículo!_");

    return linhas.join("\n");
  } catch {
    // Se não conseguir parsear, retorna o JSON cru
    return `📄 *Currículo Ajustado:*\n\n${cvJson}`;
  }
}

async function tratarCallback(cq: any) {
  const data = cq.data ?? "";
  const cqId = cq.id;
  const fromId = cq.from.id;
  const chatId = cq.message?.chat?.id;

  const responderCallback = (text?: string) => chamarApi("answerCallbackQuery", { callback_query_id: cqId, text });

  if (data.startsWith("st:")) {
    const [, tipo, callbackId] = data.split(":");
    const status = STATUS_POR_TIPO[tipo];
    if (!status) return;

    // Buscar dados completos da vaga (incluindo descrição para geração de CV)
    const { data: vaga } = await supabase
      .from('vagas_vistas')
      .select('id, user_id, job_id, titulo, empresa, url, telegram_message_id, score, motivo_ia, descricao')
      .eq('callback_id', callbackId)
      .maybeSingle();

    if (!vaga) {
      await responderCallback("Vaga não encontrada (registro antigo).");
      return;
    }
    await supabase.from('vagas_vistas').update({ status }).eq('id', vaga.id);
    await responderCallback(TEXTOS_STATUS[tipo]);

    // chat_id vem do próprio callback (vagas_vistas não tem coluna telegram_chat_id)
    if (vaga.telegram_message_id && chatId) {
      await chamarApi("editMessageReplyMarkup", {
        chat_id: chatId,
        message_id: vaga.telegram_message_id,
        reply_markup: { inline_keyboard: [] },
      });
    }

    // ─── Passo 5: Gerar currículo on-demand ao clicar "Candidatei-me" ─────
    if (tipo === "cand" && chatId && GEMINI_API_KEY) {
      try {
        // Buscar perfil e currículo do usuário
        const [{ data: perfil }, { data: curriculo }] = await Promise.all([
          supabase.from("profiles").select("nome_completo, localizacao").eq("id", vaga.user_id).maybeSingle(),
          supabase.from("curriculos").select("*").eq("user_id", vaga.user_id).maybeSingle(),
        ]);

        if (!curriculo) {
          await chamarApi("sendMessage", {
            chat_id: chatId,
            text: "⚠️ Currículo-base não encontrado. Cadastre seu currículo no painel para gerar versões ajustadas.",
          });
          return;
        }

        const nomeCompleto = perfil?.nome_completo || "Candidato";

        // Aviso visível no chat (o answerCallback é só um toast efêmero)
        await chamarApi("sendMessage", {
          chat_id: chatId,
          text: "⏳ Estou gerando seu currículo otimizado para esta vaga...",
        });

        // Gerar currículo ajustado via Gemini
        const cvJson = await gerarCurriculoOnDemand(vaga, curriculo, nomeCompleto);
        const textoFormatado = formatarCurriculoTelegram(cvJson, nomeCompleto);

        // Enviar o currículo formatado como mensagem no Telegram
        await chamarApi("sendMessage", {
          chat_id: chatId,
          text: textoFormatado,
          parse_mode: "Markdown",
        });

        // Oferece a entrevista simulada logo após entregar o CV
        await oferecerEntrevista(supabase, enviarTextoPuro, chatId, vaga.user_id, vaga.id);
      } catch (e) {
        console.error("Erro ao gerar currículo on-demand:", e);
        await chamarApi("sendMessage", {
          chat_id: chatId,
          text: "⚠️ Não foi possível gerar o currículo ajustado agora. Tente novamente mais tarde.",
        });
      }
    }

    return;
  }

  if (data === "busca:agora") {
    const { data: perfil } = await supabase.from("profiles").select("id").eq("telegram_chat_id", String(fromId)).maybeSingle();
    if (!perfil) {
      await responderCallback("Perfil não encontrado — vincule seu Telegram no onboarding.");
      return;
    }
    await supabase.from("preferencias").update({ busca_solicitada: true }).eq("user_id", perfil.id);
    await responderCallback("Busca solicitada! Você recebe o resultado em instantes.");
    return;
  }

  if (data === "menu:regiao") {
    await responderCallback();
    if (chatId) await enviarMenuRegiao(chatId);
    return;
  }

  if (data.startsWith("modo:")) {
    const [, modo, raio] = data.split(":");
    const { data: perfil } = await supabase.from("profiles").select("id").eq("telegram_chat_id", String(fromId)).maybeSingle();
    if (!perfil) {
      await responderCallback("Perfil não encontrado.");
      return;
    }
    const modoRegiao = modo === "brasil" ? "brasil" : "minha_regiao";
    const raioNum = Number(raio);
    const raioValido = Number.isFinite(raioNum) && raioNum > 0 && raioNum <= 5000 ? raioNum : 500;
    
    await supabase.from("preferencias").update({
      modo_regiao: modoRegiao,
      ...(modoRegiao === "minha_regiao" ? { raio_km: raioValido } : {})
    }).eq("user_id", perfil.id);

    await responderCallback(modoRegiao === "brasil" ? "Modo: Brasil todo ✅" : `Modo: minha região (raio ${raio}km) ✅`);
    return;
  }
}

async function tratarMensagem(msg: any) {
  const texto = (msg.text ?? "").trim();
  const chatId = msg.chat.id;

  // Fluxo de entrevista simulada: se o usuário tem sessão em andamento, a mensagem
  // pode ser dele respondendo o recrutador IA. Comandos (/menu etc.) têm precedência
  // dentro do próprio módulo — ele devolve false quando não consome a mensagem.
  if (texto && !texto.startsWith("/start")) {
    const { data: perfilEntrevista } = await supabase
      .from("profiles")
      .select("id")
      .eq("telegram_chat_id", String(chatId))
      .maybeSingle();
    if (perfilEntrevista) {
      const consumida = await processarMensagemEntrevista(
        supabase, enviarTextoPuro, chatId, perfilEntrevista.id, texto
      );
      if (consumida) return;
    }
  }

  if (texto.startsWith("/start")) {
    const partes = texto.split(" ");
    if (partes.length > 1) {
      const userId = partes[1].trim();
      const { error } = await supabase.from("profiles").update({ telegram_chat_id: String(chatId) }).eq("id", userId);
      if (error) {
        console.error("Erro ao vincular Telegram:", error);
      } else {
        await enviarMensagemSimples(chatId, "✅ Telegram conectado com sucesso ao seu perfil do VagaMatch!");
      }
    }
    await enviarMenu(chatId);
    return;
  }

  if (texto === "/menu") {
    await enviarMenu(chatId);
    return;
  }
  
  if (texto === "/buscar") {
    const { data: perfil } = await supabase.from("profiles").select("id").eq("telegram_chat_id", String(chatId)).maybeSingle();
    if (!perfil) return;
    await supabase.from("preferencias").update({ busca_solicitada: true }).eq("user_id", perfil.id);
    return;
  }
  
  if (texto === "/status") {
    const { data: perfil } = await supabase.from("profiles").select("id").eq("telegram_chat_id", String(chatId)).maybeSingle();
    if (!perfil) return;
    
    const { data: pref, error } = await supabase.from('preferencias').select('cargos_alvo, palavras_chave, modo_regiao, raio_km').eq('user_id', perfil.id).maybeSingle();
    
    if (error) {
      console.error(`Falha ao buscar preferencias: ${error.message}`);
      await enviarMensagemSimples(chatId, "Erro ao buscar seu status. Tente de novo mais tarde.");
      return;
    }
    if (pref) {
      const textoStatus = `👤 *Seu Status de Busca*\n\n🎯 *Cargos-alvo:*\n${(pref.cargos_alvo || []).join(', ')}\n\n🔑 *Palavras-chave:*\n${(pref.palavras_chave || []).join(', ')}\n\n📍 *Região:*\n${pref.modo_regiao === 'brasil' ? 'Brasil Todo' : 'Minha Região (' + (pref.raio_km || 500) + 'km)'}`;
      await enviarMensagemSimples(chatId, textoStatus);
    } else {
      await enviarMensagemSimples(chatId, "Nenhuma preferência configurada ainda.");
    }
    return;
  }
  
  if (texto === "/regiao") {
    await enviarMenuRegiao(chatId);
    return;
  }
  
  if (texto.toLowerCase() === "/atualizar") {
    await chamarApi("sendMessage", {
      chat_id: chatId,
      text: "Para atualizar suas preferências, enviar um novo currículo ou editar os cargos que a IA deduziu, acesse nosso site:",
      reply_markup: {
        inline_keyboard: [
          [{ text: "🔄 Atualizar Perfil no Site", url: "https://vaga-match-coral.vercel.app/onboarding" }]
        ]
      }
    });
    return;
  }
}

const TELEGRAM_WEBHOOK_SECRET = Deno.env.get("TELEGRAM_WEBHOOK_SECRET") || "";

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // Valida que o update veio mesmo do Telegram (secret_token do setWebhook).
  // Sem isso, qualquer um pode forjar updates e alterar preferências de usuários.
  if (TELEGRAM_WEBHOOK_SECRET) {
    const token = req.headers.get("X-Telegram-Bot-Api-Secret-Token");
    if (token !== TELEGRAM_WEBHOOK_SECRET) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  try {
    const upd = await req.json();
    
    if (upd.callback_query) {
      await tratarCallback(upd.callback_query);
    } else if (upd.message) {
      await tratarMensagem(upd.message);
    }

    return new Response("OK", { status: 200 });
  } catch (e) {
    console.error("Erro no webhook:", e);
    return new Response("Internal Server Error", { status: 500 });
  }
});
