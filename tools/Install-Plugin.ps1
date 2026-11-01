#Requires -Version 5.1
[CmdletBinding()]
param(
    [string]$PluginDirectory,
    [switch]$CheckOnly
)

$ErrorActionPreference = 'Stop'
$PackageRoot = Split-Path -Parent $PSScriptRoot
$PluginName = 'steam-custom-achievements'
$SourceDirectory = $PackageRoot
# Every file the plugin loads. The backend fails to start if any Lua module is missing.
$RelativeFiles = @('plugin.json', '.millennium\Dist\index.js', 'backend\main.lua', 'backend\games.lua', 'backend\detector_ac2.lua', 'backend\detector_cod.lua', 'backend\detector_fable3.lua', 'backend\inflate.lua', 'backend\recorder.lua', 'backend\capture.lua', 'backend\decoder_acb.lua', 'backend\decoder_thrillville.lua', 'backend\detector_acb.lua', 'backend\detector_ac1.lua', 'backend\detector_me1.lua', 'backend\detector_me2.lua', 'backend\detector_thrillville.lua', 'backend\detector_fallout3.lua', 'backend\lzo1x.lua', 'backend\auto_rules.lua', 'backend\collectible_rules.lua', 'backend\tracker_rules.lua', 'backend\checklist_rules.lua', 'third_party\AC2AP-LICENSE.txt')
# Capture and record mode write into recordings\<game>; the folders are made on install.
$RecordingFolders = @('ac1', 'ac2', 'acb', 'cod4', 'codwaw', 'fable3', 'fallout3', 'me1', 'me2', 'thrillville-otr')
$ReportLines = New-Object 'System.Collections.Generic.List[string]'
$ReportPath = Join-Path $PackageRoot 'INSTALL_REPORT.txt'
$ExitCode = 0

function Write-Report([string]$Text) {
    $ReportLines.Add($Text)
    Write-Host $Text
}

function Get-SteamCandidates {
    $roots = New-Object 'System.Collections.Generic.List[string]'
    foreach ($process in @(Get-Process -Name steam -ErrorAction SilentlyContinue)) {
        try {
            if ($process.Path) { $roots.Add((Split-Path -Parent $process.Path)) }
        } catch { }
    }
    foreach ($key in @('HKCU:\Software\Valve\Steam', 'HKLM:\SOFTWARE\WOW6432Node\Valve\Steam', 'HKLM:\SOFTWARE\Valve\Steam')) {
        try {
            $entry = Get-ItemProperty -LiteralPath $key -ErrorAction Stop
            foreach ($value in @($entry.SteamPath, $entry.InstallPath)) {
                if ($value) { $roots.Add([string]$value) }
            }
        } catch { }
    }
    foreach ($base in @(${env:ProgramFiles(x86)}, $env:ProgramFiles)) {
        if ($base) { $roots.Add((Join-Path $base 'Steam')) }
    }
    $found = @()
    foreach ($root in @($roots | Select-Object -Unique)) {
        $dll = Join-Path $root 'millennium\lib\millennium.dll'
        if ((Test-Path -LiteralPath (Join-Path $root 'Steam.exe') -PathType Leaf) -and
            (Test-Path -LiteralPath $dll -PathType Leaf)) {
            $candidate = [IO.Path]::GetFullPath((Join-Path $root 'millennium\plugins'))
            if ($found -notcontains $candidate) { $found += $candidate }
        }
    }
    return $found
}

function Resolve-PluginDirectory([string]$Value) {
    $value = $Value.Trim().Trim('"')
    if (-not $value) { throw 'No plugins folder was selected.' }
    $path = [IO.Path]::GetFullPath([Environment]::ExpandEnvironmentVariables($value)).TrimEnd('\', '/')
    if ([IO.Path]::GetFileName($path) -ieq 'plugin.json') { $path = Split-Path -Parent $path }
    if ((Split-Path -Leaf $path) -ieq $PluginName) { $path = Split-Path -Parent $path }
    if (Test-Path -LiteralPath (Join-Path $path 'Steam.exe') -PathType Leaf) {
        $path = Join-Path $path 'millennium\plugins'
    } elseif (Test-Path -LiteralPath (Join-Path $path 'lib\millennium.dll') -PathType Leaf) {
        $path = Join-Path $path 'plugins'
    }
    if ((Split-Path -Leaf $path) -ine 'plugins') {
        throw 'Select the plugins folder opened by Millennium > Plugins > Browse Local Files.'
    }
    $runtimeRoot = Split-Path -Parent $path
    if (-not (Test-Path -LiteralPath (Join-Path $runtimeRoot 'lib\millennium.dll') -PathType Leaf)) {
        throw 'This folder is not beside a Millennium 3.x runtime. Use Browse Local Files to get the active plugins path, and send INSTALL_REPORT.txt if this check fails.'
    }
    return [IO.Path]::GetFullPath($path)
}

function Test-PluginFiles([string]$Directory) {
    foreach ($relative in $RelativeFiles) {
        $file = Join-Path $Directory $relative
        if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw "Missing plugin file: $file" }
        if ((Get-Item -LiteralPath $file).Length -eq 0) { throw "Empty plugin file: $file" }
    }
    $manifest = Get-Content -LiteralPath (Join-Path $Directory 'plugin.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($manifest.name -cne $PluginName) { throw 'plugin.json contains a different internal plugin name.' }
    if (($manifest.useBackend -isnot [bool]) -or (-not $manifest.useBackend) -or $manifest.backendType -cne 'lua') {
        throw 'This package requires useBackend=true and backendType=lua for the save detectors.'
    }
    foreach ($relative in $RelativeFiles) {
        $expected = (Get-FileHash -LiteralPath (Join-Path $SourceDirectory $relative) -Algorithm SHA256).Hash
        $actual = (Get-FileHash -LiteralPath (Join-Path $Directory $relative) -Algorithm SHA256).Hash
        if ($actual -ne $expected) { throw "File differs from the supplied package: $relative" }
    }
    return $manifest
}

try {
    Write-Report 'STEAM CUSTOM ACHIEVEMENTS - MULTI-GAME (AC2, CoD 4, CoD WaW, Fable III, Thrillville)'
    Write-Report ('Time: ' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'))
    Write-Report ('Mode: ' + $(if ($CheckOnly) { 'Check existing files' } else { 'Install / repair' }))
    Write-Report ('Package folder: ' + $PackageRoot)
    [void](Test-PluginFiles $SourceDirectory)
    Write-Report 'Package files: valid manifest and frontend bundle.'

    if (-not $PluginDirectory) {
        $candidates = @(Get-SteamCandidates)
        if ($candidates.Count -eq 1) {
            Write-Report ('Detected plugins folder: ' + $candidates[0])
            $choice = Read-Host 'Press Enter to use that folder, or paste the Browse Local Files folder path'
            if ([string]::IsNullOrWhiteSpace($choice)) { $PluginDirectory = $candidates[0] }
            else { $PluginDirectory = $choice }
        } else {
            foreach ($candidate in $candidates) { Write-Report ('Possible plugins folder: ' + $candidate) }
            $PluginDirectory = Read-Host 'Paste the folder path opened by Millennium > Plugins > Browse Local Files'
        }
    }
    $PluginDirectory = Resolve-PluginDirectory $PluginDirectory
    $Destination = Join-Path $PluginDirectory $PluginName
    $RuntimeRoot = Split-Path -Parent $PluginDirectory
    $dll = Get-Item -LiteralPath (Join-Path $RuntimeRoot 'lib\millennium.dll')
    Write-Report ('Selected plugins folder: ' + $PluginDirectory)
    Write-Report ('Millennium DLL version: ' + $dll.VersionInfo.FileVersion)
    Write-Report ('Final plugin folder: ' + $Destination)

    if ($Destination.TrimEnd('\') -ieq $PackageRoot.TrimEnd('\')) {
        Write-Report 'This package is already directly inside the selected plugins folder.'
        Write-Report 'Checking the existing files in place; no copy or backup is needed.'
        $CheckOnly = $true
    }

    if ($Destination.StartsWith($PackageRoot + '\', [StringComparison]::OrdinalIgnoreCase)) {
        throw 'The destination is inside this extracted package. Select the actual Millennium plugins folder.'
    }
    if (Test-Path -LiteralPath $Destination) {
        $target = Get-Item -LiteralPath $Destination -Force
        if (-not $target.PSIsContainer) { throw 'A file already occupies the plugin folder path.' }
        if ($target.Attributes -band [IO.FileAttributes]::ReparsePoint) {
            throw 'The existing plugin folder is a junction or link. Send the report so it can be handled without altering the linked location.'
        }
        Write-Report 'An existing plugin folder was found.'
    } else { Write-Report 'No plugin folder exists at the direct discovery location.' }

    $star = Join-Path $PluginDirectory ($PluginName + '.star')
    if (Test-Path -LiteralPath $star) {
        throw 'A same-name .star package is present. Send this report before installing a duplicate plugin identity.'
    }

    if (-not $CheckOnly) {
        while (@(Get-Process -Name steam -ErrorAction SilentlyContinue).Count -gt 0) {
            Write-Report 'Steam is running. Use Steam > Exit, then return here.'
            [void](Read-Host 'Press Enter after Steam has fully closed (Ctrl+C cancels)')
        }
        [void](New-Item -ItemType Directory -Path $PluginDirectory -Force)
        $token = [Guid]::NewGuid().ToString('N')
        $staging = Join-Path $PluginDirectory ('.sca-install-' + $token)
        $backup = $null
        $placed = $false
        try {
            [void](New-Item -ItemType Directory -Path (Join-Path $staging '.millennium\Dist') -Force)
            foreach ($relative in $RelativeFiles) {
                [void](New-Item -ItemType Directory -Path (Split-Path -Parent (Join-Path $staging $relative)) -Force)
                Copy-Item -LiteralPath (Join-Path $SourceDirectory $relative) -Destination (Join-Path $staging $relative) -Force
            }
            foreach ($slug in $RecordingFolders) {
                [void](New-Item -ItemType Directory -Path (Join-Path $staging ('recordings\' + $slug)) -Force)
                $note = Join-Path $SourceDirectory ('recordings\' + $slug + '\README.txt')
                if (Test-Path -LiteralPath $note -PathType Leaf) { Copy-Item -LiteralPath $note -Destination (Join-Path $staging ('recordings\' + $slug)) -Force }
            }
            $note = Join-Path $SourceDirectory 'recordings\README.txt'
            if (Test-Path -LiteralPath $note -PathType Leaf) { Copy-Item -LiteralPath $note -Destination (Join-Path $staging 'recordings') -Force }
            [void](Test-PluginFiles $staging)
            if (Test-Path -LiteralPath $Destination) {
                $backupRoot = Join-Path $RuntimeRoot 'custom-achievement-backups'
                [void](New-Item -ItemType Directory -Path $backupRoot -Force)
                $backup = Join-Path $backupRoot ($PluginName + '-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + $token.Substring(0, 6))
                Move-Item -LiteralPath $Destination -Destination $backup
                Write-Report ('Previous plugin folder preserved at: ' + $backup)
            }
            Move-Item -LiteralPath $staging -Destination $Destination
            $placed = $true
            [void](Test-PluginFiles $Destination)
        } catch {
            $originalError = $_
            if ($placed -and (Test-Path -LiteralPath $Destination)) { Remove-Item -LiteralPath $Destination -Recurse -Force }
            if ($backup -and (Test-Path -LiteralPath $backup) -and (-not (Test-Path -LiteralPath $Destination))) {
                Move-Item -LiteralPath $backup -Destination $Destination
                Write-Report 'Restored the previous plugin folder after the installation error.'
            }
            throw $originalError
        } finally {
            if (Test-Path -LiteralPath $staging) { Remove-Item -LiteralPath $staging -Recurse -Force }
        }
        Write-Report 'Installed and verified the frontend and Lua save detectors.'
    }

    $manifest = Test-PluginFiles $Destination
    Write-Report ('Installed manifest: ' + $manifest.name + ', version ' + $manifest.version + ', backendType=lua')
    foreach ($relative in $RelativeFiles) {
        $file = Get-Item -LiteralPath (Join-Path $Destination $relative) -Force
        Write-Report ('Verified file: ' + $file.FullName + ' (' + $file.Length + ' bytes)')
    }
    $matching = @()
    foreach ($directory in @(Get-ChildItem -LiteralPath $PluginDirectory -Directory -Force)) {
        $config = Join-Path $directory.FullName 'plugin.json'
        if (Test-Path -LiteralPath $config -PathType Leaf) {
            try {
                $data = Get-Content -LiteralPath $config -Raw -Encoding UTF8 | ConvertFrom-Json
                if ($data.name -ceq $PluginName) { $matching += $directory.FullName }
            } catch { }
        }
    }
    Write-Report ('Direct folders with this plugin identity: ' + $matching.Count)
    foreach ($match in $matching) { Write-Report ('Discovery match: ' + $match) }
    if ($matching.Count -ne 1) { throw 'Duplicate or missing plugin manifests remain. Send this report.' }
    Write-Report ''
    Write-Report 'FILES VERIFIED. Steam recognition has not been checked by this script.'
    Write-Report 'Start Steam, open Millennium > Plugins, then enable Steam Custom Achievements (Local).'
    Write-Report 'If it is still absent, send INSTALL_REPORT.txt and a screenshot of the Plugins page.'
} catch {
    $ExitCode = 1
    Write-Report ('ERROR: ' + $_.Exception.Message)
    Write-Report 'Send this report so the exact installation failure can be checked.'
} finally {
    try {
        $ReportLines | Set-Content -LiteralPath $ReportPath -Encoding UTF8
    } catch {
        $ReportPath = Join-Path ([IO.Path]::GetTempPath()) ('SteamCustomAchievements-Install-' + [Guid]::NewGuid().ToString('N') + '.txt')
        try { $ReportLines | Set-Content -LiteralPath $ReportPath -Encoding UTF8 }
        catch { $ReportPath = '(Report could not be saved; copy the console text.)' }
    }
    Write-Host ''
    Write-Host ('Report: ' + $ReportPath)
}
exit $ExitCode
