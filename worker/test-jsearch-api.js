import { env } from "./config.js";

async function run() {
  const url = new URL("https://jsearch.p.rapidapi.com/search-v2");
  url.searchParams.set("query", "Desenvolvedor");
  url.searchParams.set("country", "br");

  const res = await fetch(url, {
    headers: {
      "X-RapidAPI-Key": env.rapidapiKey,
      "X-RapidAPI-Host": "jsearch.p.rapidapi.com",
    },
  });
  const data = await res.json();
  console.log(JSON.stringify(data, null, 2).substring(0, 800));
}

run();
