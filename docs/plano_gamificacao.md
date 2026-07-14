# Plano de Implementação: Gamificação e Market Value 🚀

Este plano detalha a construção da feature que mostra o "Valor de Mercado" do usuário com base nas vagas encontradas, incluindo o armazenamento de salários no banco de dados e a interface gamificada.

## User Review Required

> [!IMPORTANT]
> Adicionaremos uma nova Migration no Supabase para criar as colunas de salário na tabela `vagas_vistas`. Certifique-se de não haver problemas em rodar essa migration.

## Open Questions
- A sugestão de *Upsell* ("Adicione a habilidade X para ganhar mais") será baseada inicialmente num algoritmo estático simples (sugerindo habilidades em alta como Docker/Inglês) para não onerar APIs da IA nesta versão 1.0 da feature. Tudo bem?

## Proposed Changes

---
### Banco de Dados (Supabase Migrations)

#### [NEW] supabase/migrations/010_salarios_vagas.sql
Criar as colunas `salario_min` e `salario_max` (tipo `numeric`) na tabela `vagas_vistas` para começarmos a registrar os valores financeiros das vagas encontradas.

---
### Worker Backend (worker/db.js)

#### [MODIFY] worker/db.js
Atualizar a função `deduplicarParaUsuario` para extrair e persistir `v.salario_min` e `v.salario_max` durante o `upsert` das vagas vindas da Adzuna/JSearch.

---
### Frontend - Dashboard (src/pages/Dashboard.jsx)

#### [MODIFY] src/pages/Dashboard.jsx
* **Cálculo em Tempo Real:** Criar um `useMemo` que itera sobre `vagas` e calcula a Média Salarial (`(salario_min + salario_max) / 2`) das vagas que possuem salário divulgado.
* **UI de Market Value:** Adicionar um novo *Card Premium* brilhante acima do resumo, dizendo: *"O mercado está pagando em média R$ X.XXX para o seu perfil."*
* **Dica de Upsell (Gamificação):** Abaixo do valor, exibir um aviso de "Dica para subir de nível", incentivando o usuário a adicionar novas tecnologias em `/onboarding` para atingir vagas melhores.
* **Estilização:** Inclusão de gradientes dourados ou verdes no arquivo CSS para destacar o painel de dinheiro.

## Verification Plan
### Testes Automáticos / Manuais
1. Rodar `supabase migration up` (simulação) ou inserir as colunas direto pelo SQL Editor.
2. Rodar `node worker/index.js --limit 5` para popular vagas novas com a informação salarial.
3. Abrir o `/dashboard` localmente e conferir o visual e se o cálculo da média está correto com os dados reais do banco.
