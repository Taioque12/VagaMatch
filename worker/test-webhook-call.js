async function run() {
  const url = "https://wrdxvhhmyptizlpdeaue.supabase.co/functions/v1/telegram-webhook";
  
  const fakeUpdate = {
    update_id: 999999998,
    message: {
      message_id: 998,
      from: { id: 221472441, is_bot: false, first_name: "Leo" },
      chat: { id: 221472441, type: "private" },
      date: Math.floor(Date.now() / 1000),
      text: "/menu"
    }
  };

  console.log("Chamando webhook com /menu para Leo...");
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(fakeUpdate),
  });
  
  console.log("Status:", res.status);
  const body = await res.text();
  console.log("Body:", body);
}

run();
