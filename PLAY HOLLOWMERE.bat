@echo off
title  HOLLOWMERE
cd /d "%~dp0"

rem  The build script points people at this file, so it had better exist.
rem  It runs the launcher, which serves the game on localhost and opens it
rem  in an app window. No install, no EXE, no internet.

set PY=
py -3 -c "import sys" >nul 2>&1 && set PY=py -3
if not defined PY python -c "import sys" >nul 2>&1 && set PY=python
if not defined PY python3 -c "import sys" >nul 2>&1 && set PY=python3

if defined PY (
  %PY% hollowmere.py
) else (
  echo  Python was not found, so opening index.html directly instead.
  echo  The game runs fine that way - the launcher only exists to give it
  echo  its own window.
  echo.
  start "" "index.html"
  timeout /t 4 >nul
)
