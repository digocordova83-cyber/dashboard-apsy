# Dicionário de dados do Dashboard APSY

## Fonte oficial de CRM

O EducaCRM fornece leads, contatos, inscritos, cursos e situações. O dashboard reconcilia essas entidades em `crm_leads`. Cada linha representa um lead da captação ou uma inscrição que não pôde ser ligada com segurança a um lead.

## Identificadores

| Campo | Regra |
|---|---|
| `externalId` | `educacrm-lead:<id>` para leads ou `educacrm-inscrito:<codigo>` para inscrições preservadas |
| `opportunityNumber` | ID do lead ou código da inscrição |
| `id` | Chave interna autoincremental; não usar para conciliação entre ambientes |

## Funil normalizado

Todos os relatórios usam a mesma taxonomia comercial. O código canônico fica em `opportunityStage`; a tabulação original permanece em `opportunityTag`.

| Etapa | Definição | Tabulações oficiais | Próxima ação |
|---|---|---|---|
| `NAO_LOCALIZADO` | Comercial tentou contato e não teve resposta | `não_localizado` | Seguir cadência de tentativas |
| `EM_ATENDIMENTO` | Lead respondeu e está em conversa; perfil ainda em avaliação | `em_atendimento`, `sem_interação-qualificação` | Qualificar curso, formação, momento e financeiro |
| `QUALIFICADO` | Tem perfil e interesse real; negociação em andamento | `short_list`, `sem_interação-negociação` | Enviar proposta e conduzir negociação |
| `FECHAMENTO` | Aceitou; falta contrato ou pagamento | `pendente-contrato`, `pendente-pagamento` | Cobrar contrato ou pagamento |
| `MATRICULADO` | Conversão confirmada | `matriculado` | Passar para permanência |
| `RECUSA` | Foi acionado e disse não | tabulações `recusa-*` acordadas | Registrar motivo; reativar somente se marcado |
| `DESQUALIFICADO` | Não tem perfil para o curso | `bad_fit`, formação incompleta ou sem perfil financeiro | Não contactar |
| `ENCAMINHADO_GRADUACAO` | Entrou pela pós, mas o interesse é graduação | `interesse_graduacao` | Mover para o funil de Graduação |
| `FORA_DA_BASE` | Teste ou atendimento em outro canal | `atendimento_outro_canal`, `teste` | Nenhuma |

> **Lead considerado nos indicadores:** qualquer etapa acima, exceto `FORA_DA_BASE`. O funil principal exibe apenas as cinco etapas numeradas; recusa, desqualificação e encaminhamento aparecem como saídas/direcionamentos.

Em 25/09/2026, o campo `situacao` veio vazio nos 7.370 leads retornados pela API. Para preservar o histórico, a integração também reconhece aliases documentados de tags, ações e etapas de inscrição. Quando nenhum sinal existe, o registro entra em `NAO_LOCALIZADO`. A taxonomia apresentada ao usuário permanece única.

## Conciliação

A integração tenta ligar inscritos a leads por e-mail, telefone e CPF normalizados. Havendo mais de uma opção, prioriza o mesmo curso, datas coerentes e o registro mais recente. Uma inscrição não conciliada não é descartada.

## Campos principais de `crm_leads`

| Campo | Origem ou transformação |
|---|---|
| `contactName` | Nome do lead, contato ou inscrito |
| `email` | Lead, contato ou inscrito, nessa ordem |
| `phone` | Celular/telefone do lead, contato ou inscrito |
| `cpf` | Lead, contato ou inscrito |
| `sourceChannel` | UTM source; fallback por ação, tags e referer |
| `formName` | Ação de captação no EducaCRM |
| `utmSource`, `utmMedium`, `utmCampaign` | Primeiro valor não vazio entre lead, contato e inscrição |
| `products` | Nome do curso resolvido pelo catálogo `estrutura/cursos/` |
| `opportunityTag` | Etapa da inscrição, situação do lead ou tags |
| `status` | `aberto`, `ganho` ou `perdido` |
| `createdDate` | Data original de criação do lead em BRT; inscrição quando não conciliada |
| `updatedDate` | Atualização do lead ou evento mais recente da inscrição |
| `importedAt` | Momento do snapshot |

## Canais

| Família | Exemplos de sinal |
|---|---|
| Meta | `meta`, `facebook`, `instagram`, `fb`, `ig` |
| Google | `google`, `adwords`, `gads` |
| WhatsApp | UTM WhatsApp, ação ou tag `contato-omni` |
| Formulários | Ações com `preins`, `lead` ou `form` |
| Importação histórica | Marcador de importação histórica |
| Outros | Origem explícita não classificada |
| Desconhecido | Nenhum sinal de origem disponível |

## Datas e fuso

O corte do negócio usa `America/Sao_Paulo`. Valores de data sem offset, já produzidos pelo CRM como data local, preservam o dia informado. Timestamps com offset são convertidos para BRT antes de extrair `YYYY-MM-DD`.

## Mídia

Meta e Google vêm do Windsor.ai. O dashboard não soma leads de Meta com o subconjunto de pixel. Conversas iniciadas no WhatsApp são outra métrica. Conversões do Google preservam a definição da plataforma, inclusive valores fracionários quando retornados.

## Qualidade de dados

A cobertura de UTM deve ser medida, não inferida. Usuários não devem ser somados entre páginas diferentes do GA4. Métricas sem entrega confirmada permanecem ausentes. Resultados financeiros sem atribuição individual devem ser chamados de relação potencial, não ROAS atribuído.

## Referências

[1]: https://crm.apsyedu.com.br/swagger/ "EducaCRM API — Swagger"
