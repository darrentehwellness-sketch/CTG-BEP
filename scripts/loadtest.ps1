# ═════════════════════════════════════════════════════════════════
# CTG Finance Hub — Supabase Load Test (PowerShell 5.1 compatible)
# ─────────────────────────────────────────────────────────────────
# Uses .NET Runspaces (built-in to PS 5.1, no module needed) to
# fire N concurrent HTTP requests against Supabase. Measures
# p50/p95/p99 latency. Read-only, non-invasive.
# Usage:  PowerShell -ExecutionPolicy Bypass -File .\loadtest.ps1
# ═════════════════════════════════════════════════════════════════

$SUPA_URL = 'https://msdfzzvdmmqzwcnxtrfn.supabase.co'
$ANON_KEY = 'sb_publishable_me0hUg0CqBfg12-Fpx4rzg_EL05d0Lx'

$Stages = @(
  @{ concurrency = 1;  duration = 4 },   # warm-up
  @{ concurrency = 10; duration = 8 },
  @{ concurrency = 25; duration = 8 },
  @{ concurrency = 50; duration = 8 }
)

$Endpoints = @(
  @{ name = 'Auth health'; path = '/auth/v1/health' },
  @{ name = 'REST root';   path = '/rest/v1/' }
)

function Get-Percentile([double[]] $values, [double] $p) {
  if (-not $values -or $values.Count -eq 0) { return 0 }
  $sorted = ($values | Sort-Object)
  $rank = [Math]::Ceiling(($p / 100.0) * $sorted.Count) - 1
  if ($rank -lt 0) { $rank = 0 }
  if ($rank -ge $sorted.Count) { $rank = $sorted.Count - 1 }
  return $sorted[$rank]
}

# Worker script — runs on each thread until the stage end time.
$worker = {
  param($url, $key, $endTime, $results, $errors)
  $req = @{ Uri = $url; Headers = @{ 'apikey' = $key }; UseBasicParsing = $true; TimeoutSec = 10; Method = 'GET' }
  while ((Get-Date) -lt $endTime) {
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    try {
      $null = Invoke-WebRequest @req
      $sw.Stop()
      [void]$results.Add($sw.Elapsed.TotalMilliseconds)
    } catch {
      $sw.Stop()
      [void]$errors.Add($_.Exception.Message)
    }
  }
}

function Run-Stage([int] $concurrency, [int] $durationSec, [hashtable] $endpoint) {
  $endTime = (Get-Date).AddSeconds($durationSec)
  $results = [System.Collections.Concurrent.ConcurrentBag[double]]::new()
  $errors  = [System.Collections.Concurrent.ConcurrentBag[string]]::new()

  # Build a runspace pool sized to our concurrency.
  $pool = [RunspaceFactory]::CreateRunspacePool(1, $concurrency)
  $pool.Open()

  $handles = @()
  for ($i = 0; $i -lt $concurrency; $i++) {
    $ps = [PowerShell]::Create()
    $ps.RunspacePool = $pool
    [void]$ps.AddScript($worker)
    [void]$ps.AddArgument("$SUPA_URL$($endpoint.path)")
    [void]$ps.AddArgument($ANON_KEY)
    [void]$ps.AddArgument($endTime)
    [void]$ps.AddArgument($results)
    [void]$ps.AddArgument($errors)
    $handles += [PSCustomObject]@{ PS = $ps; Async = $ps.BeginInvoke() }
  }

  foreach ($h in $handles) {
    [void]$h.PS.EndInvoke($h.Async)
    $h.PS.Dispose()
  }
  $pool.Close()
  $pool.Dispose()

  $latencies = @($results.ToArray())
  $errArr    = @($errors.ToArray())
  $total     = $latencies.Count + $errArr.Count
  $rps       = if ($durationSec -gt 0) { [Math]::Round($total / $durationSec, 1) } else { 0 }

  [PSCustomObject]@{
    Endpoint    = $endpoint.name
    Concurrency = $concurrency
    Requests    = $total
    Errors      = $errArr.Count
    RPS         = $rps
    p50_ms      = if ($latencies.Count -gt 0) { [Math]::Round((Get-Percentile $latencies 50), 1) } else { 0 }
    p95_ms      = if ($latencies.Count -gt 0) { [Math]::Round((Get-Percentile $latencies 95), 1) } else { 0 }
    p99_ms      = if ($latencies.Count -gt 0) { [Math]::Round((Get-Percentile $latencies 99), 1) } else { 0 }
    avg_ms      = if ($latencies.Count -gt 0) { [Math]::Round(($latencies | Measure-Object -Average).Average, 1) } else { 0 }
    max_ms      = if ($latencies.Count -gt 0) { [Math]::Round(($latencies | Measure-Object -Maximum).Maximum, 1) } else { 0 }
  }
}

Write-Host ''
Write-Host '=================================================================' -ForegroundColor Cyan
Write-Host '  CTG Finance Hub - Supabase Load Test' -ForegroundColor Cyan
Write-Host "  Target: $SUPA_URL" -ForegroundColor Gray
Write-Host "  Started: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Gray
Write-Host '=================================================================' -ForegroundColor Cyan
Write-Host ''

$allResults = @()
foreach ($endpoint in $Endpoints) {
  Write-Host "--- Endpoint: $($endpoint.name) --- (GET $($endpoint.path))" -ForegroundColor Yellow
  foreach ($stage in $Stages) {
    Write-Host ("  Concurrency {0,3} for {1}s ... " -f $stage.concurrency, $stage.duration) -NoNewline
    $result = Run-Stage -concurrency $stage.concurrency -durationSec $stage.duration -endpoint $endpoint
    $allResults += $result
    $errFlag = if ($result.Errors -gt 0) { ' [ERRORS]' } else { '' }
    Write-Host ("done. {0,5} req, {1,4} RPS, p50 {2,5}ms, p95 {3,6}ms, p99 {4,6}ms{5}" -f $result.Requests, $result.RPS, $result.p50_ms, $result.p95_ms, $result.p99_ms, $errFlag) -ForegroundColor Green
  }
  Write-Host ''
}

Write-Host '=================================================================' -ForegroundColor Cyan
Write-Host '  Summary' -ForegroundColor Cyan
Write-Host '=================================================================' -ForegroundColor Cyan
$allResults | Format-Table -AutoSize

$failed = $allResults | Where-Object { $_.Errors -gt 0 -or $_.p95_ms -gt 1500 }
if ($failed) {
  Write-Host ''
  Write-Host 'WARN: stages exceeded p95 1500ms or had errors:' -ForegroundColor Yellow
  $failed | Format-Table -AutoSize
} else {
  Write-Host ''
  Write-Host 'PASS: all stages stayed under p95 1500ms with zero errors.' -ForegroundColor Green
}
