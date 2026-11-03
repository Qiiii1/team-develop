@echo off
set "OK_AH_PREVIEW_ROOT=%~dp0"
powershell -NoProfile -Command "$previewFile = Join-Path $env:OK_AH_PREVIEW_ROOT 'server.mjs'; if (-not (Get-NetTCPConnection -LocalPort 4178 -State Listen -ErrorAction SilentlyContinue)) { Start-Process -FilePath 'node' -ArgumentList ([char]34 + $previewFile + [char]34) -WindowStyle Hidden; Start-Sleep -Milliseconds 700 }; Start-Process 'http://127.0.0.1:4178/'"
