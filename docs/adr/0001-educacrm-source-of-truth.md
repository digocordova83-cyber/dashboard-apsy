# ADR 0001 — EducaCRM como fonte oficial do funil

**Status:** aceito

**Data:** 21/09/2026

## Contexto

O Dashboard APSY consumia oportunidades do Cirqua. A operação passou a usar o EducaCRM, que expõe leads, contatos, inscritos, cursos e situações por API autenticada. Manter as duas fontes em produção criaria dupla contagem, divergência de etapas e dúvidas sobre qual fotografia prevalece.

## Decisão

O EducaCRM passa a ser a única fonte produtiva do CRM no dashboard. O cliente Cirqua e suas credenciais foram removidos do fluxo ativo. O snapshot anterior foi preservado apenas como backup de rollback fora do Git.

Desde 25/09/2026, a aplicação usa uma definição única, acordada com o comercial, em todos os relatórios:

- Não Localizado;
- Em Atendimento;
- Qualificado;
- Fechamento;
- Matriculado;
- Recusa;
- Desqualificado;
- Encaminhado para Graduação;
- Fora da Base.

As tabulações oficiais são a primeira fonte de classificação. Enquanto o campo `situacao` não estiver preenchido no histórico da API, aliases documentados de tags, ações e etapas de inscrição preservam a série anterior. Registros sem qualquer sinal entram em Não Localizado. Testes e atendimentos realizados em outro canal ficam em Fora da Base e não entram nos indicadores.

A sincronização é integral, D-1 em BRT no ciclo diário e transacional no banco.

## Consequências

A aplicação fica alinhada ao CRM vigente e deixa de misturar históricos incompatíveis. Em contrapartida, a contagem de matrículas e a cobertura de UTM dependem do preenchimento atual do EducaCRM. Mudanças no modelo de qualificação exigem acordo de negócio e atualização deste ADR ou um novo registro de decisão.

## Alternativas consideradas

Manter Cirqua como fallback de dados foi rejeitado porque mascararia divergências. Combinar linhas das duas fontes foi rejeitado por falta de chave global e equivalência de etapas. Migrar apenas novos leads foi rejeitado porque mudanças retroativas de status deixariam o histórico inconsistente.

## Referências

[1]: https://crm.apsyedu.com.br/swagger/ "EducaCRM API — Swagger"
