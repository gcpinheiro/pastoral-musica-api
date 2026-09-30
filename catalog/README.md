# Catálogo JSON de músicas

Este diretório recebe lotes autorizados de músicas. O arquivo JSON não deve ser
preenchido copiando letras ou cifras de sites públicos sem autorização.

Cada item precisa conter letra, cifra e registro de direitos para a mesma versão.
O importador só publica itens com `rights.status = "APPROVED"` e com todas as
permissões de armazenamento, letra, cifra e transposição marcadas como `true`.

Validar o lote:

```powershell
npm run catalog:validate -- --file .\catalog\songs.catalog.json
```

Importar para uma paróquia após a revisão jurídica/editorial:

```powershell
npm run catalog:import -- --file .\catalog\songs.catalog.json --parish-id UUID_DA_PAROQUIA
```

O importador calcula um hash do conteúdo, evita duplicatas por paróquia e pode ser
executado novamente com segurança. A fonte e a prova da licença permanecem
registradas no banco para auditoria.

Relatório de cobertura por etapa:

```powershell
npm run catalog:report -- --parish-id UUID_DA_PAROQUIA
```
