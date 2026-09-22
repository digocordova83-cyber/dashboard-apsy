# Contribuindo com o Dashboard APSY

## Fluxo de trabalho

Crie um branch a partir de `main`, implemente uma mudança de escopo único e abra um pull request. Não faça push direto para `main` depois que a proteção do branch estiver ativa.

Use nomes descritivos, como `feat/filtro-curso`, `fix/corte-brt` ou `docs/runbook-deploy`.

## Antes do pull request

```bash
pnpm install --frozen-lockfile --ignore-scripts
pnpm validate
```

Quando a mudança afeta integrações e os secrets estão disponíveis em ambiente seguro:

```bash
pnpm test:integration
```

## Banco de dados

Altere `drizzle/schema.ts`, execute `pnpm db:generate` e revise o SQL gerado. Nunca ajuste produção manualmente sem registrar uma migração equivalente. Operações destrutivas exigem backup e plano de rollback.

## Regras de dados

Não invente métricas ausentes. Preserve o fuso de Brasília nos cortes do negócio. Não misture programática com Meta/Google sem fonte compatível. Mudanças no funil do EducaCRM exigem atualização de `docs/DATA_DICTIONARY.md` e nova validação dos totais.

## Segurança

Não inclua secrets, dados pessoais, arquivos de exportação ou backups. Consulte `SECURITY.md`. Se o pull request altera autenticação, autorização, CRM ou agendamento, descreva riscos e controles no template.

## Commits

Prefira mensagens no formato:

```text
feat: adiciona filtro de curso no funil
fix: corrige corte D-1 em BRT
docs: atualiza runbook de migração
chore: atualiza pipeline de CI
```

## Revisão

O pull request deve explicar o problema, a solução, a validação executada, o impacto em dados e o rollback. Inclua imagens somente quando houver mudança visual e remova qualquer dado pessoal antes do upload.

## Referências

[1]: https://docs.github.com/en/pull-requests/collaborating-with-pull-requests "GitHub — Collaborating with pull requests"
