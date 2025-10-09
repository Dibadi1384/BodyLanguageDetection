@echo off
echo Installing Video Upload Application...
echo.

echo Installing Backend dependencies...
cd Backend
call npm install
if %errorlevel% neq 0 (
    echo Backend installation failed!
    pause
    exit /b 1
)
cd ..

echo.
echo Installing Frontend dependencies...
cd Frontend
call npm install
if %errorlevel% neq 0 (
    echo Frontend installation failed!
    pause
    exit /b 1
)
cd ..

echo.
echo Installation completed successfully!
echo.
echo To start the application:
echo 1. Open two terminal windows
echo 2. In first terminal: cd Backend ^&^& npm start
echo 3. In second terminal: cd Frontend ^&^& npm start
echo 4. Open http://localhost:3000 in your browser
echo.
pause

