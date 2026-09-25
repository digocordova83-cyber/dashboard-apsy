# Padrão único de etapas do CRM

**Vigência:** 25/09/2026

**Fonte oficial:** EducaCRM

Este documento define a classificação usada na aba Leads, na visão geral, nos filtros, exportações, auditorias e rotinas de sincronização.

## Etapas

| Ordem | Etapa canônica | Rótulo | Definição | Tabulações oficiais | Próxima ação |
|---:|---|---|---|---|---|
| 1 | `NAO_LOCALIZADO` | Não Localizado | Comercial tentou contato e não teve resposta | `não_localizado` | Seguir cadência de tentativas |
| 2 | `EM_ATENDIMENTO` | Em Atendimento | Lead respondeu e está conversando; perfil ainda em avaliação | `em_atendimento`, `sem_interação-qualificação` | Qualificar curso, formação, momento e financeiro |
| 3 | `QUALIFICADO` | Qualificado | Tem perfil e interesse real; negociação em andamento | `short_list`, `sem_interação-negociação` | Enviar proposta e conduzir negociação |
| 4 | `FECHAMENTO` | Fechamento | Aceitou; falta contrato ou pagamento | `pendente-contrato`, `pendente-pagamento` | Cobrar contrato ou pagamento |
| 5 | `MATRICULADO` | Matriculado | Conversão confirmada | `matriculado` | Passar para permanência |
| — | `RECUSA` | Recusa | Foi acionado e disse não; não entra em Qualificado | `recusa-sem_interesse`, `recusa_curso_de_interesse`, `recusa-datas-disponibilidade`, `recusa-financeira`, `recusa-localização`, `recusa-outra_ies`, `recusa_proximo_semestre` | Registrar motivo; reativar somente se marcado |
| — | `DESQUALIFICADO` | Desqualificado | Não tem perfil para o curso | `bad_fit`, `recusa_formação_incompleta`, `recusa_sem_perfil_financeiro` | Não contactar |
| — | `ENCAMINHADO_GRADUACAO` | Encaminhado p/ Graduação | Entrou pela pós, mas o interesse é graduação | `interesse_graduacao` | Mover para o funil de Graduação |
| — | `FORA_DA_BASE` | Fora da Base | Teste ou atendimento feito em outro canal | `atendimento_outro_canal`, `teste` | Nenhuma |

## Regras de contagem

- **Lead considerado:** qualquer registro em uma etapa canônica diferente de `FORA_DA_BASE`.
- **Funil principal:** somente as cinco etapas numeradas.
- **Saídas e direcionamentos:** Recusa, Desqualificado e Encaminhado p/ Graduação aparecem separadamente.
- **Fora da Base:** permanece consultável no filtro, mas não entra nos KPIs.
- As etapas representam o estado atual do registro; os percentuais não devem ser interpretados como coortes sequenciais sem identificação individual.

## Compatibilidade com o histórico

Na auditoria de 25/09/2026, o campo `situacao` veio vazio nos 7.370 leads retornados pela API. Para não perder a leitura retroativa, `shared/crmFunnel.ts` aceita aliases existentes de tags, ações e etapas de inscrição, por exemplo:

- `hubspot-2026-05-11`, `preins-posgrad` e formulários sem interação → Não Localizado;
- `contato-omni`, atividade Omni/HSM e `material_enviado` → Em Atendimento;
- `aprovado`, `emnegociacao` e `oferta-base` → Qualificado;
- `pre-matriculado`, `inscrito-pago` e `aguardandodocumentac` → Fechamento;
- códigos de desistência e recusa → Recusa;
- `badfit`, sem perfil financeiro ou formação incompatível → Desqualificado;
- sinais de graduação → Encaminhado p/ Graduação;
- `teste` → Fora da Base.

A prioridade é: Fora da Base; Matriculado; saídas/direcionamentos; Fechamento; Qualificado; Em Atendimento; Não Localizado.

## Governança

Qualquer alteração de etapa ou tabulação exige atualização conjunta de:

1. `shared/crmFunnel.ts`;
2. testes unitários;
3. `docs/DATA_DICTIONARY.md`;
4. auditoria do EducaCRM;
5. validação visual da aba Leads e da visão geral.
