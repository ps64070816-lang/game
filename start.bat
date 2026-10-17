@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo LAS VEGAS HOLD'EM - Python backend starting...
python server.py
if errorlevel 1 (
  echo Python not found. Opening index.html directly.
  start "" "%~dp0index.html"
)
