#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Reconcile-at-session-start guard for nodes touching superdash-v2-deploy.

.DESCRIPTION
    SWAT-20260612-0011 Phase B / Discipline 1: the class-fix for the silent
    ship-gap that produced a "pending deploy that never came"
    stale-tip -- integration and deploy tips diverged and no
    automated check caught it.

    Run this script BEFORE touching superdash-v2-deploy in any session:
        scripts\superdash-deploy-reconcile.ps1

    What it does:
      1. Locates the explicitly selected deploy worktree
      2. Optionally fetches the selected remote when -Fetch is supplied
      3. Compares the selected local and remote-tracking branch tips
      4. Emits a verdict line + nonzero exit if divergent (so wrapper scripts
         can gate on it)

    Output verdict shapes:
      CONVERGENT  local=<sha> == selected-remote/branch=<sha>
      AHEAD       local is N commits ahead of the integration tip (push needed)
      BEHIND      local is N commits behind the integration tip (pull needed)
      DIVERGENT   local A | backup B (manual reconcile required)

    Diagnostic by default. -Fetch updates only the selected remote-tracking refs.

.PARAMETER DeployTree
    Path to the deploy worktree. Defaults to the application directory.

.PARAMETER Quiet
    Suppress non-essential output; print verdict line only.

.EXAMPLE
    scripts\superdash-deploy-reconcile.ps1
    # Verbose verdict + counts

.EXAMPLE
    scripts\superdash-deploy-reconcile.ps1 -Quiet
    # One-line verdict for wrapper consumption

.NOTES
    Author:    UXIA (SWAT-20260612-0011 Phase B)
    Exit code: 0 on CONVERGENT, 1 on AHEAD/BEHIND/DIVERGENT, 2 on error
#>
[CmdletBinding()]
param(
    [string]$DeployTree = (Split-Path -Parent $PSScriptRoot),
    [ValidatePattern('^[A-Za-z0-9][A-Za-z0-9._-]*$')][string]$Remote = 'origin',
    [ValidatePattern('^[A-Za-z0-9][A-Za-z0-9._/-]*$')][string]$Branch = 'main',
    [switch]$Fetch,
    [switch]$Quiet
)

$ErrorActionPreference = 'Stop'

function Write-Info([string]$msg) {
    if (-not $Quiet) { Write-Host $msg -ForegroundColor Cyan }
}

if (-not (Test-Path $DeployTree)) {
    Write-Host "[reconcile] FATAL: deploy tree not found at $DeployTree" -ForegroundColor Red
    exit 2
}

Push-Location $DeployTree
try {
    Write-Info "[reconcile] Deploy tree: $DeployTree"

    $currentBranch = git rev-parse --abbrev-ref HEAD 2>$null
    if ($LASTEXITCODE -ne 0) { throw "Deploy tree is not a Git repository" }
    if ($currentBranch -ne $Branch) {
        Write-Host "[reconcile] WARN: deploy tree is on '$currentBranch', expected '$Branch'." -ForegroundColor Yellow
    }

    if ($Fetch) {
    Write-Info "[reconcile] Fetching selected remote '$Remote' branch '$Branch'..."
    # KB git-family-native-commands-eap-discipline (SWAT-20260703-0008 fold):
    # `git fetch` writes informational progress to stderr as normal behavior;
    # under PS 7.3+'s $PSNativeCommandUseErrorActionPreference (default $true)
    # + this script's $ErrorActionPreference='Stop', that stderr write gets
    # converted to a terminating error even on exit 0 -- this is the EXACT
    # SWAT-20260703-0006 incident class this script previously hit. Relax
    # EAP around just this call, restore in finally.
    $prevEA = $ErrorActionPreference
    $prevNativeEA = $null
    if (Test-Path variable:PSNativeCommandUseErrorActionPreference) {
        $prevNativeEA = $PSNativeCommandUseErrorActionPreference
        Set-Variable -Name PSNativeCommandUseErrorActionPreference -Value $false -Scope Global -ErrorAction SilentlyContinue
    }
    $ErrorActionPreference = 'Continue'
    try {
        git fetch $Remote $Branch 2>&1 | Out-Null
        $fetchExit = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $prevEA
        if ($null -ne $prevNativeEA) {
            Set-Variable -Name PSNativeCommandUseErrorActionPreference -Value $prevNativeEA -Scope Global -ErrorAction SilentlyContinue
        }
    }
    if ($fetchExit -ne 0) {
        Write-Host "[reconcile] FATAL: selected remote fetch failed (exit $fetchExit)" -ForegroundColor Red
        exit 2
    }
    }

    $localResult = git rev-parse --verify $Branch 2>$null
    if ($LASTEXITCODE -ne 0) { throw "Local branch '$Branch' is not available" }
    $remoteResult = git rev-parse --verify "$Remote/$Branch" 2>$null
    if ($LASTEXITCODE -ne 0) { throw "Remote-tracking branch '$Remote/$Branch' is not available" }
    $localTip = ([string]$localResult).Trim()
    $remoteTip = ([string]$remoteResult).Trim()

    if (-not $localTip -or -not $remoteTip) {
        Write-Host "[reconcile] FATAL: rev-parse failed (local=$localTip remote=$remoteTip)" -ForegroundColor Red
        exit 2
    }

    if ($localTip -eq $remoteTip) {
        Write-Host "[reconcile] CONVERGENT  local=$localTip == $Remote/$Branch=$remoteTip" -ForegroundColor Green
        exit 0
    }

    # Divergence shape -- count both sides per banked discipline:
    #   "Before asserting git divergence shape ... run BOTH `git log A..B` AND
    #    `git log B..A` AND verify `git rev-list --count` on each side."
    $aheadResult = git rev-list --count "$remoteTip..$localTip"
    if ($LASTEXITCODE -ne 0 -or [string]$aheadResult -notmatch '^\d+$') { throw "Unable to count local-ahead commits" }
    $behindResult = git rev-list --count "$localTip..$remoteTip"
    if ($LASTEXITCODE -ne 0 -or [string]$behindResult -notmatch '^\d+$') { throw "Unable to count remote-ahead commits" }
    $ahead = [int]$aheadResult
    $behind = [int]$behindResult

    if ($ahead -gt 0 -and $behind -eq 0) {
        Write-Host "[reconcile] AHEAD       local=$localTip is $ahead commits ahead of $Remote/$Branch=$remoteTip (push needed)" -ForegroundColor Yellow
        exit 1
    }
    if ($behind -gt 0 -and $ahead -eq 0) {
        Write-Host "[reconcile] BEHIND      local=$localTip is $behind commits behind $Remote/$Branch=$remoteTip (pull needed)" -ForegroundColor Yellow
        exit 1
    }
    Write-Host "[reconcile] DIVERGENT   local=$localTip ($ahead ahead) | $Remote/$Branch=$remoteTip ($behind ahead) -- manual reconcile required" -ForegroundColor Red
    exit 1
}
catch {
    Write-Host "[reconcile] FATAL: $($_.Exception.Message)" -ForegroundColor Red
    exit 2
}
finally {
    Pop-Location
}
