# Teste local de resiliência da API

Este ambiente executa três réplicas da API atrás de um Nginx. PostgreSQL e Redis
são compartilhados entre as réplicas. O Compose normal continua sendo a base;
`compose.resilience.yaml` contém apenas as diferenças do experimento.

## Preparação

Crie o arquivo local de variáveis, que não deve ser commitado:

```powershell
Copy-Item .env.resilience.example .env.resilience
```

Preencha `TEST_EMAIL` e `TEST_PASSWORD` com uma conta exclusiva de testes. Os
demais valores do ambiente local continuam vindo de `.env` e do Compose base.

## Subir três instâncias

```powershell
docker compose --env-file .env.resilience -f compose.yaml -f compose.resilience.yaml up -d --build --scale api=3
```

A API fica disponível somente pelo balanceador em `http://localhost:3000` (ou na
porta configurada em `RESILIENCE_API_PORT`). Confira as réplicas:

PostgreSQL, Redis e pgAdmin permanecem somente nas redes internas deste ambiente,
evitando conflito com as portas do Compose de desenvolvimento já em execução.

```powershell
docker compose --env-file .env.resilience -f compose.yaml -f compose.resilience.yaml ps
```

Prepare a conta de líder no banco isolado do laboratório:

```powershell
docker compose --env-file .env.resilience -f compose.yaml -f compose.resilience.yaml --profile setup run --rm seed-test-user
```

O comando é idempotente e usa somente as credenciais definidas em
`.env.resilience`.

## Iniciar carga autenticada

Em um terminal separado:

```powershell
docker compose --env-file .env.resilience -f compose.yaml -f compose.resilience.yaml --profile load-test run --rm --no-deps --service-ports load-test
```

Abra `http://localhost:5665` enquanto o teste estiver rodando. O dashboard mostra
requisições, checks, falhas e percentis de latência em tempo real. A porta pode ser
alterada por `K6_DASHBOARD_PORT` em `.env.resilience`.

Ao final, o relatório HTML é gravado em:

```text
infra/resilience/results/k6-resilience-report.html
```

Enquanto o k6 estiver executando, abra outro terminal e derrube uma única API:

```powershell
.\infra\resilience\stop-one-api.ps1
```

O resultado esperado é taxa de falha inferior a 1%, sessão preservada e retorno
da réplica interrompida pelo `restart: unless-stopped`. Consulte o balanceador:

```powershell
docker compose --env-file .env.resilience -f compose.yaml -f compose.resilience.yaml logs -f load-balancer api
```

O teste usa somente leituras autenticadas. Não repita automaticamente `POST`,
`PATCH` ou `DELETE`: mutações precisam de idempotência explícita antes de um teste
que permita repetição pelo balanceador.

## Encerrar

```powershell
docker compose --env-file .env.resilience -f compose.yaml -f compose.resilience.yaml down
```

Os volumes do PostgreSQL e Redis não são removidos por esse comando.
