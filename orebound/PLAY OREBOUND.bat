@echo off
title  OREBOUND
cd /d "%~dp0"

rem  Orebound is built from JavaScript modules and runs terrain generation on
rem  background worker threads. Browsers refuse to load either of those over
rem  file://, so double-clicking index.html shows a black "loading" screen and
rem  nothing else. This starts a small local server instead and opens the game
rem  in your browser. Nothing is installed and nothing goes over the internet.

where node >nul 2>&1
if %errorlevel%==0 (
  echo  Starting Orebound...
  node serve.mjs 8080 --open
  goto :done
)

set PY=
py -3 -c "import sys" >nul 2>&1 && set PY=py -3
if not defined PY python -c "import sys" >nul 2>&1 && set PY=python
if not defined PY python3 -c "import sys" >nul 2>&1 && set PY=python3

if defined PY (
  echo  Node was not found, using Python to serve the game instead.
  start "" http://localhost:8080/
  %PY% -m http.server 8080
  goto :done
)

echo.
echo   Orebound needs either Node.js or Python to run its local server,
echo   and neither was found on this computer.
echo.
echo   Install Node.js from https://nodejs.org/ (the LTS button is fine),
echo   then double-click this file again.
echo.
pause

:done
