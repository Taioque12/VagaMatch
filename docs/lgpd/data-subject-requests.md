# Procedimento de direitos do titular

## Fluxo

1. O usuário autenticado exporta seus dados ou registra uma solicitação em `Meus dados`.
2. A solicitação de exclusão fica em `pending`; nenhuma exclusão automática é executada.
3. O responsável, ainda a definir, valida identidade, escopo, obrigações de retenção e eventuais riscos de fraude.
4. O atendimento é registrado como `in_review`, `completed` ou `rejected`, com justificativa mantida fora de campos expostos ao cliente quando necessário.
5. O usuário pode cancelar enquanto a solicitação estiver `pending`.

## Controles

- Acesso por JWT e RLS vinculada a `auth.uid()`.
- Limite distribuído por usuário e ação.
- Exportação restrita às linhas do titular.
- Alterações administrativas exigem credenciais server-side.
- Prazo de resposta, canal oficial e responsável: a definir e validar juridicamente.

## Checklist de conclusão

- Confirmar identidade e autoridade do solicitante.
- Localizar dados nos sistemas e operadores listados no inventário.
- Aplicar retenções obrigatórias documentadas.
- Executar correção, exportação, anonimização ou exclusão aprovada.
- Registrar evidências sem copiar dados pessoais desnecessários.
- Comunicar o resultado pelo canal aprovado.
