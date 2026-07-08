import { buscarPerfilPorChatId } from "./db.js";

async function run() {
  const perfil = await buscarPerfilPorChatId(221472441);
  console.log("Perfil encontrado:", perfil);
}

run();
