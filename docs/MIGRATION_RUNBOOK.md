# Runbook de migração do Dashboard APSY

## Resultado esperado

Ao final deste runbook, o novo ambiente terá schema aplicado, administrador inicial, integrações configuradas, snapshot do EducaCRM carregado, agendamento D-1 ativo e validações técnicas aprovadas.

## Opções de implantação

| Abordagem | Trade-offs | Custo | Complexidade de configuração |
|---|---|---|---|
| Aplicação Node gerenciada + MySQL gerenciado | Menos operação de infraestrutura; exige adaptar secrets, domínio e agendador do provedor | Conforme provedor | Baixa a média |
| Contêiner Docker + MySQL gerenciado | Portável entre provedores e próximo do ambiente local; exige gestão da imagem e releases | Conforme provedor | Média |
| Manter no runtime atual e usar GitHub como fonte de recuperação | Menor risco imediato; não testa independência completa do runtime atual | Já contratado | Baixa |

O repositório suporta as três rotas. A escolha deve considerar onde ficará o banco, como os secrets serão geridos e quem operará o agendamento.

## 1. Pré-requisitos

Antes do cutover, confirme:

- Node.js 22 e pnpm 10, ou runtime Docker;
- banco MySQL/TiDB vazio ou um banco de homologação;
- token de leitura do EducaCRM;
- chave Windsor.ai com acesso às contas oficiais;
- credenciais Publya, se o módulo estiver ativo;
- domínio HTTPS;
- mecanismo de secrets;
- agendador capaz de chamar HTTPS às 09:00 BRT.

## 2. Preparar secrets

Use a lista em [ENVIRONMENT.md](ENVIRONMENT.md). Gere valores novos para `JWT_SECRET` e `SCHEDULED_SYNC_SECRET`. Tokens fornecidos em conversas, planilhas ou tickets não devem ser reaproveitados sem rotação.

Nunca inclua valores reais em commits, logs de CI ou parâmetros de build do frontend.

## 3. Preparar o banco

```bash
pnpm install --frozen-lockfile --ignore-scripts
pnpm db:migrate
```

A migração inicial cria todas as tabelas. Em banco existente, faça backup antes de executar e valide o journal do Drizzle para evitar reaplicar um baseline sobre tabelas já criadas.

## 4. Criar o administrador

```bash
ADMIN_NAME="Administrador APSY" \
ADMIN_USERNAME="admin" \
ADMIN_PASSWORD="senha-única-com-12-ou-mais-caracteres" \
pnpm admin:create
```

O comando é idempotente: cria ou atualiza o usuário informado. A senha não aparece no código nem em arquivo versionado.

## 5. Carregar dados auxiliares

O snapshot histórico de programática incluído no projeto é opcional:

```bash
pnpm seed:programmatic
```

O comando não cria usuários e não insere leads fictícios.

## 6. Executar a carga inicial do CRM

Se houver dados no banco de destino, salve uma cópia primeiro:

```bash
pnpm exec tsx scripts/backup_crm_before_educacrm.ts
```

Depois execute:

```bash
pnpm crm:sync
pnpm crm:audit
```

Os relatórios são gravados em `artifacts/`, ou no diretório definido por `AUDIT_OUTPUT_DIR`. Esse diretório pode conter dados pessoais e não deve ser commitado.

## 7. Critérios de aceite do CRM

A carga só deve ser aceita quando:

1. o número persistido é igual ao número normalizado;
2. `externalId` é distinto em todos os registros;
3. todas as IDs começam com `educacrm-lead:` ou `educacrm-inscrito:`;
4. existe apenas um conjunto coerente de MQL, SAL, SQL, MATRICULADO e OUTROS;
5. a primeira e a última data estão dentro do período esperado;
6. o total do dia corrente ou D-1 bate com uma consulta independente à fonte;
7. a contagem de matrículas é conciliada com `ingresso/inscritos/`.

Consulte a fotografia de referência em [MIGRATION_VALIDATION.md](MIGRATION_VALIDATION.md).

## 8. Validar o código

```bash
pnpm validate
```

Com credenciais reais disponíveis em ambiente seguro:

```bash
pnpm test:integration
```

Os testes reais não rodam no CI padrão para evitar dependência de disponibilidade externa e exposição de secrets.

## 9. Implantar

### Node gerenciado

```bash
pnpm install --frozen-lockfile --ignore-scripts
pnpm build
pnpm start
```

### Docker

```bash
docker build -t dashboard-apsy:release .
docker run --rm -p 3000:3000 --env-file /caminho/seguro/runtime.env dashboard-apsy:release
```

O processo deve receber tráfego HTTPS por um proxy ou serviço gerenciado.

## 10. Configurar o agendamento

Agende uma chamada diária às **09:00 no fuso `America/Sao_Paulo`**:

```bash
curl --fail --show-error --silent \
  -X POST \
  -H "Authorization: Bearer $SCHEDULED_SYNC_SECRET" \
  https://SEU_DOMINIO/api/scheduled/sync-data
```

O retorno deve ter `ok: true`, `source: "EducaCRM"` e o período até D-1.

## 11. Cutover

A ordem recomendada é:

1. congelar alterações de infraestrutura no ambiente antigo;
2. executar backup final;
3. migrar o banco ou criar o banco novo;
4. carregar EducaCRM e validar totais;
5. validar login e permissões;
6. validar Meta, Google, Programática e Leads;
7. habilitar domínio e HTTPS;
8. habilitar o agendamento;
9. observar a primeira execução automática;
10. manter o ambiente antigo sem escrita durante a janela de rollback.

## 12. Rollback

Faça rollback se houver carga parcial, quebra de autenticação, divergência não explicada de etapas ou indisponibilidade recorrente.

1. desabilite o agendamento novo;
2. reverta a aplicação para a release anterior;
3. restaure o backup do banco;
4. valide contagens, login e fontes;
5. registre o incidente e a causa antes de uma nova tentativa.

O script de CRM substitui a tabela em transação, mas um backup externo continua obrigatório para migrações de infraestrutura.

## Referências

[1]: https://crm.apsyedu.com.br/swagger/ "EducaCRM API — Swagger"
[2]: https://orm.drizzle.team/docs/migrations "Drizzle ORM — Migrations"
[3]: https://docs.docker.com/build/ "Docker Build documentation"
