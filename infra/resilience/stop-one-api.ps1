[CmdletBinding()]
param(
  [switch]$Force
)

$ErrorActionPreference = 'Stop'
$composeFiles = @('-f', 'compose.yaml', '-f', 'compose.resilience.yaml')
$containers = @(docker compose @composeFiles ps --status running --format json api | ConvertFrom-Json)

if ($containers.Count -lt 2) {
  throw "O teste exige ao menos duas instâncias da API em execução. Encontradas: $($containers.Count)."
}

$target = $containers | Sort-Object Name | Select-Object -First 1
Write-Host "Instância selecionada: $($target.Name)"

if (-not $Force) {
  $confirmation = Read-Host "Digite DERRUBAR para interromper somente esta instância"
  if ($confirmation -ne 'DERRUBAR') {
    Write-Host 'Operação cancelada.'
    exit 0
  }
}

docker kill $target.Name
if ($LASTEXITCODE -ne 0) {
  throw "Não foi possível interromper $($target.Name)."
}

Write-Host "Instância $($target.Name) interrompida. O restart policy deverá recriá-la."

