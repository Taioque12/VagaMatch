import { createClient } from "@supabase/supabase-js";
import 'dotenv/config';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase URL or Service Key in env variables. Make sure .env is loaded.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function turnOnV3() {
  console.log("Ligando o pré-filtro V3...");

  const { error } = await supabase
    .from("app_state")
    .upsert({ 
      key: "v3_prefiltro", 
      value: "on", 
      updated_at: new Date().toISOString() 
    });

  if (error) {
    console.error("Falha ao ligar V3:", error.message);
  } else {
    console.log("✅ V3 ligado com sucesso no Supabase! O worker agora usará similaridade vetorial e Swarm.");
  }
}

turnOnV3();
