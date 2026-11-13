@echo off
chcp 65001 > nul
echo ========================================================
echo   学祭ピザ屋 呼び出し＆注文管理システム 起動中...
echo ========================================================
echo.
cd /d "%~dp0"

echo 依存パッケージの確認中...
python -m pip install -r requirements.txt > nul 2>&1

echo.
echo システムを起動しています...
echo ブラウザで以下のURLを開いてください:
echo.
echo   【スタッフ管理画面 (ノートPC用)】
echo   http://localhost:8000/
echo.
echo   【店頭モニター画面 (呼出番号の特大表示)】
echo   http://localhost:8000/display
echo.
echo   【番号札＆QRコード印刷シート】
echo   http://localhost:8000/cards
echo.
echo ========================================================
echo 停止するにはこのウィンドウで Ctrl + C を押してください
echo ========================================================
echo.

start http://localhost:8000/
python main.py
pause
