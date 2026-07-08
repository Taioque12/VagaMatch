import { supabase } from "./db.js";
import { enviarMensagemSimples } from "./telegram.js";

async function run() {
  const { data: pref, error } = await supabase.from('preferencias').select('cargos_alvo, palavras_chave, modo_regiao, raio_km').eq('user_id', 'bacbac9d-e6ed-427b-9743-e002ba6463bb').maybeSingle();
  if (error) throw error;
  
  console.log("Preferencias:", pref);
  const textoStatus = `👤 *Seu Status de Busca*\n\n🎯 *Cargos-alvo:*\n${(pref.cargos_alvo || []).join(', ')}\n\n🔑 *Palavras-chave:*\n${(pref.palavras_chave || []).join(', ')}\n\n📍 *Região:*\n${pref.modo_regiao === 'brasil' ? 'Brasil Todo' : 'Minha Região (' + (pref.raio_km || 500) + 'km)'}`;
  
  console.log("Tentando enviar texto:", textoStatus);
  try {
    await enviarMensagemSimples("221472441", textoStatus);
    console.log("Enviado com sucesso!");
  } catch(e) {
    console.error("Erro ao enviar:", e.message);
  }
}

run();
