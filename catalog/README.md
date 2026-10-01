# Catálogo JSON de músicas

Este diretório recebe lotes autorizados de músicas. O arquivo JSON não deve ser
preenchido copiando letras ou cifras de sites públicos sem autorização.

O catálogo aceita duas modalidades:

- `INTERNAL` (padrão): guarda letra e cifra integrais. Exige direitos aprovados
  para a mesma versão e todas as permissões de armazenamento, letra, cifra e
  transposição. Os tipos aceitos são `PUBLIC_DOMAIN`, `CC0`, `CC_BY` e
  `CC_BY_SA`.
- `EXTERNAL_EMBED`: guarda somente metadados, tom, atribuição e URL HTTPS de uma
  fonte permitida. A letra e a cifra permanecem hospedadas na fonte original e
  a tela sempre oferece um link para abri-la diretamente caso o iframe seja
  bloqueado pelo provedor.

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
