@echo off
REM Master Education - PostgreSQL 18 durdurma scripti

setlocal
set "PG_HOME=C:\Program Files\PostgreSQL\18"
set "PG_DATA=%PG_HOME%\data"

echo [db-stop] PostgreSQL 18 durduruluyor...
"%PG_HOME%\bin\pg_ctl.exe" -D "%PG_DATA%" -m fast stop
set "RC=%ERRORLEVEL%"

if "%RC%"=="0" (
  echo [db-stop] OK - PostgreSQL durduruldu.
) else (
  echo [db-stop] HATA ^(exit %RC%^).
)

endlocal & exit /b %RC%
