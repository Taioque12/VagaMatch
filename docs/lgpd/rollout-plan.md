# Plano de rollout e rollback LGPD

Nenhuma etapa deste documento representa autorização de produção.

## Pré-condições para solicitar GO

- Docker/Supabase local disponível e migrations 001-027 aprovadas em banco vazio.
- Aplicação incremental das migrations 026 e 027 aprovada em estrutura equivalente à atual.
- Testes de isolamento com dois usuários e Edge Function aprovados.
- Backup e procedimento de restauração confirmados.
- Política revisada e campos de governança essenciais definidos.
- Build, testes, auditoria de dependências e revisão do diff aprovados.

## Ordem proposta

1. Congelar alterações concorrentes de schema e embeddings durante a janela aprovada.
2. Registrar estado de extensões, índices, funções dependentes, policies e grants.
3. Aplicar a migration 026 por mecanismo versionado.
4. Validar tabela, RLS, grants e fluxos existentes com contas controladas.
5. Aplicar a migration 027 e validar pgvector, colunas, índices e funções dependentes.
6. Publicar `lgpd-rights` com `verify_jwt=true` e origens configuradas.
7. Publicar frontend somente após os contratos backend responderem corretamente.
8. Executar smoke tests e observar erros sem registrar dados pessoais desnecessários.

## Critérios de interrupção

- Falha de migration ou dependência de pgvector.
- Acesso entre usuários, grant inesperado ou bypass de RLS.
- Regressão em perfil, currículo, preferências, vagas, entrevistas ou indicações.
- Exportação incompleta, indisponível ou contendo dados de outro titular.
- Aumento de erros de autenticação, banco ou Edge Functions.

## Rollback

1. Interromper novas chamadas ao fluxo afetado.
2. Reverter frontend e Edge Function para a versão anterior aprovada.
3. Para a migration 027, usar o rollback versionado somente após interromper escritas de embeddings e validar o schema de destino.
4. Não remover `lgpd_requests` automaticamente; preservar solicitações já registradas e avaliar compatibilidade.
5. Restaurar grants somente a partir de uma matriz revisada, nunca com `grant all` genérico para clientes.
6. Confirmar integridade, funções dependentes e isolamento antes de reabrir o fluxo.
