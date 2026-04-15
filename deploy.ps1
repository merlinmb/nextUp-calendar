#Requires -Version 5.1
<#
.SYNOPSIS
    Deploy nextUp Calendar to a Homebridge Docker host over SSH.

.DESCRIPTION
    Connects to the target host via SSH, clones or updates the repository,
    writes an .env file if one does not already exist, then builds and
    starts the container with Docker Compose.

.PARAMETER Host
    Hostname or IP address of the Homebridge server. Default: homebridge.local

.PARAMETER User
    SSH username on the remote host. Default: pi

.PARAMETER SshKey
    Path to the SSH private key file. Omit to use your system's SSH agent / default key.

.PARAMETER RemoteDir
    Absolute path on the remote host where the app will be deployed.
    Default: /opt/nextup-calendar

.PARAMETER AppUrl
    Public URL of the app, used to build OAuth callback URIs.
    Default: http://<Host>:3050

.PARAMETER Port
    Host port to expose the app on. Default: 3050

.PARAMETER Rebuild
    Force a Docker image rebuild with --no-cache.

.PARAMETER Branch
    Git branch to check out on the remote host. Default: main

.EXAMPLE
    .\deploy.ps1

.EXAMPLE
    .\deploy.ps1 -Host 192.168.1.50 -User ubuntu -Rebuild

.EXAMPLE
    .\deploy.ps1 -SshKey ~/.ssh/homebridge_rsa -Branch main
#>

[CmdletBinding()]
param(
    [string] $Host      = 'homebridge.local',
    [string] $User      = 'pi',
    [string] $SshKey    = '',
    [string] $RemoteDir = '/opt/nextup-calendar',
    [string] $AppUrl    = '',
    [int]    $Port      = 3050,
    [switch] $Rebuild,
    [string] $Branch    = 'main'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ── Colour helpers ────────────────────────────────────────────
function Write-Step  { param([string]$msg) Write-Host "  → $msg" -ForegroundColor Cyan }
function Write-Ok    { param([string]$msg) Write-Host "  ✓ $msg" -ForegroundColor Green }
function Write-Warn  { param([string]$msg) Write-Host "  ⚠ $msg" -ForegroundColor Yellow }
function Write-Fail  { param([string]$msg) Write-Host "  ✗ $msg" -ForegroundColor Red }

function Write-Banner {
    Write-Host ""
    Write-Host "  ┌──────────────────────────────────────┐" -ForegroundColor DarkCyan
    Write-Host "  │      nextUp Calendar — deploy        │" -ForegroundColor DarkCyan
    Write-Host "  └──────────────────────────────────────┘" -ForegroundColor DarkCyan
    Write-Host ""
}

# ── SSH helper ─────────────────────────────────────────────────
# Returns an array of ssh arguments (key flag inserted when -SshKey given)
function Get-SshArgs {
    $args = @('-o', 'StrictHostKeyChecking=accept-new',
              '-o', 'ConnectTimeout=10')
    if ($SshKey -ne '') {
        $resolved = (Resolve-Path $SshKey -ErrorAction SilentlyContinue)?.Path
        if (-not $resolved) { throw "SSH key not found: $SshKey" }
        $args += @('-i', $resolved)
    }
    return $args
}

# Run a command on the remote host; throw on non-zero exit
function Invoke-Remote {
    param([string]$Command, [switch]$AllowFail)
    $sshArgs = Get-SshArgs
    $target  = "${User}@${Host}"
    $result  = & ssh @sshArgs $target $Command 2>&1
    if ($LASTEXITCODE -ne 0 -and -not $AllowFail) {
        Write-Fail "Remote command failed (exit $LASTEXITCODE):"
        Write-Host $result -ForegroundColor DarkRed
        throw "Remote command failed: $Command"
    }
    return $result
}

# Copy a local file to the remote host
function Copy-ToRemote {
    param([string]$LocalPath, [string]$RemotePath)
    $sshArgs = Get-SshArgs
    $target  = "${User}@${Host}:${RemotePath}"
    & scp @sshArgs $LocalPath $target | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "scp failed: $LocalPath → $RemotePath" }
}

# ── Pre-flight checks ─────────────────────────────────────────
function Test-Prerequisites {
    Write-Step "Checking prerequisites…"

    # ssh
    if (-not (Get-Command ssh -ErrorAction SilentlyContinue)) {
        throw "ssh is not available. Install OpenSSH (Settings → Optional Features → OpenSSH Client) or Git for Windows."
    }

    # scp
    if (-not (Get-Command scp -ErrorAction SilentlyContinue)) {
        throw "scp is not available. Install OpenSSH or Git for Windows."
    }

    Write-Ok "ssh and scp found"
}

# ── Connectivity test ─────────────────────────────────────────
function Test-Connection {
    Write-Step "Testing SSH connection to ${User}@${Host}…"
    try {
        $out = Invoke-Remote "echo ok"
        if ($out -match 'ok') { Write-Ok "Connected" }
        else { throw "Unexpected response" }
    } catch {
        Write-Fail "Cannot connect to ${User}@${Host}"
        Write-Host "  Ensure SSH is enabled on your Homebridge host and the user account exists." -ForegroundColor DarkGray
        throw
    }
}

# ── Remote checks ─────────────────────────────────────────────
function Test-RemoteTools {
    Write-Step "Checking remote tools (docker, git)…"

    $missing = @()

    $dockerCheck = Invoke-Remote "which docker 2>/dev/null && docker --version" -AllowFail
    if ($LASTEXITCODE -ne 0) { $missing += 'docker' }
    else { Write-Ok "docker: $($dockerCheck | Select-Object -Last 1)" }

    $gitCheck = Invoke-Remote "which git 2>/dev/null && git --version" -AllowFail
    if ($LASTEXITCODE -ne 0) { $missing += 'git' }
    else { Write-Ok "git: $($gitCheck | Select-Object -Last 1)" }

    # docker compose (v2 plugin or standalone)
    $composeCheck = Invoke-Remote "docker compose version 2>/dev/null || docker-compose --version 2>/dev/null" -AllowFail
    if ($LASTEXITCODE -ne 0) { $missing += 'docker-compose' }
    else { Write-Ok "compose: $($composeCheck | Select-Object -Last 1)" }

    if ($missing.Count -gt 0) {
        throw "Missing remote tools: $($missing -join ', '). Install them on the Homebridge host first."
    }
}

# ── Resolve compose command ────────────────────────────────────
function Get-ComposeCmd {
    $v2 = Invoke-Remote "docker compose version 2>/dev/null && echo yes || echo no" -AllowFail
    if ($v2 -match 'yes') { return 'docker compose' }
    return 'docker-compose'
}

# ── Clone or update repo ───────────────────────────────────────
function Sync-Repository {
    Write-Step "Syncing repository to ${RemoteDir}…"

    $repoUrl = 'https://github.com/merlinmb/nextUp-calendar.git'

    # Create parent directory
    Invoke-Remote "sudo mkdir -p $(Split-Path $RemoteDir -Parent) && sudo chown ${User}:${User} $(Split-Path $RemoteDir -Parent)" -AllowFail | Out-Null

    $exists = Invoke-Remote "test -d '${RemoteDir}/.git' && echo yes || echo no"
    if ($exists -match 'yes') {
        Write-Step "Repository exists — pulling latest ${Branch}…"
        Invoke-Remote "cd '${RemoteDir}' && git fetch origin && git checkout '${Branch}' && git reset --hard origin/${Branch}"
        Write-Ok "Repository updated"
    } else {
        Write-Step "Cloning repository…"
        Invoke-Remote "git clone --branch '${Branch}' '${repoUrl}' '${RemoteDir}'"
        Write-Ok "Repository cloned"
    }
}

# ── Write .env ─────────────────────────────────────────────────
function Write-EnvFile {
    Write-Step "Checking .env on remote…"

    $envExists = Invoke-Remote "test -f '${RemoteDir}/.env' && echo yes || echo no"
    if ($envExists -match 'yes') {
        Write-Ok ".env already exists — leaving it unchanged"
        return
    }

    Write-Step "Creating .env…"

    $resolvedAppUrl = if ($AppUrl -ne '') { $AppUrl } else { "http://${Host}:${Port}" }

    # Generate a random session secret locally
    $secret = -join ((1..48) | ForEach-Object { '{0:x2}' -f (Get-Random -Max 256) })

    $envContent = @"
NODE_ENV=production
PORT=${Port}
APP_URL=${resolvedAppUrl}
SESSION_SECRET=${secret}
"@

    # Write to a temp file and scp it across
    $tmp = [System.IO.Path]::GetTempFileName()
    try {
        $envContent | Set-Content -Path $tmp -Encoding UTF8 -NoNewline
        Copy-ToRemote -LocalPath $tmp -RemotePath "${RemoteDir}/.env"
        Write-Ok ".env created (APP_URL=${resolvedAppUrl}, PORT=${Port})"
    } finally {
        Remove-Item $tmp -Force -ErrorAction SilentlyContinue
    }
}

# ── Build and start ────────────────────────────────────────────
function Start-Container {
    param([string]$ComposeCmd)

    Write-Step "Building Docker image…"
    $buildFlags = if ($Rebuild) { '--no-cache' } else { '' }
    Invoke-Remote "cd '${RemoteDir}' && ${ComposeCmd} build ${buildFlags}"
    Write-Ok "Image built"

    Write-Step "Starting container…"
    Invoke-Remote "cd '${RemoteDir}' && ${ComposeCmd} up -d --remove-orphans"
    Write-Ok "Container started"
}

# ── Health check ───────────────────────────────────────────────
function Test-Health {
    Write-Step "Waiting for app to become healthy…"

    $resolvedAppUrl = if ($AppUrl -ne '') { $AppUrl } else { "http://localhost:${Port}" }
    $healthUrl = "${resolvedAppUrl}/health"

    $attempts  = 0
    $maxTries  = 12
    $intervalS = 5

    while ($attempts -lt $maxTries) {
        Start-Sleep -Seconds $intervalS
        $attempts++

        $result = Invoke-Remote "curl -sf '${healthUrl}' 2>/dev/null && echo ok || echo fail" -AllowFail
        if ($result -match 'ok') {
            Write-Ok "App is healthy after $($attempts * $intervalS)s"
            return
        }
        Write-Host "    (attempt $attempts/$maxTries)…" -ForegroundColor DarkGray
    }

    Write-Warn "Health check did not pass within $($maxTries * $intervalS)s."
    Write-Warn "Check container logs: ssh ${User}@${Host} 'cd ${RemoteDir} && docker compose logs'"
}

# ── Show logs (last few lines) ─────────────────────────────────
function Show-Logs {
    param([string]$ComposeCmd)
    Write-Step "Recent container logs:"
    $logs = Invoke-Remote "cd '${RemoteDir}' && ${ComposeCmd} logs --tail=15" -AllowFail
    $logs | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }
}

# ── Summary ────────────────────────────────────────────────────
function Write-Summary {
    $resolvedAppUrl = if ($AppUrl -ne '') { $AppUrl } else { "http://${Host}:${Port}" }
    Write-Host ""
    Write-Host "  ┌──────────────────────────────────────────────────────┐" -ForegroundColor Green
    Write-Host "  │              Deployment complete ✓                   │" -ForegroundColor Green
    Write-Host "  ├──────────────────────────────────────────────────────┤" -ForegroundColor Green
    Write-Host "  │  App URL  : $($resolvedAppUrl.PadRight(41)) │" -ForegroundColor Green
    Write-Host "  │  Host     : $($Host.PadRight(41)) │" -ForegroundColor Green
    Write-Host "  │  Dir      : $($RemoteDir.PadRight(41)) │" -ForegroundColor Green
    Write-Host "  ├──────────────────────────────────────────────────────┤" -ForegroundColor Green
    Write-Host "  │  Next steps:                                         │" -ForegroundColor Green
    Write-Host "  │  1. Open $resolvedAppUrl" -ForegroundColor Green
    Write-Host "  │  2. Click ⚙ Settings                                 │" -ForegroundColor Green
    Write-Host "  │  3. Enter Google / Microsoft OAuth credentials       │" -ForegroundColor Green
    Write-Host "  │  4. Register the redirect URIs shown in Settings     │" -ForegroundColor Green
    Write-Host "  └──────────────────────────────────────────────────────┘" -ForegroundColor Green
    Write-Host ""
}

# ── Main ───────────────────────────────────────────────────────
function Main {
    Write-Banner

    Write-Host "  Target  : ${User}@${Host}" -ForegroundColor DarkGray
    Write-Host "  Dir     : ${RemoteDir}"    -ForegroundColor DarkGray
    Write-Host "  Port    : ${Port}"         -ForegroundColor DarkGray
    Write-Host "  Branch  : ${Branch}"       -ForegroundColor DarkGray
    Write-Host "  Rebuild : $($Rebuild.IsPresent)" -ForegroundColor DarkGray
    Write-Host ""

    try {
        Test-Prerequisites
        Test-Connection
        Test-RemoteTools

        $composeCmd = Get-ComposeCmd

        Sync-Repository
        Write-EnvFile
        Start-Container -ComposeCmd $composeCmd
        Test-Health
        Show-Logs -ComposeCmd $composeCmd
        Write-Summary
    } catch {
        Write-Host ""
        Write-Fail "Deployment failed: $_"
        Write-Host ""
        exit 1
    }
}

Main
