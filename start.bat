@echo off
chcp 65001 >nul
title OpsDesk
cd /d "%~dp0"
set PORT=5173
set URL=http://localhost:%PORT%/index.html

echo.
echo   ==========================================
echo              OpsDesk 启动器
echo   ==========================================
echo.

where py >nul 2>nul
if %errorlevel%==0 goto :run_py
where python >nul 2>&1
if %errorlevel%==0 goto :run_python

echo   ! 未检测到 Python，退回「直接打开文件」模式
echo     （功能完全可用，数据同样保存在本机浏览器）
echo.
start "" "index.html"
pause
exit /b 0

:run_py
echo   . 正在启动本地服务 (py -3 serve.py %PORT%) ...
start "" "%URL%"
py -3 serve.py %PORT%
goto :done

:run_python
echo   . 正在启动本地服务 (python serve.py %PORT%) ...
start "" "%URL%"
python serve.py %PORT%
goto :done

:done
echo.
echo   . 服务已结束。按任意键关闭此窗口。
pause >nul
exit /b 0
