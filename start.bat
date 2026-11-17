@echo off
chcp 65001 > nul
echo ========================================================
echo   学祭ピザ屋 呼び出し＆注文管理システム 起動中...
echo ========================================================
echo.
cd /d "%~dp0"

if exist "%LOCALAPPDATA%\Programs\Python\Python312\python.exe" (
    set "PYTHON_EXE=%LOCALAPPDATA%\Programs\Python\Python312\python.exe"
) else (
    set "PYTHON_EXE=python"
)

echo システムを起動しています...
echo ブラウザで以下のURLを開いてください:
echo.
echo   【スタッフ管理画面 (ノートPC用)】
echo   http://127.0.0.1:8000/
echo.
echo   【店頭モニター画面 (呼出番号の特大表示)】
echo   http://127.0.0.1:8000/display
echo.
echo   【番号札＆QRコード印刷シート】
echo   http://127.0.0.1:8000/cards
echo.
echo ========================================================
echo 停止するにはこのウィンドウで Ctrl + C を押してください
echo ========================================================
echo.

start "" "http://127.0.0.1:8000/"
"%PYTHON_EXE%" main.py
pause
