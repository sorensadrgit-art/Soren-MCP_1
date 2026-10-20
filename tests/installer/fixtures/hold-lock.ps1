param([string]$Target, [string]$Ready, [string]$Release)
$ErrorActionPreference = 'Stop'
$stream = [System.IO.File]::Open($Target, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::None)
try {
  [System.IO.File]::WriteAllText($Ready, 'ready')
  $deadline = [DateTime]::UtcNow.AddSeconds(15)
  while (![System.IO.File]::Exists($Release) -and [DateTime]::UtcNow -lt $deadline) { Start-Sleep -Milliseconds 20 }
} finally { $stream.Dispose() }
