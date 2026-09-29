#!/bin/bash
# Turn frames/f00000.jpg ... into an H.264 MP4 (yuv420p, faststart so it streams / previews everywhere).
# usage: ./encode.sh [fps=30] [crf=20] [out=../../video/pelican-express.mp4]
set -e
cd "$(dirname "$0")"
FPS=${1:-30}; CRF=${2:-20}; OUT=${3:-../../video/pelican-express.mp4}
mkdir -p "$(dirname "$OUT")"
ffmpeg -y -framerate "$FPS" -i frames/f%05d.jpg -c:v libx264 -preset slow -crf "$CRF" -pix_fmt yuv420p -movflags +faststart "$OUT"
