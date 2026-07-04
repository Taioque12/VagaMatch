# VagaMatch — Descritivo visual (Landing Page + Admin)

A landing foi desenhada no claude.ai/design (2 iterações) e portada pra React aqui no
projeto. Este documento registra a versão final implementada e o porquê de cada escolha.

## Público-alvo e tom

Pessoa de baixa renda buscando emprego, que não tem paciência/tempo pra ficar
navegando em painel. Tom: direto, sem jargão corporativo, leve humor seco, foco no
benefício concreto ("vaga chega pronta no seu Telegram"), não no "recurso técnico".

## Paleta

| Cor | Hex | Uso |
|---|---|---|
| Grafite quase-preto | `#1a1815` | hero, faixa de números, cartão de plano em destaque, CTA final, footer |
| Verde-sinal | `#2e7d5b` | cor de destaque única — CTA, bordas de foco, ícones |
| Verde claro (sobre fundo escuro) | `#4fa87e` | mesma função do verde-sinal, ajustado de contraste quando o fundo é escuro |
| Bege quente (fundo geral) | `#f6f3ee` | fundo das seções claras |
| Bege escuro | `#efe9de` | fundo da seção de benefícios (rompe a monotonia entre dois blocos claros) |

Só uma cor de destaque saturada (verde) em cima de uma escala grafite/bege — sem
gradiente roxo/azul, sem paleta "SaaS genérica". O contraste alto entre blocos escuros
e claros a cada seção é o que dá o ritmo "editorial" em vez de "página achatada".

## Landing page — estrutura e porquê

1. **Hero escuro (nav + hero + faixa de vagas rolando, tudo em `#1a1815`)**
   - Headline: "Procurar emprego é trabalho de robô." — frase de efeito, não fala de
     "revolucione sua carreira"; humor seco batendo com o tom pedido
   - Mockup de conversa real no Telegram ao lado — vende a promessa mais que qualquer
     ilustração abstrata
   - Faixa de vagas rolando (marquee) embaixo do hero passa sensação de "sistema vivo,
     rodando agora" — **conteúdo ilustrativo**, trocar por vaga real do worker assim
     que tiver volume em produção

2. **Como funciona — passos em zigue-zague**
   - Alternando esquerda/direita a cada passo (não é lista vertical reta) — foge do
     "card idêntico repetido"; números grandes e finos (estilo editorial)

3. **O que você recebe — lista editorial**
   - Título fixo (sticky) do lado esquerdo, itens à direita com tamanho de fonte
     variado (primeiro maior) — hierarquia real, não ícone+título+parágrafo repetido

4. **Prova em números — fundo escuro**
   - Rompe o padrão claro→claro criando ritmo de alternância; números grandes como
     elemento de design, não card de estatística genérico
   - **Conteúdo ilustrativo** (11.400+ vagas, 60+ fontes) — mesma ressalva do marquee

5. **Planos — "Match" / "Match Plus"**
   - Nomes curtos, ligados ao nome do produto (em vez de "Vaga Certa")
   - Cartão recomendado com fundo escuro (não a badge "MAIS POPULAR" clichê) — o
     próprio contraste de cor já comunica destaque
   - **Preço ilustrativo** — ver `src/lib/planos.js`, billing real ainda não integrado

6. **CTA final em duas cores**
   - "Pare de procurar." (branco) + "Deixe a vaga te achar." (verde) — reforça a
     promessa central uma última vez antes do footer

## O que falta decidir (não é técnico, é decisão de negócio/copy)

- **Prova social real**: números da seção 4 e vagas do marquee (seção 1) são
  ilustrativos. Quando tiver dado real de produção, troca os dois — depoimento de
  usuário real converte mais que qualquer número ilustrativo.
- **Preço final**: hoje é valor de exemplo em `src/lib/planos.js` (billing real é
  Fase 4 do ROADMAP).
- **Vídeo/gif do fluxo real** (bot mandando vaga+currículo no Telegram) converte
  mais que o mockup estático do hero — gravar assim que o worker rodar em produção.

## Admin — estrutura e porquê

- Cards de número grande (mesma lógica do dashboard do usuário, consistência
  visual) — visão rápida de "tá saudável ou não" sem precisar interpretar tabela
- Card de erro isolado em vermelho (`.card-alerta`) — única cor de alerta na tela,
  fácil de notar problema sem procurar
- Sem gráfico ainda — 6 números + 2 listas cobrem "usuários ativos, assinatura,
  saúde" que você pediu. Gráfico de tendência (comparar semana a semana) é próximo
  passo natural quando tiver mais de ~2-3 semanas de dado acumulado

## Arquivos

- `src/pages/Landing.jsx` + classes `.lp-*` em `src/index.css`
- `src/lib/planos.js` — preços e features dos planos, isolados do componente
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
