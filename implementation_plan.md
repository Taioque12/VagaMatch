# Plano — comando /ajuda

Status prévio verificado em `supabase/functions/telegram-webhook/index.ts` (produção, deploy v14, commit `0067210`):
- Botão "⬅️ Voltar" (`menu:voltar`) já existe nos 3 submenus (região, modalidade, salário) — linhas 193/216/233, handler linha 426.
- Filtro de salário mínimo já completo: migration `021_salario_minimo.sql` aplicada, `worker/filter.js:filtrarPorSalarioMinimo`, `worker/db.js` selecionando a coluna, menu Telegram (`menu:salario`), comando `/salario`, `/status` exibindo o valor.

Únicog gap real pedido e ainda ausente: **comando `/ajuda`**.

## Mudança

**Arquivo:** `supabase/functions/telegram-webhook/index.ts`

1. Novo handler em `tratarMensagem`, ao lado dos outros comandos texto (`/status`, `/regiao`, `/modalidade`, `/salario`):

```ts
if (texto === "/ajuda") {
  await enviarMensagemSimples(chatId,
    "📋 *Comandos disponíveis*\n\n" +
    "/menu — Abre o menu principal\n" +
    "/buscar — Busca vagas agora\n" +
    "/status — Mostra suas preferências atuais\n" +
    "/regiao — Configura região de busca\n" +
    "/modalidade — Configura modalidade de trabalho\n" +
    "/salario — Configura salário mínimo\n" +
    "/atualizar — Atualiza currículo/perfil no site"
  );
  return;
}
```

2. Botão "❓ Ajuda" no menu principal (`enviarMenu`), como link direto pro comando (Telegram não tem "clicar pra rodar comando" nativo em inline button — uso `callback_data: "ajuda"` reaproveitando o mesmo texto).

Sem mudança de schema, sem mudança no worker — só texto estático.

## Aguardando confirmação antes de codar.
