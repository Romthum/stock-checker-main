@echo off
powershell -ExecutionPolicy Bypass -File "%~dp0restore-postgres.ps1" %*
