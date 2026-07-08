import { supabase } from "./db.js";

async function run() {
  console.log("Limpando vagas_vistas...");
  const { error } = await supabase.from("vagas_vistas").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  if (error) console.error(error);
  else console.log("Limpeza concluída.");
}

run();
