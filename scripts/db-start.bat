@echo off
REM Master Education - PostgreSQL 18 baslatma scripti
REM Cift tikla ya da `scripts\db-start.bat` ile calistir.

setlocal
set "PG_HOME=C:\Program Files\PostgreSQL\18"
set "PG_DATA=%PG_HOME%\data"
set "PG_LOG=%TEMP%\pg-master-edu.log"

echo [db-start] PostgreSQL 18 baslatiliyor...
echo [db-start] Data:  %PG_DATA%
echo [db-start] Log:   %PG_LOG%
echo.

"%PG_HOME%\bin\pg_ctl.exe" -D "%PG_DATA%" -l "%PG_LOG%" start
set "RC=%ERRORLEVEL%"

echo.
if "%RC%"=="0" (
  echo [db-start] OK - PostgreSQL calisiyor ^(localhost:5432^).
) else (
  echo [db-start] HATA ^(exit %RC%^). Log:  type "%PG_LOG%"
)

endlocal & exit /b %RC%
