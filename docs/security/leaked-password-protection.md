# Proteção contra senhas vazadas

## Estado verificado

Em 21 de agosto de 2026, o advisor de segurança do projeto Supabase `wrdxvhhmyptizlpdeaue` informou `Leaked Password Protection Disabled`. Nenhuma configuração foi alterada durante a verificação.

Referência oficial: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

## Ativação futura

1. Confirmar disponibilidade e eventual requisito de plano no projeto.
2. No painel do projeto, abrir `Authentication`, depois as configurações de proteção de senha.
3. Registrar o estado anterior e ativar a verificação de senhas comprometidas.
4. Não alterar simultaneamente comprimento mínimo ou regras de complexidade sem avaliação separada.
5. Testar cadastro, troca de senha e recuperação com contas de teste controladas.
6. Confirmar mensagens genéricas, acessíveis e sem enumeração de contas.
7. Monitorar falhas de autenticação e suporte após a mudança.

## Rollback

Se houver regressão comprovada e autorização para rollback, restaurar somente essa configuração ao estado anterior, registrar horário, impacto e evidências. Não reduzir outras proteções como parte do rollback.
