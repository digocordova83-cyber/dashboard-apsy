# Operação do Dashboard APSY

## Rotina diária

A atualização oficial do CRM ocorre às **09:00 BRT** e carrega dados até **D-1**. O endpoint é `POST /api/scheduled/sync-data`. No runtime atual, o Heartbeat autentica a chamada. Em outro provedor, use `SCHEDULED_SYNC_SECRET` como Bearer token.

Após cada execução, confirme que a resposta contém `ok: true`, período correto e contagens de funil. Uma falha no EducaCRM deve deixar o snapshot anterior intacto.

## Comandos operacionais

| Ação | Comando |
|---|---|
| Validar código | `pnpm validate` |
| Testar integrações reais | `pnpm test:integration` |
| Sincronizar CRM até hoje em BRT | `pnpm crm:sync` |
| Sincronizar CRM até data específica | `pnpm crm:sync -- 2026-09-21` |
| Auditar CRM sem alterar banco | `pnpm crm:audit` |
| Backup do snapshot CRM | `pnpm exec tsx scripts/backup_crm_before_educacrm.ts` |
| Carregar snapshot programático | `pnpm seed:programmatic` |
| Criar ou redefinir administrador | `pnpm admin:create` com variáveis `ADMIN_*` |

## Verificações após sincronização

Confirme o total bruto, as oportunidades válidas e as cinco etapas. Verifique também o intervalo de datas, IDs distintos e hora de importação. Na comunicação com o negócio, use BRT.

A regra de lead considerado é `opportunityStage` pertencente à taxonomia oficial e diferente de `FORA_DA_BASE`. O funil principal usa Não Localizado, Em Atendimento, Qualificado, Fechamento e Matriculado. Recusa, Desqualificado e Encaminhado para Graduação são saídas/direcionamentos.

## Comportamento por fonte

### EducaCRM

O snapshot é integral e transacional. A rotina recusa cargas com menos de 100 registros brutos ou normalizados. Se a API falhar, nenhum dado é apagado.

### Windsor.ai

O cache tem TTL de uma hora. Quando a API falha e existe cache anterior, o dashboard pode retornar o último resultado válido. A equipe deve informar a defasagem da fonte, não apresentar o cache como atualização atual.

### Publya

A resposta pode conter campanhas sem métricas de entrega. Nesse caso, a operação deve registrar ausência de entrega confirmada. Programática não deve ser somada a Meta ou Google sem fonte compatível.

## Incidentes

### Container não inicia após o deploy

Execute `pnpm validate`. Além de TypeScript, testes e build, o comando inicia `dist/index.js` com `NODE_ENV=production` e valida a resposta HTTP. O entrypoint de produção não pode importar Vite ou seus plugins; essas dependências ficam isoladas em `server/_core/dev.ts` e só são carregadas dinamicamente no ambiente de desenvolvimento.

### CRM retornou menos registros que o esperado

Não force a carga removendo a barreira de segurança. Execute `pnpm crm:audit`, compare os counts dos endpoints e verifique paginação, token e disponibilidade da API.

### Total de matrículas divergiu

Compare o dashboard com `ingresso/inscritos/`. O status `MATRICULADO` exige etapa `matriculado`, data de efetivação ou matrícula acadêmica, sem cancelamento. Fotografias históricas do Cirqua não são fonte de verdade após o cutover.

### UTMs diminuíram

Audite `utm_sources`, `utm_mediums` e `utm_campaigns` em leads, contatos e inscritos. A correção deve ocorrer na captura e no CRM; não preencha UTMs por inferência apenas para aumentar cobertura.

### Meta ou Google sem dados

Valide `WINDSOR_API_KEY`, contas oficiais e janela de datas. Execute os testes de integração. Se houver cache, comunique a data de coleta.

### Programática sem entrega

Valide credenciais e execute `scripts/check_publya_current_period.ts`. Linhas vazias não comprovam entrega.

## Backup e retenção

Backups e auditorias podem conter nome, e-mail, telefone, CPF e endereço. Grave-os em armazenamento criptografado, limite acesso e defina retenção com o controlador de dados da APSY. O diretório `artifacts/` é somente local e está fora do Git.

## Mudanças e releases

Toda mudança deve passar por pull request, CI verde e revisão. Alterações de schema exigem migração versionada. Mudanças na taxonomia oficial ou nas tabulações exigem atualização simultânea de `shared/crmFunnel.ts`, testes, dicionário de dados e validação de negócio.

## Referências

[1]: https://crm.apsyedu.com.br/swagger/ "EducaCRM API — Swagger"
[2]: https://docs.github.com/en/actions "GitHub Actions documentation"
