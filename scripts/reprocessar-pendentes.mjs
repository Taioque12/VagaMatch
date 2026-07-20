// Desentupimento pontual (2026-07-20): 141 vagas ficaram travadas em
// 'pendente_processamento' porque rodadas do cron morreram no meio
// (timeout de 12min do Actions) antes de avaliá-las, e o dedup nunca as
// reinclui sozinho. Reaproveita a mesma função de produção
// (processarLoteDeVagas) — mesma Camada 0/1, mesmo rate-limit do Gemini,
// mesma notificação Telegram. Rodar 1x manualmente; o fix estrutural em
// worker/index.js evita que isso se repita.
import { requireEnv } from "../worker/config.js";
import { supabase, lerConfigV3 } from "../worker/db.js";
import { processarLoteDeVagas } from "../worker/processamento.js";

requireEnv(["supabaseUrl", "supabaseServiceKey", "geminiApiKey", "telegramBotToken"]);

async function buscarUsuariosComPendentes() {
  const { data: pendentes, error } = await supabase
    .from("vagas_vistas")
    .select("user_id")
    .eq("status", "pendente_processamento");
  if (error) throw new Error(`Supabase select (pendentes): ${error.message}`);

  const userIds = [...new Set(pendentes.map((p) => p.user_id))];
  if (!userIds.length) return [];

  const [{ data: perfis, error: eP }, { data: prefs, error: ePr }, { data: curriculos, error: eC }] =
    await Promise.all([
      supabase.from("profiles").select("id, telegram_chat_id").in("id", userIds),
      supabase.from("preferencias").select("user_id, cargos_alvo, palavras_chave, regioes, modo_regiao, raio_km").in("user_id", userIds),
      supabase.from("curriculos").select("*").in("user_id", userIds),
    ]);
  if (eP) throw new Error(`Supabase select (profiles): ${eP.message}`);
  if (ePr) throw new Error(`Supabase select (preferencias): ${ePr.message}`);
  if (eC) throw new Error(`Supabase select (curriculos): ${eC.message}`);

  const perfilPorId = new Map((perfis ?? []).map((p) => [p.id, p]));
  const curriculoPorId = new Map((curriculos ?? []).map((c) => [c.user_id, c]));

  return (prefs ?? [])
    .map((pref) => ({ pref, perfil: perfilPorId.get(pref.user_id), curriculo: curriculoPorId.get(pref.user_id) }))
    .filter(({ perfil }) => perfil?.telegram_chat_id);
}

async function main() {
  const usuarios = await buscarUsuariosComPendentes();
  console.log(`Usuários com vagas pendentes: ${usuarios.length}`);

  const configV3 = await lerConfigV3();
  console.log(`Config V3: prefiltro=${configV3.prefiltroAtivo ? "ON" : "OFF"}, threshold=${configV3.threshold}.`);

  let totalProcessadas = 0;
  let totalFalhas = 0;

  for (const usuario of usuarios) {
    const { data: vagas, error } = await supabase
      .from("vagas_vistas")
      .select("*")
      .eq("user_id", usuario.perfil.id)
      .eq("status", "pendente_processamento")
      .order("data_encontrada", { ascending: true });
    if (error) {
      console.error(`Falha ao buscar pendentes de ${usuario.perfil.id}: ${error.message}`);
      continue;
    }
    if (!vagas.length) continue;

    console.log(`\n— Usuário ${usuario.perfil.id}: ${vagas.length} vaga(s) pendente(s) —`);
    try {
      const { processadas, falhas } = await processarLoteDeVagas(usuario, vagas, configV3);
      totalProcessadas += processadas;
      totalFalhas += falhas;
      console.log(`  → ${processadas} notificada(s), ${falhas} falha(s).`);
    } catch (e) {
      console.error(`Falha fatal no usuário ${usuario.perfil.id}: ${e.message}`);
      totalFalhas++;
    }
  }

  console.log(`\nDesentupimento concluído. ${totalProcessadas} vaga(s) notificada(s), ${totalFalhas} falha(s) no total.`);
}

main().catch((e) => {
  console.error("ERRO FATAL:", e);
  process.exit(1);
});
