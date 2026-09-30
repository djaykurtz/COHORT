#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Emit a deploy-receipt artifact when shipping a superdash-v2 change.

.DESCRIPTION
    SWAT-20260612-0011 Phase B / Discipline 4: push-to-backup is NOT
    deploy-confirmation. Free-text gates like "pending COORD_HOST-deploy
    confirmation" produced a silent-stall.

    This script writes a tracked receipt file into deploy-receipts/ that
    records the post-deploy verified state. Receipts are commit-tracked
    artifacts (NOT free text in cohort scratches), so any future divergence
    audit can deterministically answer "was this SHA deployed?"

    Receipt path:  deploy-receipts/<UTC-yyyymmddTHHMMSSZ>-<sha-short>.txt
    Receipt body:
        sha:        <full sha>
        sha_short:  <7-char>
        branch:     <current branch>
        author:     <node_id>
        verifier:   <verifier-node-id or 'self'>
        deployed_at:<utc-iso>
        backup_tip: <selected remote-tracking tip at receipt time; legacy field name>
        notes:      <free-text one-liner>

.PARAMETER Sha
    Full SHA of the deployed commit. Defaults to current HEAD of repo root.

.PARAMETER Author
    Node ID of the deploy author. Required.

.PARAMETER Verifier
    Node ID of the verifier (peer that confirmed live state). Default 'self'.

.PARAMETER Notes
    One-line free-text note (e.g. "Playwright-confirmed on :8430, badge=12").

.PARAMETER RepoRoot
    Path to superdash-v2 repo root. Default: cwd.

.EXAMPLE
    scripts\superdash-deploy-receipt.ps1 -Author UXIA -Verifier NIMBUS -Notes "SWAT-0001 badge live, count=12"

.NOTES
    Author:    UXIA (SWAT-20260612-0011 Phase B)
    Exit code: 0 on success, 1 on validation error, 2 on IO error
#>
[CmdletBinding()]
param(
    [string]$Sha,
    [Parameter(Mandatory=$true)][string]$Author,
    [string]$Verifier = 'self',
    [string]$Notes = '',
    [string]$RepoRoot,
    [ValidatePattern('^[A-Za-z0-9][A-Za-z0-9._-]*$')][string]$Remote = 'origin',
    [ValidatePattern('^[A-Za-z0-9][A-Za-z0-9._/-]*$')][string]$Branch = 'main',
    [switch]$FetchRemote
)

$ErrorActionPreference = 'Stop'

if (-not $RepoRoot) {
    $RepoRoot = (git rev-parse --show-toplevel 2>$null).Trim()
    if (-not $RepoRoot) {
        Write-Host "[receipt] FATAL: not in a git repo and -RepoRoot not given" -ForegroundColor Red
        exit 1
    }
}

# SWAT-20260628-0008 MANDATORY un-skippable cache-stamp gate (DRAGON arch-GREEN #99554).
# A deploy-receipt records a VERIFIED deploy -- it must NOT be emittable if any
# ?v=-stamped asset's content changed without bumping its stamp, because the
# immutable cache would serve the OLD bytes (the 3-layer delivery-gap root cause).
# No silent bypass (-Force): a cosmetic-only deploy passes the gate anyway (no
# content change = no stale stamp), so a bypass is never needed for legit deploys.
# NOTE: the gate compares Get-FileHash (on-disk SHA256) against the manifest; this
# equals what superdash-server.py serves ONLY while the server is transform-free
# (no minify / BOM rewrite / on-disk gzip). If any serve-time transform is ever
# added, switch the lint to hash the served bytes (QUATTRO #99570 (a)).
$lintScript = Join-Path $PSScriptRoot 'Lint-CacheStamps.ps1'
if (-not (Test-Path -LiteralPath $lintScript)) {
    Write-Host "[receipt] FATAL: Lint-CacheStamps.ps1 not found at $lintScript -- mandatory gate missing, refusing to emit receipt." -ForegroundColor Red
    exit 1
}
# FAIL-CLOSED: the gate spawns pwsh to isolate the lint's `exit 1` from this parent.
# If pwsh (PS7) is absent (e.g. invoked under powershell.exe 5.1), the spawn would
# throw without setting $LASTEXITCODE -> a stale prior 0 could pass the gate WITHOUT
# running the lint. Guard pwsh presence first, reset $LASTEXITCODE, and check $?
# so a launch failure fails CLOSED, never open (QUATTRO #99570 (c)).
if (-not (Get-Command pwsh -ErrorAction SilentlyContinue)) {
    Write-Host "[receipt] FATAL: 'pwsh' (PowerShell 7) not on PATH -- cannot run the mandatory cache-stamp gate. Refusing to emit receipt (fail-closed)." -ForegroundColor Red
    exit 1
}
$global:LASTEXITCODE = 0
& pwsh -NoProfile -File $lintScript -Check -DeployRoot $RepoRoot
if (-not $? -or $LASTEXITCODE -ne 0) {
    Write-Host "[receipt] BLOCKED: cache-stamp gate failed (exit $LASTEXITCODE) -- a ?v=-stamped asset changed without a stamp bump, no manifest, or the gate could not run." -ForegroundColor Red
    Write-Host "[receipt] Fix: bump the stale stamp(s) in index.html (or run scripts\Lint-CacheStamps.ps1 -Bump), then re-run. No receipt written." -ForegroundColor Yellow
    exit 1
}
Write-Host "[receipt] cache-stamp gate: PASS" -ForegroundColor Green

Push-Location $RepoRoot
try {
    if (-not $Sha) {
        $Sha = (git rev-parse HEAD 2>$null).Trim()
    }
    if ($Sha.Length -lt 40) {
        Write-Host "[receipt] FATAL: SHA must be full 40-char; got '$Sha'" -ForegroundColor Red
        exit 1
    }

    $verified = git cat-file -e "$Sha^{commit}" 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[receipt] FATAL: SHA $Sha is not a known commit in this repo" -ForegroundColor Red
        exit 1
    }

    $shaShort = $Sha.Substring(0, 7)
    $currentBranch = (git rev-parse --abbrev-ref HEAD 2>$null).Trim()

    $backupTip = ''
    # KB git-family-native-commands-eap-discipline (SWAT-20260703-0008 fold):
    # `git fetch` writes informational progress to stderr as normal behavior;
    # under PS 7.3+'s $PSNativeCommandUseErrorActionPreference (default $true)
    # + this script's $ErrorActionPreference='Stop', that stderr write gets
    # converted to a terminating error even on exit 0 -- silently aborting
    # mid-receipt. Relax EAP around just this call, restore in finally.
    $prevEA = $ErrorActionPreference
    $prevNativeEA = $null
    if (Test-Path variable:PSNativeCommandUseErrorActionPreference) {
        $prevNativeEA = $PSNativeCommandUseErrorActionPreference
        Set-Variable -Name PSNativeCommandUseErrorActionPreference -Value $false -Scope Global -ErrorAction SilentlyContinue
    }
    $ErrorActionPreference = 'Continue'
    try {
        if ($FetchRemote) {
            git fetch $Remote $Branch 2>&1 | Out-Null
            if ($LASTEXITCODE -ne 0) { throw "Selected remote fetch failed" }
        }
        $fetchExit = 0
    } finally {
        $ErrorActionPreference = $prevEA
        if ($null -ne $prevNativeEA) {
            Set-Variable -Name PSNativeCommandUseErrorActionPreference -Value $prevNativeEA -Scope Global -ErrorAction SilentlyContinue
        }
    }
    if ($fetchExit -eq 0) {
        $tip = git rev-parse --verify "$Remote/$Branch" 2>$null
        if ($LASTEXITCODE -ne 0) { throw "Remote-tracking branch '$Remote/$Branch' is not available" }
        $backupTip = ([string]$tip).Trim()
    }

    $tsUtc   = (Get-Date).ToUniversalTime()
    $tsStamp = $tsUtc.ToString('yyyyMMddTHHmmssZ')
    $tsIso   = $tsUtc.ToString('o')

    $receiptsDir = Join-Path $RepoRoot 'deploy-receipts'
    if (-not (Test-Path $receiptsDir)) {
        New-Item -ItemType Directory -Path $receiptsDir -Force | Out-Null
    }

    $fileName = "${tsStamp}-${shaShort}.txt"
    $filePath = Join-Path $receiptsDir $fileName

    $body = @(
        "sha:         $Sha"
        "sha_short:   $shaShort"
        "branch:      $currentBranch"
        "author:      $Author"
        "verifier:    $Verifier"
        "deployed_at: $tsIso"
        "backup_tip:  $backupTip"
        "notes:       $Notes"
    ) -join "`n"

    Set-Content -Path $filePath -Value $body -Encoding ASCII -NoNewline
    Write-Host "[receipt] Wrote $filePath" -ForegroundColor Green
    Write-Host "[receipt] Stage + commit + push to record deploy confirmation:" -ForegroundColor Cyan
    Write-Host "  git add deploy-receipts/$fileName" -ForegroundColor DarkGray
    Write-Host "  git commit -m 'deploy-receipt: $shaShort verified by $Verifier'" -ForegroundColor DarkGray
    Write-Host "  git push $Remote $Branch" -ForegroundColor DarkGray
    exit 0
}
catch {
    Write-Host "[receipt] FATAL: $_" -ForegroundColor Red
    exit 2
}
finally {
    Pop-Location
}
