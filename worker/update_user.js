import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data: profiles, error } = await supabase.from("profiles").select("*").limit(1);
  if (error) {
    console.error("Erro ao buscar perfil:", error);
    return;
  }
  
  if (profiles && profiles.length > 0) {
    const userId = profiles[0].id;
    console.log("Atualizando usuário:", userId);
    
    // Atualiza as preferências
    const { error: updatePref } = await supabase
      .from("preferencias")
      .update({
        cargos_alvo: ["Desenvolvedor Front-end"],
        palavras_chave: ["React", "JavaScript", "Frontend"],
        ativo: true
      })
      .eq("user_id", userId);
      
    if (updatePref) {
      console.error("Erro ao atualizar preferencias:", updatePref);
    } else {
      console.log("Preferências atualizadas para forçar a busca da Vaga Mock!");
    }
  } else {
    console.log("Nenhum usuário encontrado no banco de dados.");
  }
}

main();
