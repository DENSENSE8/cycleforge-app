<#
  Cycle Forge - Windows headless compute + inference node provisioning
  ---------------------------------------------------------------------------
  Turns THIS Windows box (RTX 5070 Ti) into the always-on SSH + Ollama node the
  Mac drives. Closes the system/security gaps an unprivileged agent cannot:
  starts OpenSSH Server, wires key-based auth, and (optionally) makes Ollama
  boot headlessly without an interactive login.

  RUN ELEVATED (right-click PowerShell > Run as administrator), then:
      Set-ExecutionPolicy -Scope Process Bypass -Force
      .\windows-headless-provision.ps1 -PublicKey "ssh-ed25519 AAAA... you@mac"

  Params:
    -PublicKey     Your Mac's PUBLIC key (~/.ssh/id_ed25519.pub). Appended to the
                   admin authorized_keys with correct ACLs. Omit to set up SSH
                   without a key (you can paste one later).
    -SetPwshShell  Make the SSH default shell PowerShell instead of cmd.exe.
    -OllamaBootTask Register 'ollama serve' as a boot Scheduled Task so inference
                   is up after a reboot with NO login (headless). Default: login
                   autostart (already configured) is left as-is unless you pass this.
#>
[CmdletBinding()]
param(
  [string]$PublicKey = '',
  [switch]$SetPwshShell,
  [switch]$OllamaBootTask
)

$ErrorActionPreference = 'Stop'
function Note($m){ Write-Host "  $m" -ForegroundColor Cyan }
function Ok($m){ Write-Host "  [ok] $m" -ForegroundColor Green }
function Warn($m){ Write-Host "  [! ] $m" -ForegroundColor Yellow }

# --- elevation guard ---------------------------------------------------------
$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) { Write-Error "Run this in an ELEVATED PowerShell (Run as administrator)."; exit 1 }

Write-Host "`n== 1/5  OpenSSH Server ==" -ForegroundColor White
$cap = Get-WindowsCapability -Online | Where-Object Name -like 'OpenSSH.Server*'
if ($cap.State -ne 'Installed') {
  Note "installing OpenSSH.Server capability..."
  Add-WindowsCapability -Online -Name $cap.Name | Out-Null
  Ok "OpenSSH.Server installed"
} else { Ok "OpenSSH.Server already installed" }

Set-Service -Name sshd -StartupType Automatic
Set-Service -Name ssh-agent -StartupType Automatic
Start-Service sshd
Start-Service ssh-agent
Ok "sshd + ssh-agent set Automatic and started"

# firewall (rule usually already exists after capability install)
if (-not (Get-NetFirewallRule -Name 'OpenSSH-Server-In-TCP' -ErrorAction SilentlyContinue)) {
  New-NetFirewallRule -Name 'OpenSSH-Server-In-TCP' -DisplayName 'OpenSSH Server (sshd)' `
    -Enabled True -Direction Inbound -Protocol TCP -Action Allow -LocalPort 22 -Profile Private,Domain | Out-Null
  Ok "firewall rule created (TCP 22, Private/Domain)"
} else { Ok "firewall rule present" }

Write-Host "`n== 2/5  SSH default shell ==" -ForegroundColor White
if ($SetPwshShell) {
  $pwsh = (Get-Command pwsh -ErrorAction SilentlyContinue).Source
  if (-not $pwsh) { $pwsh = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe' }
  New-ItemProperty -Path 'HKLM:\SOFTWARE\OpenSSH' -Name DefaultShell -Value $pwsh -PropertyType String -Force | Out-Null
  Ok "SSH default shell = $pwsh"
} else { Note "leaving default shell (cmd.exe). Re-run with -SetPwshShell to change." }

Write-Host "`n== 3/5  Key-based auth (admin user) ==" -ForegroundColor White
# Admin users authenticate via %ProgramData%\ssh\administrators_authorized_keys
$akAdmin = Join-Path $env:ProgramData 'ssh\administrators_authorized_keys'
if (-not (Test-Path $akAdmin)) { New-Item -ItemType File -Path $akAdmin -Force | Out-Null; Ok "created $akAdmin" }
if ($PublicKey -and $PublicKey.Trim()) {
  $existing = Get-Content $akAdmin -ErrorAction SilentlyContinue
  if ($existing -notcontains $PublicKey.Trim()) {
    Add-Content -Path $akAdmin -Value $PublicKey.Trim()
    Ok "appended your public key"
  } else { Ok "public key already present" }
} else {
  Warn "no -PublicKey given. Paste your Mac key into: $akAdmin"
  Warn "  (on the Mac: cat ~/.ssh/id_ed25519.pub  - generate with: ssh-keygen -t ed25519)"
}
# The ACL fix that makes admin key auth actually work (else sshd silently ignores it)
icacls $akAdmin /inheritance:r | Out-Null
icacls $akAdmin /grant 'Administrators:F' 'SYSTEM:F' | Out-Null
Ok "authorized_keys ACLs locked to Administrators + SYSTEM"
Restart-Service sshd
Ok "sshd restarted"

Write-Host "`n== 4/5  Ollama inference node ==" -ForegroundColor White
$ollama = (Get-Command ollama -ErrorAction SilentlyContinue).Source
if (-not $ollama) { Warn "ollama not on PATH for this session; it is installed per-user." }
$host11434 = [Environment]::GetEnvironmentVariable('OLLAMA_HOST','User')
if ($host11434 -ne '0.0.0.0:11434') {
  [Environment]::SetEnvironmentVariable('OLLAMA_HOST','0.0.0.0:11434','User')
  Ok "set OLLAMA_HOST=0.0.0.0:11434 (LAN-reachable) - restart Ollama to apply"
} else { Ok "OLLAMA_HOST already 0.0.0.0:11434 (LAN-reachable)" }
if ($OllamaBootTask) {
  if ($ollama) {
    $act = New-ScheduledTaskAction -Execute $ollama -Argument 'serve'
    $trg = New-ScheduledTaskTrigger -AtStartup
    $prin = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
    Register-ScheduledTask -TaskName 'OllamaServe' -Action $act -Trigger $trg -Principal $prin -Force | Out-Null
    Ok "registered 'OllamaServe' Scheduled Task (starts at boot, no login needed)"
    Warn "note: a SYSTEM-run 'ollama serve' keeps its own model store; you may re-pull models under SYSTEM."
  } else { Warn "cannot register boot task - ollama.exe not found for SYSTEM" }
} else { Note "Ollama already autostarts at login. Pass -OllamaBootTask for login-less boot start." }

Write-Host "`n== 5/5  Static IP reservation (do on your router) ==" -ForegroundColor White
Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -ne $null } | ForEach-Object {
  $mac = (Get-NetAdapter -InterfaceIndex $_.InterfaceIndex).MacAddress
  Note ("iface={0}  ip={1}  gateway={2}  mac={3}" -f $_.InterfaceAlias, $_.IPv4Address.IPAddress, $_.IPv4DefaultGateway.NextHop, $mac)
}
Warn "On the router (ASUS @ http://192.168.50.1): LAN > DHCP Server > Manual Assignment:"
Warn "  bind the MAC above to its current IP so it never changes."

Write-Host "`n== Done ==" -ForegroundColor White
Note "From the Mac:  ssh $env:USERNAME@<reserved-ip>"
Note "Inference:     curl http://<reserved-ip>:11434/api/tags"
Note "Forward in Cursor Remote-SSH: 3050 (web via WSL) and 11434/8642 (inference/Hermes)."
