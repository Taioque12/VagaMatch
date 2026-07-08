import { processarFeedback } from "./feedback.js";

async function run() {
  console.log("Processando feedback...");
  try {
    await processarFeedback();
    console.log("Concluído!");
  } catch (e) {
    console.error(e);
  }
}

run();
