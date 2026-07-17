import { env } from "./config.js";

// Fase A (V3): embeddings de vagas em batch via Gemini text-embedding-004 (768 dims).
// REST direto (mesmo padrão do webhook) — batchEmbedContents aceita vários textos
// por request, então 1 rodada inteira custa poucas chamadas, não 1 por vaga.

const EMBED_MODEL = "gemini-embedding-2";
const EMBED_DIMS = 768;
// Chunk conservador: payload do Google tem limite e descrições de vaga são longas.
const CHUNK_SIZE = 50;

function textoDaVaga(vaga) {
  return [vaga.titulo, vaga.empresa, (vaga.descricao || vaga.resumo || "")]
    .filter(Boolean)
    .join("\n")
    .slice(0, 8000); // ~2k tokens por texto, folga pro limite do modelo
}

async function chamarBatchEmbed(textos) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:batchEmbedContents?key=${env.geminiApiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: textos.map((texto) => ({
          model: `models/${EMBED_MODEL}`,
          content: { parts: [{ text: texto }] },
        })),
      }),
    }
  );

  if (!res.ok) {
    const corpo = (await res.text()).slice(0, 300);
    const err = new Error(`Gemini batchEmbedContents ${res.status}: ${corpo}`);
    err.isRateLimit = res.status === 429;
    throw err;
  }

  const data = await res.json();
  const embeddings = (data.embeddings || []).map((e) => e.values);
  if (embeddings.length !== textos.length) {
    throw new Error(
      `batchEmbedContents retornou ${embeddings.length} embeddings para ${textos.length} textos.`
    );
  }
  return embeddings;
}

// Recebe vagas (com id + titulo/descricao), retorna [{ id, embedding }].
// Best-effort por chunk: falha em um chunk não derruba os demais — vaga sem
// embedding segue o fluxo normal (Camada 0 é fail-open, ver migration 017).
export async function gerarEmbeddingsVagas(vagas) {
  const resultados = [];
  for (let i = 0; i < vagas.length; i += CHUNK_SIZE) {
    const chunk = vagas.slice(i, i + CHUNK_SIZE);
    try {
      const embeddings = await chamarBatchEmbed(chunk.map(textoDaVaga));
      chunk.forEach((vaga, j) => {
        if (embeddings[j]?.length === EMBED_DIMS) {
          resultados.push({ id: vaga.id, embedding: embeddings[j] });
        }
      });
    } catch (e) {
      console.warn(
        `Embedding batch falhou (chunk ${i / CHUNK_SIZE + 1}, ${chunk.length} vagas): ${e.message}`
      );
      if (e.isRateLimit) break; // 429: para de insistir nesta rodada
    }
  }
  return resultados;
}
