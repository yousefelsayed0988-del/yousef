@echo off
title  Build HOLLOWMERE.exe
cd /d "%~dp0"
echo.
echo  ============================================
echo    HOLLOWMERE  -  building HOLLOWMERE.exe
echo  ============================================
echo.

set PY=
py -3 -c "import sys" >nul 2>&1 && set PY=py -3
if not defined PY python -c "import sys" >nul 2>&1 && set PY=python
if not defined PY python3 -c "import sys" >nul 2>&1 && set PY=python3
if not defined PY (
  echo  Python was not found on this PC.
  echo.
  echo  Install it from  https://www.python.org/downloads/  and
  echo  TICK the box that says "Add python.exe to PATH", then run
  echo  this file again.
  echo.
  echo  You do not need the EXE to play - just double-click
   echo  "PLAY HOLLOWMERE.bat" or open index.html in your browser.
  echo.
  pause
  exit /b 1
)
echo  Using: %PY%
echo.
echo  [1/3] installing PyInstaller (needs internet, one time only)
%PY% -m pip install --upgrade --quiet pip
%PY% -m pip install --upgrade --quiet pyinstaller
if errorlevel 1 (
  echo.
  echo  PyInstaller could not be installed. Check your internet
  echo  connection, or your antivirus, and try again.
  echo.
  pause
  exit /b 1
)
echo.
echo  [2/3] compiling - this takes a minute or two
%PY% -m PyInstaller --onefile --noconsole --clean --name HOLLOWMERE --icon HOLLOWMERE.ico --add-data "index.html;." hollowmere.py
if errorlevel 1 (
  echo.
  echo  The build failed. Scroll up for the reason.
  echo.
  pause
  exit /b 1
)
echo.
echo  [3/3] tidying up
if exist "HOLLOWMERE.exe" del /q "HOLLOWMERE.exe"
move /y "dist\\HOLLOWMERE.exe" "HOLLOWMERE.exe" >nul
rmdir /s /q build >nul 2>&1
rmdir /s /q dist >nul 2>&1
del /q HOLLOWMERE.spec >nul 2>&1
echo.
echo  ============================================
echo    Done.  HOLLOWMERE.exe is in this folder.
echo    Double-click it to play.
echo  ============================================
echo.
pause
