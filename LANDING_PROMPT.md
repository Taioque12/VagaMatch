# Prompt de Design — Landing Page "VagaMatch" (ajustado)

Ajustes feitos: nome (risco de marca "Meta"), stack (Vite+React, não Next.js), preço
marcado como placeholder (billing ainda não definido — ver DESIGN.md).

## CONTEXTO DO PRODUTO

VagaMatch é um micro-SaaS de assinatura que automatiza a busca de emprego. O usuário
assina, cadastra o currículo, e recebe automaticamente no Telegram vagas filtradas
(região dele + Brasil todo), já com o currículo formatado e frases de abordagem/pesquisa
prontas para aplicar. É o "match" entre candidato e vaga.

A página é uma **landing page de conversão única**: apresentar o produto, explicar o
passo a passo, mostrar planos e converter em assinatura. Não é um dashboard — é a
porta de entrada.

---

## OBJETIVO DO DESIGN

Criar uma landing page moderna, leve e magnética, que fuja radicalmente do "template
de SaaS genérico gerado por IA". O usuário-alvo é alguém ansioso/cansado de procurar
emprego manualmente — o design precisa transmitir **alívio, controle e movimento
automático** (coisas acontecendo por ele), sem parecer corporativo/frio nem "startup
fintech clichê".

---

## PROIBIDO (anti-clichê de IA)

- Gradiente roxo/azul/rosa "aurora" de fundo
- `rounded-2xl` em tudo, cards flutuantes com sombra difusa genérica
- Ícones de biblioteca óbvia (Heroicons/Lucide) soltos sem tratamento, sem escala/peso customizado
- Hero centralizado com H1 + subtítulo + botão + imagem 3D de robô/notebook flutuando
- Blobs orgânicos decorativos de fundo
- Grid perfeitamente simétrico de 3 colunas repetido em todas as seções
- Emojis como bullet point

## DIREÇÃO VISUAL

- **Conceito central:** "match" e "movimento automático". Pense em uma metáfora visual
  de vaga → currículo → Telegram fluindo, como um rastro/trilha, não como ícones
  estáticos com setinha.
- **Paleta:** escala de cinzas cromáticos (quase-preto grafite, cinza morno, off-white
  quente) + **uma única cor de destaque saturada** usada com extrema disciplina (ex:
  um verde-sinal ou um azul-Telegram dessaturado, aplicado só em CTAs e pontos de foco
  — não em fundos inteiros).
- **Tipografia:** fonte geométrica/neo-grotesca (ex: família estilo Inter/Söhne/General
  Sans) para corpo; títulos grandes com `letter-spacing` levemente negativo (-0.02em a
  -0.04em) e peso alto (700-800) contrastando com corpo leve (400-450).
- **Layout:** grid assimétrico — não centralizar tudo. Uma seção pode ter texto ocupando
  5/12 colunas e um "artefato visual" (mockup de chat do Telegram, por exemplo)
  ocupando 7/12, desalinhado verticalmente do bloco de texto.
- **Espaçamento:** generoso, respiro real entre seções (mín. 120-160px de padding
  vertical em desktop). Isso é o que separa "premium" de "template".
- **Micro-interações:** hover states sutis (mudança de contraste de borda, não de cor
  de fundo inteira), transições ~200ms ease-out, sem bounce/spring exagerado.
  Scroll-reveal discreto (fade + translate de 8-12px, nunca zoom ou rotação).

---

## ESTRUTURA DE SEÇÕES

### 1. Hero
- Headline forte, direta, sem jargão de "revolucione sua carreira". Foco no benefício
  mecânico: vagas chegando sozinhas, no Telegram, já filtradas.
- CTA único e claro ("Começar agora" / "Ativar minhas vagas") — sem CTA secundário
  competindo.
- Elemento visual: mockup real de uma conversa no Telegram recebendo uma vaga
  formatada (isso vende a promessa mais que qualquer ilustração abstrata).

### 2. Como funciona (passo a passo)
- 3-4 passos, mas **não** em cards idênticos lado a lado. Considere uma trilha vertical
  ou diagonal, numeração tipográfica grande (ex: "01" em tipo grande e fino), cada
  passo com peso visual diferente.
- Passos: assina → sobe/cola currículo → sistema cruza com vagas da região + Brasil →
  recebe no Telegram já com currículo ajustado e mensagem de abordagem pronta.

### 3. O que você recebe (benefícios)
- Não usar ícone + título + parágrafo repetido 6x. Misturar formatos: um item em
  destaque grande, outros menores ao lado, criando hierarquia real.

### 4. Prova / credibilidade
- Se não houver depoimentos reais ainda, mostrar números do sistema (nº de vagas
  monitoradas, fontes, frequência de atualização) em tipografia grande como elemento
  de design, não em cards de estatística genéricos.

### 5. Planos / Pricing
- **Preço ainda não definido — usar placeholder explícito tipo "R$ XX/mês" e
  "R$ XX/ano" no lugar de qualquer valor final.** Não inventar número.
- Estrutura clara de assinatura (mensal, possível anual com desconto). Destacar 1
  plano como recomendado sem usar a badge "MAIS POPULAR" clichê — usar tratamento
  tipográfico/borda diferenciado.

### 6. FAQ
- Accordion simples, sem sombra pesada, com borda fina que reage no hover/aberto.

### 7. CTA final + Footer
- Reforço direto da promessa central. Footer minimalista.

---

## REQUISITOS TÉCNICOS DE IMPLEMENTAÇÃO

- **Vite + React (não Next.js)** — projeto já usa `react-router-dom` para rotas;
  componentes em `src/components/ui` (primitivos) e `src/components/modules`
  (seções da landing), consumidos por `src/pages/Landing.jsx`.
- Sem valores hardcoded: textos de planos/preços vindos de config centralizada
  (ex: `src/lib/planos.js`), preparada pra puxar do Supabase quando o billing
  (Fase 4) for implementado.
- Totalmente responsivo mobile-first (o público provavelmente vai acessar via link
  no Telegram, direto do celular).
- Performance: imagens/mockups otimizados, carregamento lazy fora do viewport
  inicial, fontes carregadas com `font-display: swap`.
- Acessibilidade: contraste AA mínimo mesmo na paleta de cinzas, foco visível em
  todos os elementos interativos.
- **CSS: puro, seguindo o padrão já usado em `src/index.css`** (classes BEM-like em
  português: `.landing-hero`, `.landing-cta`, etc — mesmo estilo do resto do projeto).
  Não adicionar Tailwind nem outra lib de CSS-in-JS — projeto é pequeno, já tem
  convenção rodando, dependência nova não compensa aqui.

---

## TOM DE VOZ (copy)

Direto, sem gordura, sem "transforme sua vida profissional hoje mesmo!". Fala como
alguém que resolveu um problema chato de forma inteligente. Frases curtas. Pode ter
leve humor seco no microcopy (ex: botão, empty states).
