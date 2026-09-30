#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Deploy-gate lint: fail if a ?v=-stamped asset's CONTENT changed but its
    ?v= cache-bust stamp in index.html was NOT bumped.

.DESCRIPTION
    SWAT-20260628-0008 durable fix for the 3-layer superdash delivery-gap.

    superdash-server.py serves every ?v=-stamped asset as
    `Cache-Control: public, max-age=31536000, immutable` (L265-267). That means
    a browser or corporate proxy will serve the bytes cached under a given
    `path?v=STAMP` URL FOREVER, with no revalidation -- even on hard-refresh /
    incognito (the proxy cache is shared and ignores per-browser clears).

    Consequence: editing js/foo.js WITHOUT bumping its `?v=` stamp in index.html
    ships the new file under an UNCHANGED immutable URL -> every client keeps the
    OLD bytes. This silently defeated three correct fixes (v25/v26/v27) before it
    was root-caused. index.html itself is served must-revalidate/no-cache, so a
    *new* stamp always delivers on the next load -- the stamp bump is the entire
    delivery mechanism.

    This lint makes "edit an asset without bumping its stamp" a HARD deploy
    failure. It is content-hash based (NOT date-parsing the stamp), so it works
    regardless of stamp convention (dates, integers, swat-tags). Source of truth:
    a tracked manifest mapping each stamped asset -> { stamp, sha256 } as last
    shipped. The gate FAILS when an asset's current sha differs from the manifest
    sha while its stamp is unchanged from the manifest.

    Modes:
      -Check   (default) Gate. Exit 1 if any STALE-STAMP (content changed, stamp
               not bumped). Exit 0 if clean. Reports new/missing/cosmetic drift.
      -Init    Generate/overwrite the baseline manifest from current state.
               Run once to adopt; commit the manifest alongside.
      -Bump    Auto-remediate: for every asset whose content changed, rewrite its
               stamp in index.html to `<yyyyMMdd>-<sha8>` and refresh the manifest.
               Makes a stale ship structurally impossible when run pre-deploy.
      -SelfTest Self-contained synthetic proof that the gate fires + clears.

    FAIL-LOUD: non-zero exit on any stale stamp or internal error.

.NOTES
    Runtime-inert outside its own dir. Pure read in -Check; writes index.html +
    manifest only in -Init / -Bump.
#>
[CmdletBinding(DefaultParameterSetName = 'Check')]
param(
    [Parameter(ParameterSetName = 'Check')] [switch]$Check,
    [Parameter(ParameterSetName = 'Init')]  [switch]$Init,
    [Parameter(ParameterSetName = 'Bump')]  [switch]$Bump,
    [Parameter(ParameterSetName = 'SelfTest')] [switch]$SelfTest,
    [string]$DeployRoot = (Split-Path -Parent $PSScriptRoot),
    [string]$IndexFile,
    [string]$ManifestFile
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Resolve-Paths {
    param([string]$Root, [string]$Index, [string]$Manifest)
    if (-not $Index)    { $Index    = Join-Path $Root 'index.html' }
    if (-not $Manifest) { $Manifest = Join-Path $Root '.cache-stamp-manifest.json' }
    [pscustomobject]@{ Root = $Root; Index = $Index; Manifest = $Manifest }
}

# Parse index.html -> ordered list of @{ Path; Stamp; Raw } for every ?v=-stamped js/css asset.
function Get-StampedAssets {
    param([string]$IndexPath)
    if (-not (Test-Path -LiteralPath $IndexPath)) { throw "index not found: $IndexPath" }
    $text = Get-Content -LiteralPath $IndexPath -Raw
    $rx = [regex]'(?:src|href)="(?<path>[^"]+\.(?:js|css))\?v=(?<stamp>[^"]+)"'
    $out = @()
    foreach ($m in $rx.Matches($text)) {
        $out += [pscustomobject]@{
            Path  = $m.Groups['path'].Value
            Stamp = $m.Groups['stamp'].Value
            Raw   = $m.Value
        }
    }
    , $out
}

function Get-AssetSha {
    param([string]$Root, [string]$RelPath)
    $full = Join-Path $Root ($RelPath -replace '/', '\')
    if (-not (Test-Path -LiteralPath $full)) { return $null }
    (Get-FileHash -LiteralPath $full -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Read-Manifest {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) { return @{} }
    $raw = Get-Content -LiteralPath $Path -Raw
    if ([string]::IsNullOrWhiteSpace($raw)) { return @{} }
    $obj = $raw | ConvertFrom-Json
    $h = @{}
    foreach ($p in $obj.PSObject.Properties) {
        $h[$p.Name] = [pscustomobject]@{ stamp = $p.Value.stamp; sha256 = $p.Value.sha256 }
    }
    $h
}

function Write-Manifest {
    param([string]$Path, [hashtable]$Map)
    $ordered = [ordered]@{}
    foreach ($k in ($Map.Keys | Sort-Object)) {
        $ordered[$k] = [ordered]@{ stamp = $Map[$k].stamp; sha256 = $Map[$k].sha256 }
    }
    ($ordered | ConvertTo-Json -Depth 5) | Set-Content -LiteralPath $Path -Encoding UTF8
}

function Invoke-Init {
    param($P)
    $assets = Get-StampedAssets -IndexPath $P.Index
    $map = @{}
    $missing = 0
    foreach ($a in $assets) {
        $sha = Get-AssetSha -Root $P.Root -RelPath $a.Path
        if ($null -eq $sha) { Write-Warning "asset on disk missing (kept, sha=null): $($a.Path)"; $missing++; $sha = '' }
        $map[$a.Path] = [pscustomobject]@{ stamp = $a.Stamp; sha256 = $sha }
    }
    Write-Manifest -Path $P.Manifest -Map $map
    Write-Host "[INIT] manifest written: $($P.Manifest) ($($map.Count) assets, $missing missing-on-disk)" -ForegroundColor Cyan
    return 0
}

# Returns a result object; does not exit.
function Get-LintResult {
    param($P)
    $assets   = Get-StampedAssets -IndexPath $P.Index
    $manifest = Read-Manifest -Path $P.Manifest
    $stale = @(); $new = @(); $missing = @(); $cosmetic = @(); $ok = @()
    foreach ($a in $assets) {
        $sha = Get-AssetSha -Root $P.Root -RelPath $a.Path
        if ($null -eq $sha) { $missing += $a; continue }
        if (-not $manifest.ContainsKey($a.Path)) { $new += $a; continue }
        $rec = $manifest[$a.Path]
        $shaChanged   = ($rec.sha256 -ne $sha)
        $stampChanged = ($rec.stamp  -ne $a.Stamp)
        if ($shaChanged -and -not $stampChanged) {
            $stale += [pscustomobject]@{ Path = $a.Path; Stamp = $a.Stamp; OldSha = $rec.sha256; NewSha = $sha }
        }
        elseif (-not $shaChanged -and $stampChanged) { $cosmetic += $a }
        else { $ok += $a }
    }
    [pscustomobject]@{ Stale = $stale; New = $new; Missing = $missing; Cosmetic = $cosmetic; Ok = $ok; Total = $assets.Count }
}

function Invoke-Check {
    param($P)
    if (-not (Test-Path -LiteralPath $P.Manifest)) {
        Write-Host "[FAIL] no manifest ($($P.Manifest)); run -Init once to adopt the baseline." -ForegroundColor Red
        return 2
    }
    $r = Get-LintResult -P $P
    Write-Host "[lint] assets=$($r.Total) ok=$($r.Ok.Count) stale=$($r.Stale.Count) new=$($r.New.Count) cosmetic=$($r.Cosmetic.Count) missing=$($r.Missing.Count)"
    foreach ($n in $r.New)      { Write-Warning "NEW (not in manifest, run -Init or -Bump): $($n.Path) ?v=$($n.Stamp)" }
    foreach ($m in $r.Missing)  { Write-Warning "MISSING on disk (stamped but no file): $($m.Path)" }
    foreach ($c in $r.Cosmetic) { Write-Host  "  cosmetic stamp drift (content same): $($c.Path) ?v=$($c.Stamp)" -ForegroundColor DarkGray }
    if ($r.Stale.Count -gt 0) {
        Write-Host ""
        Write-Host "[FAIL] STALE STAMP -- content changed but ?v= NOT bumped; clients keep OLD bytes under the immutable URL:" -ForegroundColor Red
        foreach ($s in $r.Stale) {
            Write-Host ("  - {0}  ?v={1}  (sha {2}.. -> {3}..)" -f $s.Path, $s.Stamp, $s.OldSha.Substring(0,8), $s.NewSha.Substring(0,8)) -ForegroundColor Red
        }
        Write-Host "  FIX: bump each stamp in index.html (or run this script with -Bump), then redeploy." -ForegroundColor Yellow
        return 1
    }
    Write-Host "[OK] every changed asset has a bumped ?v= stamp." -ForegroundColor Green
    return 0
}

function Invoke-Bump {
    param($P)
    $r = Get-LintResult -P $P
    if ($r.Stale.Count -eq 0 -and $r.New.Count -eq 0) {
        Write-Host "[BUMP] nothing to bump (no stale/new stamps)." -ForegroundColor Green
        return 0
    }
    $text = Get-Content -LiteralPath $P.Index -Raw
    $manifest = Read-Manifest -Path $P.Manifest
    $date = (Get-Date).ToUniversalTime().ToString('yyyyMMdd')
    $changed = 0
    $toBump = @($r.Stale | ForEach-Object { $_.Path }) + @($r.New | ForEach-Object { $_.Path })
    foreach ($path in ($toBump | Select-Object -Unique)) {
        $sha = Get-AssetSha -Root $P.Root -RelPath $path
        if ($null -eq $sha) { continue }
        $newStamp = "$date-$($sha.Substring(0,8))"
        $escPath = [regex]::Escape($path)
        $attrRx = [regex]"(?<pre>(?:src|href)=`"$escPath)\?v=[^`"]+`""
        $newText = $attrRx.Replace($text, "`${pre}?v=$newStamp`"", 1)
        if ($newText -ne $text) {
            $text = $newText
            $manifest[$path] = [pscustomobject]@{ stamp = $newStamp; sha256 = $sha }
            Write-Host "  bumped $path -> ?v=$newStamp" -ForegroundColor Cyan
            $changed++
        }
        else { Write-Warning "could not rewrite stamp for $path (attribute not matched)" }
    }
    if ($changed -gt 0) {
        Set-Content -LiteralPath $P.Index -Value $text -Encoding UTF8 -NoNewline:$false
        # refresh manifest for any unchanged-but-tracked too, so sha drift stays consistent
        Write-Manifest -Path $P.Manifest -Map $manifest
        Write-Host "[BUMP] $changed stamp(s) bumped + manifest refreshed." -ForegroundColor Green
    }
    return 0
}

function Invoke-SelfTest {
    $tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("cachestamp-selftest-" + [guid]::NewGuid().ToString('N').Substring(0,8))
    New-Item -ItemType Directory -Force -Path (Join-Path $tmp 'js') | Out-Null
    $fail = 0
    try {
        $idx = Join-Path $tmp 'index.html'
        $man = Join-Path $tmp '.cache-stamp-manifest.json'
        $js  = Join-Path $tmp 'js\foo.js'
        Set-Content -LiteralPath $js -Value "console.log('v1');" -Encoding UTF8
        Set-Content -LiteralPath $idx -Value '<script src="js/foo.js?v=aaa"></script>' -Encoding UTF8
        $P = Resolve-Paths -Root $tmp -Index $idx -Manifest $man

        # 1) Init baseline -> Check clean
        [void](Invoke-Init -P $P)
        $rc = (Invoke-Check -P $P)
        if ($rc -ne 0) { Write-Host "  [selftest] FAIL: clean baseline should pass (rc=$rc)" -ForegroundColor Red; $fail++ }
        else { Write-Host "  [selftest] ok: clean baseline passes" -ForegroundColor Green }

        # 2) Edit asset WITHOUT bumping stamp -> Check must FAIL (rc=1)
        Set-Content -LiteralPath $js -Value "console.log('v2-edited');" -Encoding UTF8
        $rc = (Invoke-Check -P $P)
        if ($rc -ne 1) { Write-Host "  [selftest] FAIL: stale stamp should fail rc=1 (got $rc)" -ForegroundColor Red; $fail++ }
        else { Write-Host "  [selftest] ok: stale stamp correctly FAILS" -ForegroundColor Green }

        # 3) Bump -> Check clean again
        [void](Invoke-Bump -P $P)
        $rc = (Invoke-Check -P $P)
        if ($rc -ne 0) { Write-Host "  [selftest] FAIL: after -Bump should pass (rc=$rc)" -ForegroundColor Red; $fail++ }
        else { Write-Host "  [selftest] ok: after -Bump passes" -ForegroundColor Green }

        # 4) Negative: bump stamp WITHOUT editing content -> cosmetic, still passes
        $txt = (Get-Content -LiteralPath $idx -Raw) -replace '\?v=[^"]+"', '?v=cosmetic-xyz"'
        Set-Content -LiteralPath $idx -Value $txt -Encoding UTF8
        $rc = (Invoke-Check -P $P)
        if ($rc -ne 0) { Write-Host "  [selftest] FAIL: cosmetic-only stamp drift should pass (rc=$rc)" -ForegroundColor Red; $fail++ }
        else { Write-Host "  [selftest] ok: cosmetic stamp drift (no content change) passes" -ForegroundColor Green }
    }
    finally {
        Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
    }
    if ($fail -eq 0) { Write-Host "[SELFTEST] PASS (4/4)" -ForegroundColor Green; return 0 }
    Write-Host "[SELFTEST] FAIL ($fail case(s))" -ForegroundColor Red; return 1
}

# ---- dispatch ----
try {
    if ($SelfTest) { exit (Invoke-SelfTest) }
    $P = Resolve-Paths -Root $DeployRoot -Index $IndexFile -Manifest $ManifestFile
    if ($Init)      { exit (Invoke-Init  -P $P) }
    elseif ($Bump)  { exit (Invoke-Bump  -P $P) }
    else            { exit (Invoke-Check -P $P) }
}
catch {
    Write-Host "[ERROR] $($_.Exception.Message)" -ForegroundColor Red
    exit 2
}
