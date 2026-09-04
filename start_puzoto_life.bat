@echo off
title Puzoto Life - Launcher
echo Iniciando Puzoto Life em segundo plano...

:: Inicia os servidores concorrentemente de forma oculta (silenciosa)
powershell -Command "Start-Process cmd.exe -ArgumentList '/c npm run dev:all' -WindowStyle Hidden"

echo Aguardando os servidores iniciarem...
ping -n 6 127.0.0.1 >nul

:: Abre o navegador
start http://localhost:5174

echo Puzoto Life foi iniciado com sucesso!
exit
