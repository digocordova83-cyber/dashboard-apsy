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

O EducaCRM não entrega MQL, SAL e SQL como um único campo pronto. O dashboard aplica as regras abaixo na ordem apresentada.

| Etapa | Critério |
|---|---|
| `OUTROS` | Lead marcado explicitamente como teste |
| `MATRICULADO` | Inscrição sem cancelamento e com etapa `matriculado`, data de efetivação ou matrícula acadêmica |
| `SQL` | Lead conciliado a um registro em `ingresso/inscritos/`, sem critério de matrícula ativa |
| `SAL` | Contato com última atividade Omni, último HSM ou ação `contato-omni` |
| `MQL` | Lead captado sem os sinais acima |

> **Oportunidade válida:** qualquer linha com `opportunityStage` preenchida e diferente de `OUTROS`.

A regra é operacional e auditável. Ela não deve ser apresentada como um campo nativo do EducaCRM.

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
