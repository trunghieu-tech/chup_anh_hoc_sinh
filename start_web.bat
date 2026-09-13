@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Web chụp ảnh học sinh
node server.js
pause
