@echo off
if "%~1"=="" (
  echo Usage: encode-720p.bat input-video.mp4
  pause
  exit /b 1
)
ffmpeg -i "%~1" -vf "scale=-2:720" -c:v libx264 -preset medium -b:v 1400k -maxrate 1600k -bufsize 2800k -c:a aac -b:a 128k -movflags +faststart "%~dpn1-720p.mp4"
pause
