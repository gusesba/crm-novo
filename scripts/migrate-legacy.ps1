param(
    [Parameter(Mandatory = $true)][string]$Backup,
    [Parameter(Mandatory = $true)][string]$OutputDirectory,
    [switch]$AuditOnly,
    [switch]$AllowPending
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$backupPath = (Resolve-Path -LiteralPath $Backup).Path
$resultPath = [IO.Path]::GetFullPath($OutputDirectory)
if (Test-Path -LiteralPath $resultPath) { throw 'Use uma pasta de saída nova; execuções anteriores são preservadas.' }
New-Item -ItemType Directory -Path $resultPath | Out-Null
$containerName = 'crm-legacy-migration-' + [Guid]::NewGuid().ToString('N')
$created = $false

function Check-Exit([string]$Step) {
    if ($LASTEXITCODE -ne 0) { throw "Falha em $Step (código $LASTEXITCODE)." }
}

try {
    # PostgreSQL 17 reads this archive format (pg_dump 18, source server 16).
    # No host ports or external network: only docker exec accesses this disposable restore.
    & docker run --rm -d --name $containerName --network none -e POSTGRES_HOST_AUTH_METHOD=trust -e POSTGRES_DB=legacy_audit postgres:17-bookworm | Out-Null
    Check-Exit 'criação do PostgreSQL isolado'
    $created = $true
    $ready = $false
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        # The image briefly accepts connections during bootstrap, then restarts PostgreSQL.
        $processName = & docker exec $containerName cat /proc/1/comm 2>$null
        if ($processName -eq 'postgres') {
            & docker exec $containerName pg_isready -U postgres -d legacy_audit *> $null
            if ($LASTEXITCODE -eq 0) { $ready = $true; break }
        }
        Start-Sleep -Seconds 1
    }
    if (!$ready) { throw 'PostgreSQL isolado não ficou pronto.' }
    & docker cp $backupPath "${containerName}:/tmp/source.backup"
    Check-Exit 'cópia do backup'
    & docker exec $containerName pg_restore -U postgres -d legacy_audit --no-owner --no-privileges --single-transaction /tmp/source.backup
    Check-Exit 'restauração completa'
    & docker cp (Join-Path $PSScriptRoot 'export-legacy.sql') "${containerName}:/tmp/export.sql"
    Check-Exit 'cópia da consulta de exportação'
    & docker exec $containerName psql -X -q -A -t -U postgres -d legacy_audit -v ON_ERROR_STOP=1 -f /tmp/export.sql -o /tmp/source.json
    Check-Exit 'exportação consistente das seis áreas'
    & docker cp "${containerName}:/tmp/source.json" (Join-Path $resultPath 'source.json')
    Check-Exit 'cópia do snapshot local'
    @{
        backup = $backupPath
        bytes = (Get-Item -LiteralPath $backupPath).Length
        sha256 = (Get-FileHash -LiteralPath $backupPath -Algorithm SHA256).Hash
        restoredAtUtc = [DateTime]::UtcNow.ToString('O')
        restoreImage = 'postgres:17-bookworm'
        sourceContainsPasswordHashes = $true
    } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $resultPath 'backup-manifest.json') -Encoding utf8

    $buildPath = (Join-Path $resultPath 'build').Replace('\', '/') + '/'
    & dotnet build (Join-Path $projectRoot 'tools/LegacyMigration/LegacyMigration.csproj') "-p:BaseOutputPath=$buildPath"
    Check-Exit 'compilação do importador'
    $mode = if ($AuditOnly) { 'audit' } else { 'import' }
    $cliArguments = @((Join-Path $buildPath 'Debug/net10.0/LegacyMigration.dll'), $mode,
        '--source', (Join-Path $resultPath 'source.json'), '--report', (Join-Path $resultPath 'report.json'))
    if (!$AuditOnly) { $cliArguments += @('--output', (Join-Path $resultPath 'crm.db')) }
    if ($AllowPending) { $cliArguments += '--allow-pending' }
    & dotnet @cliArguments
    Check-Exit 'auditoria/importação (consulte report.json e report.json.pending.json)'
    Write-Host "Resultado em $resultPath. O banco em uso não foi substituído."
}
finally {
    if ($created) { & docker stop $containerName | Out-Null }
}
