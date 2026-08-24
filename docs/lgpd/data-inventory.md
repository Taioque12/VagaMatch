# Inventário de dados pessoais

Documento operacional inicial. Deve ser revisado pelo responsável jurídico e pelo encarregado, ambos ainda a definir.

| Categoria | Exemplos | Finalidade | Sistema | Retenção |
| --- | --- | --- | --- | --- |
| Conta | e-mail, identificador, datas da conta | autenticação e segurança | Supabase Auth | a definir |
| Perfil profissional | nome, localização, currículo, experiências, formação e preferências | personalização da busca por vagas | Supabase | a definir |
| Uso do produto | vagas vistas, feedback, candidaturas e entrevistas | organizar oportunidades e melhorar recomendações | Supabase | a definir |
| Integrações | identificador do Telegram e tokens temporários | vincular notificações solicitadas pelo usuário | Supabase e Telegram | a definir |
| Pagamentos | estado da assinatura e identificadores de sessão | processar e reconciliar pagamentos | Stripe, Mercado Pago e Supabase | conforme obrigação aplicável, a definir |
| Segurança | limites de uso, locks e eventos técnicos | prevenção de abuso, integridade e diagnóstico | Supabase e Vercel | a definir |

## Dados derivados e IA

O sistema pode gerar embeddings e análises de aderência a partir de currículo, preferências e vagas. A finalidade, os campos enviados, o fundamento jurídico e a revisão humana aplicável devem permanecer documentados e ser validados antes de expansão do tratamento.

## Pendências de governança

- Controlador, encarregado e canal oficial: a definir.
- Bases legais por operação: a validar juridicamente.
- Prazos de retenção e descarte: a definir.
- Registro de operadores e transferências internacionais: completar antes da publicação final da política.
