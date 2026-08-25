# Operadores e terceiros

Inventário inicial, sujeito a validação contratual e jurídica.

| Fornecedor | Papel técnico | Dados potenciais | Verificações pendentes |
| --- | --- | --- | --- |
| Supabase | autenticação, banco e funções | conta, perfil, currículo e uso | DPA, região, retenção e subprocessadores |
| Vercel | hospedagem da aplicação | metadados de requisição e logs | DPA, retenção e configuração de logs |
| Google Gemini | processamento de IA | conteúdo estritamente necessário às funções de IA | termos, retenção, treinamento e minimização |
| Groq | contingência de geração textual de IA quando o Gemini está indisponível ou limitado | somente texto estritamente necessário; PDFs, arquivos e embeddings não são enviados | DPA, região, retenção, treinamento, subprocessadores e transferência internacional |
| Telegram | notificações opcionais | identificador de chat e conteúdo enviado | consentimento, escopo e revogação |
| Stripe | pagamentos | identificadores e eventos de pagamento | DPA, retenção e responsabilidades |
| Mercado Pago | pagamentos | identificadores e eventos de pagamento | DPA, retenção e responsabilidades |

Antes de adicionar um fornecedor, registrar finalidade, categorias de dados, localização, subprocessadores, controles, canal de exclusão e base contratual.
