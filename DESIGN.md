# VagaMatch — Descritivo visual (Landing Page + Admin)

Documento pra avaliação antes de virar visual final. Cobre decisão de cor, hierarquia,
copy e o "porquê" de cada escolha — pensado pra conversão (usuário virar assinante).

## Público-alvo e tom

Pessoa de baixa renda buscando emprego, que não tem paciência/tempo pra ficar
navegando em painel. Tom: direto, sem jargão corporativo, foco no benefício
concreto ("vaga chega pronta no seu Telegram"), não no "recurso técnico".

## Paleta

| Cor | Hex | Uso |
|---|---|---|
| Verde escuro | `#1f4a37` | fundo do hero (gradiente), títulos de seção |
| Verde principal | `#2f6f4f` | CTA secundário, cards, números, botões (já usado no dashboard existente) |
| Amarelo/dourado | `#ffb703` | **botão principal "Criar conta grátis"** — única cor quente da página, contraste alto de propósito pra puxar o olho direto pro CTA |
| Fundo geral | `#f7f7f5` / `#f0efe9` | neutro, deixa os cards brancos "flutuarem" |
| Vermelho | `#b33` | só erro/alerta (admin, formulários) |

Por que amarelo no botão principal: é a única cor quente em toda a paleta verde/neutra —
o olho vai direto nele. Verde sozinho (botão secundário) não compete por atenção.

## Landing page — estrutura e porquê

1. **Hero (fundo verde gradiente escuro→claro, tela cheia)**
   - Título direto no benefício: "Vaga certa, direto no seu Telegram." (não fala de
     "plataforma", "sistema" — fala do resultado)
   - Subtítulo mata 3 objeções em uma frase: não precisa acessar site / currículo
     ajustado automaticamente / chega no Telegram
   - Dois CTAs: primário (amarelo, "Criar conta grátis") e secundário (contorno
     transparente, "Já tenho conta") — não empurra os dois com o mesmo peso visual

2. **Como funciona (3 passos numerados)**
   - Números em círculo verde — reduz ansiedade de "vai ser complicado configurar"
   - 3 passos só, cada um uma frase — nada de explicação técnica de RLS/worker/etc

3. **Por que usar (grid de 4 benefícios)**
   - Cada item com borda esquerda verde (recorrente com resto do site) — reforça
     confiança ("nunca candidata sozinho" ataca o medo #1 de quem já usou bot ruim)

4. **Footer CTA**
   - Repete o call-to-action no fim — quem leu tudo e ainda não converteu, essa é
     a segunda chance

## O que falta decidir (não é técnico, é decisão de negócio/copy)

- **Prova social**: sem depoimento/número de vagas encontradas ainda (não temos
  dado real de produção pra colocar "+500 vagas encontradas" sem mentir).
  Quando tiver 1-2 casos reais, adiciono seção de depoimento — converte muito
  mais que qualquer benefício listado.
- **Preço**: hoje não aparece nenhum valor na landing (plano grátis x pago ainda
  não está definido — Fase 4 do ROADMAP). Quando decidir o modelo de cobrança,
  a landing precisa de uma seção de planos.
- **Vídeo/gif do fluxo real** (bot mandando vaga+currículo no Telegram) converte
  mais que texto — sugiro gravar uma vez que o worker estiver rodando em produção.

## Admin — estrutura e porquê

- Cards de número grande (mesma lógica do dashboard do usuário, consistência
  visual) — visão rápida de "tá saudável ou não" sem precisar interpretar tabela
- Card de erro isolado em vermelho (`.card-alerta`) — única cor de alerta na tela,
  fácil de notar problema sem procurar
- Sem gráfico ainda — 6 números + 2 listas cobrem "usuários ativos, assinatura,
  saúde" que você pediu. Gráfico de tendência (comparar semana a semana) é próximo
  passo natural quando tiver mais de ~2-3 semanas de dado acumulado

## Arquivos

- `src/pages/Landing.jsx` + `.landing*` em `src/index.css`
- `src/pages/Admin.jsx` + `.admin`/`.card*` em `src/index.css`
- Rotas: `/` (landing, pública), `/dashboard` (usuário, protegida), `/admin`
  (só role=admin, protegida por `RotaAdmin.jsx`)

## Como ver rodando

```
npm install
npm run dev
```

Landing em `/`, sem precisar de login. Admin em `/admin` exige usuário com
`role = 'admin'` no Supabase (promover manualmente — ver comentário no fim de
`supabase/migrations/004_admin_assinatura.sql`).
