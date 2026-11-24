@echo off
rem NotionCronoTool - double-click this file to start the tool.
rem It checks that everything is in place and then runs launcher.py.

chcp 65001 > nul
cd /d "%~dp0"
title NotionCronoTool

if not exist ".venv\Scripts\python.exe" (
  echo.
  echo   No trobo l'entorn virtual de Python, la carpeta .venv.
  echo   Segueix els passos d'instal·lació del README.md i torna-ho a provar.
  echo.
  pause
  exit /b 1
)

if not exist ".env" (
  echo.
  echo   Falta el fitxer .env, amb el token i els identificadors de Notion.
  echo   Copia .env.example com a .env i omple'l: ho explica el README.md.
  echo.
  pause
  exit /b 1
)

if not exist "config\plan.toml" (
  copy "config\plan.example.toml" "config\plan.toml" > nul
  echo.
  echo   He creat config\plan.toml a partir de l'exemple.
  echo   Quan vulguis, obre'l i posa-hi les teves hores previstes.
)

".venv\Scripts\python.exe" launcher.py

rem If something went wrong, keep the window open so the message can be read.
if errorlevel 1 pause
