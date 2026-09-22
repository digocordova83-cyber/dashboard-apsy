# Variáveis de ambiente

Configure os valores no cofre de secrets do provedor. Não crie arquivos com credenciais dentro do repositório.

## Obrigatórias em produção

| Variável | Sensível | Finalidade |
|---|---:|---|
| `DATABASE_URL` | Sim | Conexão MySQL/TiDB usada pelo Drizzle |
| `JWT_SECRET` | Sim | Assinatura da sessão local; use ao menos 32 caracteres aleatórios |
| `CRM_EDUCACRM_TOKEN` | Sim | Token de leitura do EducaCRM |
| `CRM_EDUCACRM_BASE_URL` | Não | Base da API; padrão `https://crm.apsyedu.com.br/api` |
| `WINDSOR_API_KEY` | Sim | Acesso a Meta Ads e Google Ads via Windsor.ai |
| `SCHEDULED_SYNC_SECRET` | Sim | Bearer token do endpoint agendado fora do Heartbeat Manus |

## Programática

| Variável | Sensível | Finalidade |
|---|---:|---|
| `PUBLYA_API_TOKEN` | Sim | Bearer token da Publya |
| `PUBLYA_CLIENT_ID` | Sim | Identificador numérico do cliente |
| `PUBLYA_CLIENT_EMAIL` | Sim | E-mail usado para formar `User-Data` |

## Runtime

| Variável | Sensível | Finalidade |
|---|---:|---|
| `NODE_ENV` | Não | `development`, `test` ou `production` |
| `PORT` | Não | Porta HTTP; padrão `3000` |
| `AUDIT_OUTPUT_DIR` | Não | Diretório local de backups e relatórios; padrão `artifacts` |

## Compatibilidade com o runtime Manus

| Variável | Sensível | Finalidade |
|---|---:|---|
| `VITE_APP_ID` | Não | ID da aplicação no runtime |
| `OAUTH_SERVER_URL` | Não | Serviço de autenticação do runtime |
| `OWNER_OPEN_ID` | Sim | Identidade do proprietário no runtime |
| `BUILT_IN_FORGE_API_URL` | Não | Endpoint dos serviços internos |
| `BUILT_IN_FORGE_API_KEY` | Sim | Chave dos serviços internos e módulo de IA |

Essas variáveis não são necessárias para a autenticação local, mas partes do boilerplate e o Heartbeat nativo podem usá-las. Em uma migração completa para outro provedor, valide o módulo de otimizações antes de remover essa compatibilidade.

## Variáveis temporárias do bootstrap

`ADMIN_NAME`, `ADMIN_USERNAME` e `ADMIN_PASSWORD` são lidas apenas por `pnpm admin:create`. Defina-as no processo do comando e remova-as depois. A senha deve ter ao menos 12 caracteres.

## GitHub Actions

O CI padrão não recebe credenciais de produção. Testes determinísticos usam valores locais sem contato com APIs. Se a equipe criar um workflow manual de integração, use GitHub Environments, aprovação obrigatória e secrets com acesso somente leitura.

## Rotação

Gere credenciais novas quando um token aparecer em conversa, ticket ou arquivo compartilhado. Após o cutover, revogue tokens antigos e valide `pnpm test:integration` com os novos valores.

## Referências

[1]: https://docs.github.com/en/actions/security-for-github-actions/security-guides/using-secrets-in-github-actions "GitHub Actions — Using secrets"
