# ADR 0001 — EducaCRM como fonte oficial do funil

**Status:** aceito

**Data:** 21/09/2026

## Contexto

O Dashboard APSY consumia oportunidades do Cirqua. A operação passou a usar o EducaCRM, que expõe leads, contatos, inscritos, cursos e situações por API autenticada. Manter as duas fontes em produção criaria dupla contagem, divergência de etapas e dúvidas sobre qual fotografia prevalece.

## Decisão

O EducaCRM passa a ser a única fonte produtiva do CRM no dashboard. O cliente Cirqua e suas credenciais foram removidos do fluxo ativo. O snapshot anterior foi preservado apenas como backup de rollback fora do Git.

Como o EducaCRM não fornece MQL, SAL e SQL em um campo único, a aplicação normaliza o funil de forma determinística:

- lead captado sem atividade: MQL;
- contato com atividade Omni/HSM: SAL;
- lead associado a inscrição: SQL;
- inscrição ativa: MATRICULADO;
- teste: OUTROS.

A sincronização é integral, D-1 em BRT no ciclo diário e transacional no banco.

## Consequências

A aplicação fica alinhada ao CRM vigente e deixa de misturar históricos incompatíveis. Em contrapartida, a contagem de matrículas e a cobertura de UTM dependem do preenchimento atual do EducaCRM. Mudanças no modelo de qualificação exigem acordo de negócio e atualização deste ADR ou um novo registro de decisão.

## Alternativas consideradas

Manter Cirqua como fallback de dados foi rejeitado porque mascararia divergências. Combinar linhas das duas fontes foi rejeitado por falta de chave global e equivalência de etapas. Migrar apenas novos leads foi rejeitado porque mudanças retroativas de status deixariam o histórico inconsistente.

## Referências

[1]: https://crm.apsyedu.com.br/swagger/ "EducaCRM API — Swagger"
