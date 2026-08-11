import { requireEnv } from "../worker/config.js";
import { supabase } from "../worker/db.js";
import { gerarEmbeddingsCurriculos } from "../worker/embeddings.js";

requireEnv(["supabaseUrl", "supabaseServiceKey", "geminiApiKey"]);

const BATCH_SIZE = 50;

async function main() {
  let processados = 0;

  while (true) {
    const { data: curriculos, error } = await supabase
      .from("curriculos")
      .select("user_id, resumo_profissional, habilidades, experiencias, formacao, cursos, projetos")
      .is("embedding", null)
      .limit(BATCH_SIZE);
    if (error) throw new Error(`Falha ao buscar currículos sem embedding: ${error.message}`);
    if (!curriculos?.length) break;

    const embeddings = await gerarEmbeddingsCurriculos(curriculos);
    if (!embeddings.length) {
      console.warn("Nenhum currículo do lote contém texto suficiente; encerrando para evitar loop.");
      break;
    }

    for (const item of embeddings) {
      const { error: updateError } = await supabase
        .from("curriculos")
        .update({ embedding: item.embedding })
        .eq("user_id", item.user_id)
        .is("embedding", null);
      if (updateError) throw new Error(`Falha ao salvar embedding (${item.user_id}): ${updateError.message}`);
      processados++;
    }
    console.log(`Embeddings preenchidos: ${processados}`);
  }

  console.log(`Reprocessamento concluído: ${processados} currículo(s).`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
