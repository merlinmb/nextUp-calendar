#Requires -Version 5.1
<#
.SYNOPSIS
    Deploy nextUp Calendar to a Homebridge Docker host over SSH.

.DESCRIPTION
    Connects to the target host via SSH, clones or updates the repository,
    writes an .env file if one does not already exist, then builds and
    starts the container with Docker Compose.

.PARAMETER TargetHost
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
    Default: http://<TargetHost>:3050

.PARAMETER Port
    Host port to expose the app on. Default: 3050

.PARAMETER Rebuild
    Force a Docker image rebuild with --no-cache.

.PARAMETER Branch
    Git branch to check out on the remote host. Default: main

.EXAMPLE
    .\deploy.ps1

.EXAMPLE
    .\deploy.ps1 -TargetHost 192.168.1.50 -User ubuntu -Rebuild

.EXAMPLE
    .\deploy.ps1 -SshKey ~/.ssh/homebridge_rsa -Branch main
#>

[CmdletBinding()]
param(
    [string] $TargetHost = 'homebridge.local',
    [string] $User       = 'pi',
    [string] $SshKey     = '',
    [string] $RemoteDir  = '/home/pi/portainer_data/nextup-calendar',
    [string] $AppUrl     = '',
    [int]    $Port       = 3050,
    [switch] $Rebuild,
    [string] $Branch     = 'main'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
if ($PSVersionTable.PSVersion.Major -ge 7) {
    $PSNativeCommandUseErrorActionPreference = $false
}

# -- Color helpers ------------------------------------------------
function Write-Step  { param([string]$msg) Write-Host "  -> $msg" -ForegroundColor Cyan }
function Write-Ok    { param([string]$msg) Write-Host "  [OK] $msg" -ForegroundColor Green }
function Write-Warn  { param([string]$msg) Write-Host "  [!] $msg" -ForegroundColor Yellow }
function Write-Fail  { param([string]$msg) Write-Host "  [X] $msg" -ForegroundColor Red }

function Write-Banner {
    Write-Host ""
    Write-Host "  ======================================" -ForegroundColor DarkCyan
    Write-Host "      nextUp Calendar - deploy" -ForegroundColor DarkCyan
    Write-Host "  ======================================" -ForegroundColor DarkCyan
    Write-Host ""
}

# -- SSH helper ---------------------------------------------------
# Returns an array of ssh arguments (key flag inserted when -SshKey given)
function Get-SshArgs {
    $sshArgs = @('-o', 'StrictHostKeyChecking=accept-new',
                 '-o', 'ConnectTimeout=10')
    if ($SshKey -ne '') {
        $resolvedPath = Resolve-Path $SshKey -ErrorAction SilentlyContinue
        $resolved = if ($resolvedPath) { $resolvedPath.Path } else { $null }
        if (-not $resolved) { throw "SSH key not found: $SshKey" }
        $sshArgs += @('-i', $resolved)
    }
    return $sshArgs
}

# Run a command on the remote host; throw on non-zero exit
function Invoke-Remote {
    param([string]$Command, [switch]$AllowFail)

    $sshArgs = Get-SshArgs
    $target = "${User}@${TargetHost}"
    $argumentList = @($sshArgs + $target + $Command)
    $stdoutPath = [System.IO.Path]::GetTempFileName()
    $stderrPath = [System.IO.Path]::GetTempFileName()

    try {
        $process = Start-Process -FilePath 'ssh' -ArgumentList $argumentList -NoNewWindow -Wait -PassThru `
            -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath

        $stdout = if (Test-Path $stdoutPath) { Get-Content -Path $stdoutPath } else { @() }
        $stderr = if (Test-Path $stderrPath) { Get-Content -Path $stderrPath } else { @() }
        $result = @($stdout + $stderr | Where-Object { $_ -ne '' })
        $global:LASTEXITCODE = $process.ExitCode

        if ($process.ExitCode -ne 0 -and -not $AllowFail) {
            Write-Fail "Remote command failed (exit $($process.ExitCode)):"
            $result | ForEach-Object { Write-Host $_ -ForegroundColor DarkRed }
            throw "Remote command failed: $Command"
        }

        return $result
    } finally {
        Remove-Item $stdoutPath, $stderrPath -Force -ErrorAction SilentlyContinue
    }
}

# Copy a local file to the remote host
function Copy-ToRemote {
    param([string]$LocalPath, [string]$RemotePath)

    $sshArgs = Get-SshArgs
    $target = "${User}@${TargetHost}:$RemotePath"
    $argumentList = @($sshArgs + $LocalPath + $target)
    $stdoutPath = [System.IO.Path]::GetTempFileName()
    $stderrPath = [System.IO.Path]::GetTempFileName()

    try {
        $process = Start-Process -FilePath 'scp' -ArgumentList $argumentList -NoNewWindow -Wait -PassThru `
            -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath
        $global:LASTEXITCODE = $process.ExitCode

        if ($process.ExitCode -ne 0) {
            $errors = if (Test-Path $stderrPath) { Get-Content -Path $stderrPath } else { @() }
            if ($errors) {
                $errors | ForEach-Object { Write-Host $_ -ForegroundColor DarkRed }
            }
            throw "scp failed: $LocalPath -> $RemotePath"
        }
    } finally {
        Remove-Item $stdoutPath, $stderrPath -Force -ErrorAction SilentlyContinue
    }
}

# -- Pre-flight checks -------------------------------------------
function Test-Prerequisites {
    Write-Step "Checking prerequisites..."

    # ssh
    if (-not (Get-Command ssh -ErrorAction SilentlyContinue)) {
        throw "ssh is not available. Install OpenSSH (Settings -> Optional Features -> OpenSSH Client) or Git for Windows."
    }

    # scp
    if (-not (Get-Command scp -ErrorAction SilentlyContinue)) {
        throw "scp is not available. Install OpenSSH or Git for Windows."
    }

    Write-Ok "ssh and scp found"
}

# -- Connectivity test -------------------------------------------
function Test-Connection {
    Write-Step "Testing SSH connection to ${User}@${TargetHost}..."
    try {
        $out = Invoke-Remote "echo ok"
        if ($out -match 'ok') { Write-Ok "Connected" }
        else { throw "Unexpected response" }
    } catch {
        Write-Fail "Cannot connect to ${User}@${TargetHost}"
        Write-Host "  Ensure SSH is enabled on your Homebridge host and the user account exists." -ForegroundColor DarkGray
        throw
    }
}

# -- Remote checks -----------------------------------------------
function Test-RemoteTools {
    Write-Step "Checking remote tools (docker, git)..."

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

# -- Resolve compose command -------------------------------------
function Get-ComposeCmd {
    $v2 = Invoke-Remote "docker compose version 2>/dev/null && echo yes || echo no" -AllowFail
    if ($v2 -match 'yes') { return 'docker compose' }
    return 'docker-compose'
}

# -- Clone or update repo ----------------------------------------
function Sync-Repository {
    Write-Step "Syncing repository to ${RemoteDir}..."

    $repoUrl = 'https://github.com/merlinmb/nextUp-calendar.git'
    $remoteParent = Split-Path $RemoteDir -Parent

    # Create parent directory
    $createParentCommand = "sudo mkdir -p '$remoteParent' && sudo chown $User`:$User '$remoteParent'"
    Invoke-Remote $createParentCommand -AllowFail | Out-Null

    $existsCommand = "test -d '$RemoteDir/.git' && echo yes || echo no"
    $exists = Invoke-Remote $existsCommand
    if ($exists -match 'yes') {
        Write-Step "Repository exists - pulling latest ${Branch}..."
        $updateCommand = "cd '$RemoteDir' && git fetch --prune origin '$Branch' && git checkout -q '$Branch' && git reset --hard 'origin/$Branch'"
        Invoke-Remote $updateCommand
        Write-Ok "Repository updated"
    } else {
        Write-Step "Cloning repository..."
        $cloneCommand = "git clone --branch '$Branch' '$repoUrl' '$RemoteDir'"
        Invoke-Remote $cloneCommand
        Write-Ok "Repository cloned"
    }
}

# -- Remove previous container -----------------------------------
function Remove-PreviousContainer {
    param([string]$ComposeCmd)

    Write-Step "Removing previous container..."
    $downCommand = "cd '$RemoteDir' && $ComposeCmd down --remove-orphans"
    Invoke-Remote $downCommand -AllowFail | Out-Null

    $removeContainerCommand = "docker rm -f nextup-calendar 2>/dev/null || true"
    Invoke-Remote $removeContainerCommand -AllowFail | Out-Null
    Write-Ok "Previous container removed"
}

# -- Write .env ---------------------------------------------------
function Write-EnvFile {
    Write-Step "Checking .env on remote..."

    $envExistsCommand = "test -f '$RemoteDir/.env' && echo yes || echo no"
    $envExists = Invoke-Remote $envExistsCommand
    if ($envExists -match 'yes') {
        Write-Ok ".env already exists - leaving it unchanged"
        return
    }

    Write-Step "Creating .env..."

    $resolvedAppUrl = if ($AppUrl -ne '') { $AppUrl } else { 'http://{0}:{1}' -f $TargetHost, $Port }

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
    $remoteEnvPath = '{0}/.env' -f $RemoteDir
    try {
        $envContent | Set-Content -Path $tmp -Encoding UTF8 -NoNewline
        Copy-ToRemote -LocalPath $tmp -RemotePath $remoteEnvPath
        Write-Ok ('.env created (APP_URL={0}, PORT={1})' -f $resolvedAppUrl, $Port)
    } finally {
        Remove-Item $tmp -Force -ErrorAction SilentlyContinue
    }
}

# -- Build and start ---------------------------------------------
function Start-Container {
    param([string]$ComposeCmd)

    Write-Step "Building Docker image..."
    $buildFlags = if ($Rebuild) { '--no-cache' } else { '' }
    $buildCommand = ("cd '$RemoteDir' && {0} build" -f $ComposeCmd).Trim()
    if ($buildFlags) {
        $buildCommand = "$buildCommand $buildFlags"
    }
    Invoke-Remote $buildCommand
    Write-Ok "Image built"

    Write-Step "Starting container..."
    $upCommand = "cd '$RemoteDir' && $ComposeCmd up -d --remove-orphans"
    Invoke-Remote $upCommand
    Write-Ok "Container started"
}

# -- Health check -------------------------------------------------
function Test-Health {
    Write-Step "Waiting for app to become healthy..."

    $resolvedAppUrl = if ($AppUrl -ne '') { $AppUrl } else { "http://localhost:${Port}" }
    $healthUrl = "${resolvedAppUrl}/health"

    $attempts  = 0
    $maxTries  = 12
    $intervalS = 5

    while ($attempts -lt $maxTries) {
        Start-Sleep -Seconds $intervalS
        $attempts++

        $healthCommand = "curl -sf '$healthUrl' 2>/dev/null && echo ok || echo fail"
        $result = Invoke-Remote $healthCommand -AllowFail
        if ($result -match 'ok') {
            Write-Ok "App is healthy after $($attempts * $intervalS)s"
            return
        }
        Write-Host "    (attempt $attempts/$maxTries)..." -ForegroundColor DarkGray
    }

    Write-Warn "Health check did not pass within $($maxTries * $intervalS)s."
    Write-Warn ("Check container logs: ssh $User@$TargetHost 'cd $RemoteDir && docker compose logs'")
}

# -- Show logs (last few lines) ----------------------------------
function Show-Logs {
    param([string]$ComposeCmd)
    Write-Step "Recent container logs:"
    $logsCommand = "cd '$RemoteDir' && $ComposeCmd logs --tail=15"
    $logs = Invoke-Remote $logsCommand -AllowFail
    $logs | ForEach-Object { Write-Host "    $_" -ForegroundColor DarkGray }
}

# -- Summary ------------------------------------------------------
function Write-Summary {
    $resolvedAppUrl = if ($AppUrl -ne '') { $AppUrl } else { "http://${TargetHost}:${Port}" }
    Write-Host ""
    Write-Host "  ======================================================" -ForegroundColor Green
    Write-Host "  Deployment complete [OK]" -ForegroundColor Green
    Write-Host "  ------------------------------------------------------" -ForegroundColor Green
    Write-Host "  App URL  : $resolvedAppUrl" -ForegroundColor Green
    Write-Host "  Host     : $TargetHost" -ForegroundColor Green
    Write-Host "  Dir      : $RemoteDir" -ForegroundColor Green
    Write-Host "  ------------------------------------------------------" -ForegroundColor Green
    Write-Host "  Next steps:" -ForegroundColor Green
    Write-Host "  1. Open $resolvedAppUrl" -ForegroundColor Green
    Write-Host "  2. Click Settings" -ForegroundColor Green
    Write-Host "  3. Enter Google / Microsoft OAuth credentials" -ForegroundColor Green
    Write-Host "  4. Register the redirect URIs shown in Settings" -ForegroundColor Green
    Write-Host "  ======================================================" -ForegroundColor Green
    Write-Host ""
}

# -- Main ---------------------------------------------------------
function Main {
    Write-Banner

    Write-Host "  Target  : ${User}@${TargetHost}" -ForegroundColor DarkGray
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
        Remove-PreviousContainer -ComposeCmd $composeCmd
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
