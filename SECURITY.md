# Segurança

## Escopo

O Dashboard APSY processa dados pessoais de candidatos, credenciais de APIs e métricas comerciais. O repositório é interno e deve permanecer privado.

## Comunicação de vulnerabilidades

Não abra uma issue pública com tokens, dados pessoais, URLs assinadas, evidências de banco ou detalhes exploráveis. Comunique o responsável pelo repositório em canal privado e inclua impacto, passos de reprodução e versão afetada.

## Secrets

Credenciais devem ficar no cofre de secrets do provedor. O código lê valores por variáveis de ambiente. O GitHub Actions padrão não usa credenciais reais e não executa testes de integração externos.

Se uma credencial for exposta em conversa, log, commit ou artefato, revogue-a, gere outra e audite os acessos. Remover apenas o texto do branch atual não invalida o segredo.

## Dados pessoais

Não versione CSVs, planilhas, backups ou JSONs com nomes, e-mails, telefones, CPFs ou endereços. Os diretórios `artifacts/`, `backups/`, `entregas/` e `exports/` são ignorados. Artefatos de migração devem ser armazenados com criptografia, acesso mínimo e retenção definida pela APSY.

## Autenticação

A aplicação armazena senhas com `scrypt` e sal aleatório. Sessões locais usam JWT em cookie `HttpOnly`. `JWT_SECRET` é obrigatório em produção. Não existe usuário ou senha padrão no código.

O endpoint agendado exige uma sessão Heartbeat válida ou `Authorization: Bearer <SCHEDULED_SYNC_SECRET>`.

## Dependências e mudanças

Pull requests devem manter o CI verde. Dependências novas exigem justificativa e revisão de licença. Mudanças nas permissões, autenticação, persistência do CRM ou tratamento de dados pessoais exigem revisão adicional.

## Checklist antes de publicar uma release

- busca por secrets e dados pessoais sem ocorrências;
- typecheck, testes determinísticos e build aprovados;
- migrações revisadas;
- secrets do ambiente configurados e rotacionados quando necessário;
- primeiro administrador criado com senha única;
- HTTPS habilitado;
- backup e rollback testados;
- endpoint agendado protegido.

## Referências

[1]: https://docs.github.com/en/code-security/getting-started/adding-a-security-policy-to-your-repository "GitHub — Adding a security policy"
[2]: https://owasp.org/www-project-application-security-verification-standard/ "OWASP Application Security Verification Standard"
