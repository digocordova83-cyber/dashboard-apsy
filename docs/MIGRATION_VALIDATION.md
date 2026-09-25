# Validação da migração para o EducaCRM

## Baseline de 21/09/2026

A carga de corte foi executada em **21/09/2026 às 17:30 BRT**. O snapshot persistido e a auditoria independente produziram os totais abaixo.

> Esta tabela preserva a classificação usada no corte técnico de 21/09. Em 25/09/2026, o dashboard passou a usar a taxonomia comercial única documentada em `DATA_DICTIONARY.md`; os números atuais não devem ser comparados etapa a etapa com MQL/SAL/SQL.

| Indicador | Total |
|---|---:|
| Leads brutos da API | 7.221 |
| Contatos da API | 7.066 |
| Inscritos da API | 248 |
| Registros persistidos | 7.225 |
| Oportunidades válidas | 7.224 |
| MQL | 4.456 |
| SAL | 2.520 |
| SQL | 231 |
| Matriculados | 17 |
| OUTROS | 1 |
| Registros com alguma UTM | 134 |
| Cobertura de UTM | 1,9% |

A diferença entre 7.221 leads brutos e 7.225 linhas normalizadas decorre de quatro inscrições preservadas sem lead conciliável. Todos os 7.225 `externalId` eram distintos e usavam o prefixo EducaCRM.

## Reconciliação com a fonte anterior

Antes do cutover, o snapshot Cirqua tinha 6.134 registros, 5.319 oportunidades válidas, 2.268 MQL, 2.489 SAL, 505 SQL e 57 matrículas. Esses números foram preservados em backup, mas **não foram combinados** com a nova fonte.

A redução de matrículas para 17 não foi tratada como perda de dados silenciosa. Ela reflete os sinais disponíveis no endpoint `ingresso/inscritos/` do EducaCRM no momento do corte: 17 etapas `matriculado`, 15 datas de pagamento e 15 datas de efetivação. A APSY deve conciliar no CRM qualquer matrícula histórica que ainda não esteja representada.

## Validações técnicas executadas

- TypeScript sem erros.
- Nove arquivos de teste aprovados.
- Vinte testes Vitest aprovados no ambiente com integrações.
- Snapshot transacional validado.
- IDs externos distintos validados.
- Origem EducaCRM validada em 100% das linhas persistidas.
- Primeira data `2026-05-14` e última data `2026-09-21`.
- Vinte e um registros criados no dia do corte.

## Critérios para aceitar uma nova migração

Uma migração futura deve produzir um relatório equivalente e explicar qualquer variação material. Nunca compare apenas o total bruto: compare período, etapas, inscrições não conciliadas, UTMs e regra de oportunidade válida.

## Reclassificação para a taxonomia comercial — 25/09/2026

A carga D-1 foi executada até **24/09/2026** com a definição única de etapas. O banco ficou com 7.360 registros e 7.360 IDs externos distintos.

| Etapa | Total |
|---|---:|
| Não Localizado | 4.182 |
| Em Atendimento | 2.650 |
| Qualificado | 206 |
| Fechamento | 0 |
| Matriculado | 17 |
| Recusa | 0 |
| Desqualificado | 0 |
| Encaminhado p/ Graduação | 304 |
| Fora da Base | 1 |

Os zeros em Fechamento, Recusa e Desqualificado refletem a ausência dessas tabulações no histórico retornado pelo CRM no momento da carga; não devem ser interpretados automaticamente como ausência operacional. A classificação será preenchida conforme o EducaCRM passar a registrar os novos códigos.

## Evidências locais

Os scripts `crm:sync` e `crm:audit` geram JSON e Markdown em `artifacts/`. Esses arquivos contêm dados operacionais ou pessoais e não são versionados. A equipe deve armazenar as evidências do cutover em repositório documental seguro.

## Referências

[1]: https://crm.apsyedu.com.br/swagger/ "EducaCRM API — Swagger"
