@echo off
cd /d "%~dp0"
rem Set a unique secret in your own environment before starting this relay.
rem Do not commit or share that value.
if "%DCA_RELAY_API_KEY%"=="" (
  echo DCA_RELAY_API_KEY is required. Set it in your environment and try again.
  exit /b 1
)
set RELAY_HOST=127.0.0.1
set DCA_RELAY_PORT=8787
set IBKR_HOST=127.0.0.1
set IBKR_PORT=4001
python -u relay.py
