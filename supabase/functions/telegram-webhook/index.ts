import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import { jsPDF } from "https://esm.sh/jspdf@2.5.1"
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

// ─── Funções de Desenho de PDF (jsPDF) ──────────────────────────────────────
const MARGEM = 50;
const LARGURA_UTIL_PT = 595.28 - MARGEM * 2;

function novaPagina(doc: any, y: number) {
  const alturaPagina = doc.internal.pageSize.getHeight();
  if (y > alturaPagina - MARGEM) {
    doc.addPage();
    return MARGEM;
  }
  return y;
}

function secaoPdf(doc: any, y: number, titulo: string) {
  y += 10;
  y = novaPagina(doc, y);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(26, 26, 26);
  doc.text(titulo, MARGEM, y);
  y += 4;
  doc.setDrawColor(204, 204, 204);
  doc.line(MARGEM, y, MARGEM + LARGURA_UTIL_PT, y);
  y += 14;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(26, 26, 26);
  return y;
}

function paragrafoPdf(doc: any, y: number, texto: string) {
  const linhas = doc.splitTextToSize(texto || "", LARGURA_UTIL_PT);
  linhas.forEach((linha: string) => {
    y = novaPagina(doc, y);
    doc.text(linha, MARGEM, y);
    y += 13;
  });
  return y;
}

function bulletPdf(doc: any, y: number, texto: string) {
  const linhas = doc.splitTextToSize(`•  ${texto}`, LARGURA_UTIL_PT - 10);
  linhas.forEach((linha: string, i: number) => {
    y = novaPagina(doc, y);
    doc.text(linha, MARGEM + (i === 0 ? 0 : 10), y);
    y += 13;
  });
  return y;
}

function gerarPdfBytes(cvJson: string, nomeCompleto: string, localizacao?: string): Uint8Array {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  let cv;
  try { cv = JSON.parse(cvJson); } catch { cv = {}; }

  let y = MARGEM;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(0, 0, 0);
  doc.text(nomeCompleto, MARGEM + LARGURA_UTIL_PT / 2, y, { align: "center" });
  y += 20;

  if (localizacao) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(85, 85, 85);
    doc.text(localizacao, MARGEM + LARGURA_UTIL_PT / 2, y, { align: "center" });
    y += 16;
  }
  doc.setTextColor(26, 26, 26);

  if (cv.resumo_profissional) {
    y = secaoPdf(doc, y, "Resumo Profissional");
    y = paragrafoPdf(doc, y, cv.resumo_profissional);
  }

  if (cv.habilidades?.length) {
    y = secaoPdf(doc, y, "Habilidades Técnicas");
    y = paragrafoPdf(doc, y, cv.habilidades.join(" · "));
  }

  if (cv.experiencias?.length) {
    y = secaoPdf(doc, y, "Experiência Profissional");
    for (const exp of cv.experiencias) {
      y = novaPagina(doc, y);
      doc.setFont("helvetica", "bold");
      doc.text(`${exp.cargo || ""} | ${exp.empresa || ""} | ${exp.periodo || ""}`, MARGEM, y);
      y += 13;
      doc.setFont("helvetica", "normal");
      for (const b of exp.bullets ?? []) y = bulletPdf(doc, y, b);
      y += 4;
    }
  }

  if (cv.formacao?.length) {
    y = secaoPdf(doc, y, "Formação Acadêmica");
    for (const f of cv.formacao) y = bulletPdf(doc, y, f);
  }

  if (cv.cursos?.length) {
    y = secaoPdf(doc, y, "Cursos Complementares");
    for (const c of cv.cursos) y = bulletPdf(doc, y, c);
  }

  if (cv.projetos?.length) {
    y = secaoPdf(doc, y, "Projetos");
    for (const pr of cv.projetos) y = bulletPdf(doc, y, pr);
  }

  return new Uint8Array(doc.output('arraybuffer'));
}

async function enviarDocumento(chatId: string | number, pdfBytes: Uint8Array, filename: string) {
  const form = new FormData();
  form.append("chat_id", String(chatId));
  form.append("document", new Blob([pdfBytes], { type: "application/pdf" }), filename);

  const res = await fetch(API("sendDocument"), {
    method: "POST",
    body: form,
  });
  const data = await res.json();
  if (!res.ok || data.ok === false) {
    console.error(`Telegram sendDocument error:`, data);
  }
  return data;
}

const STATUS_POR_TIPO: Record<string, string> = { cand: "candidatado", desc: "descartada" };
const TEXTOS_STATUS: Record<string, string> = { cand: "Marcado como candidatado ✅", desc: "Vaga descartada 🗑️" };

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

async function tratarCallback(cq: any) {
  const data = cq.data ?? "";
  const cqId = cq.id;
  const fromId = cq.from.id;
  const chatId = cq.message?.chat?.id;

  const responderCallback = (text?: string) => chamarApi("answerCallbackQuery", { callback_query_id: cqId, text });

  if (data.startsWith("st:")) {
    const [, tipo, callbackId] = data.split(":");

    // ─── Gerar PDF sob demanda (botão "📄 Gerar PDF") ──────────────────────
    // Única porta de entrada para a chamada Gemini de currículo — o worker e o
    // clique "Candidatei-me" não geram mais nada automaticamente.
    if (tipo === "pdf") {
      const { data: vaga } = await supabase
        .from('vagas_vistas')
        .select('id, user_id, job_id, titulo, empresa, url, descricao')
        .eq('callback_id', callbackId)
        .maybeSingle();

      if (!vaga) {
        await responderCallback("Vaga não encontrada (registro antigo).");
        return;
      }

      // Tira o "reloginho" do botão imediatamente
      await responderCallback("Gerando PDF... 📄");

      if (!chatId) return;
      if (!GEMINI_API_KEY) {
        await enviarTextoPuro(chatId, "⚠️ Geração de currículo indisponível no momento. Tente novamente mais tarde.");
        return;
      }

      try {
        const [{ data: perfil }, { data: curriculo }] = await Promise.all([
          supabase.from("profiles").select("nome_completo, localizacao").eq("id", vaga.user_id).maybeSingle(),
          supabase.from("curriculos").select("*").eq("user_id", vaga.user_id).maybeSingle(),
        ]);

        if (!curriculo) {
          await enviarTextoPuro(chatId, "⚠️ Currículo-base não encontrado. Cadastre seu currículo no painel para gerar versões ajustadas.");
          return;
        }

        const nomeCompleto = perfil?.nome_completo || "Candidato";

        // Aviso visível no chat (o answerCallback é só um toast efêmero)
        await enviarTextoPuro(chatId, "⏳ Gerando seu currículo otimizado para esta vaga...");

        const cvJson = await gerarCurriculoOnDemand(vaga, curriculo, nomeCompleto);
        const pdfBytes = gerarPdfBytes(cvJson, nomeCompleto, perfil?.localizacao);
        const filename = `Curriculo_${nomeCompleto.replace(/\s+/g, "_")}_${vaga.empresa.replace(/\s+/g, "_")}.pdf`;
        await enviarDocumento(chatId, pdfBytes, filename);
      } catch (e) {
        console.error("Erro ao gerar currículo on-demand:", e);
        await enviarTextoPuro(chatId, "⚠️ Não foi possível gerar o currículo ajustado agora. Tente novamente mais tarde.");
      }
      return;
    }

    const status = STATUS_POR_TIPO[tipo];
    if (!status) return;

    const { data: vaga } = await supabase
      .from('vagas_vistas')
      .select('id, user_id, job_id, titulo, empresa, url, telegram_message_id, score, motivo_ia')
      .eq('callback_id', callbackId)
      .maybeSingle();

    if (!vaga) {
      await responderCallback("Vaga não encontrada (registro antigo).");
      return;
    }
    await supabase.from('vagas_vistas').update({ status }).eq('id', vaga.id);
    await responderCallback(TEXTOS_STATUS[tipo]);

    // chat_id vem do próprio callback (vagas_vistas não tem coluna telegram_chat_id)
    // Ao candidatar-se, mantém o botão "📄 Gerar PDF" disponível; ao descartar, limpa tudo.
    if (vaga.telegram_message_id && chatId) {
      await chamarApi("editMessageReplyMarkup", {
        chat_id: chatId,
        message_id: vaga.telegram_message_id,
        reply_markup: tipo === "cand"
          ? { inline_keyboard: [[{ text: "📄 Gerar PDF", callback_data: `st:pdf:${callbackId}` }]] }
          : { inline_keyboard: [] },
      });
    }

    // Oferece a entrevista simulada logo após o usuário se candidatar
    if (tipo === "cand" && chatId) {
      await oferecerEntrevista(supabase, enviarTextoPuro, chatId, vaga.user_id, vaga.id);
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
