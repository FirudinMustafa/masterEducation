@echo off
REM Master Education - PostgreSQL 18 durum kontrol

setlocal
set "PG_HOME=C:\Program Files\PostgreSQL\18"
set "PG_DATA=%PG_HOME%\data"

"%PG_HOME%\bin\pg_ctl.exe" -D "%PG_DATA%" status

endlocal & exit /b %ERRORLEVEL%
