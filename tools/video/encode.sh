#!/bin/bash
# Turn frames/f00000.jpg ... into an H.264 MP4 (yuv420p, faststart so it streams / previews everywhere),
# with the soundtrack muxed in as AAC when the WAV exists (make it with tools/music/make_music.py).
# usage: ./encode.sh [fps=30] [crf=26] [out=../../video/pelican-express.mp4] [audio=../music/pelican-express.wav]
set -e
cd "$(dirname "$0")"
FPS=${1:-30}; CRF=${2:-26}; OUT=${3:-../../video/pelican-express.mp4}; AUDIO=${4:-../music/pelican-express.wav}
mkdir -p "$(dirname "$OUT")"
if [ -f "$AUDIO" ]; then
  ffmpeg -y -framerate "$FPS" -i frames/f%05d.jpg -i "$AUDIO" \
    -map 0:v -map 1:a -c:v libx264 -preset slow -crf "$CRF" -pix_fmt yuv420p \
    -c:a aac -b:a 160k -af "volume=-1.5dB,afade=t=out:st=89.6:d=1.4" -shortest -movflags +faststart "$OUT"
else
  echo "no soundtrack at $AUDIO - encoding silent video"
  ffmpeg -y -framerate "$FPS" -i frames/f%05d.jpg -c:v libx264 -preset slow -crf "$CRF" -pix_fmt yuv420p -movflags +faststart "$OUT"
fi
