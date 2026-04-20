# Run in elevated PowerShell after WSL restarts to refresh port proxy rules
$wsl = (wsl hostname -I).Trim().Split()[0]

foreach ($port in @(24283, 8080)) {
    netsh interface portproxy delete v4tov4 listenport=$port listenaddress=0.0.0.0 2>$null
    netsh interface portproxy add v4tov4 listenport=$port listenaddress=0.0.0.0 connectport=$port connectaddress=$wsl
    Write-Host "Port $port → $wsl"
}

netsh interface portproxy show v4tov4
