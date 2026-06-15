@echo off
powershell -ExecutionPolicy Bypass -File "%~dp0backup-postgres.ps1" %*
