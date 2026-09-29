#!/bin/bash
# Assemble src/* into the single self-contained index.html and syntax-check the module body.
set -e
cd "$(dirname "$0")"
cat src/p0_head.html src/p1_data.js src/p2_signs.js src/p3_world.js src/p4_bike.js src/p5_pelican.js src/p6_main.js src/p9_tail.html > index.html
wc -c -l index.html
sed -n '/<script type="module">/,/<\/script>/p' index.html | sed '1d;$d' > "${TMPDIR:-/tmp}/pelican_body.mjs"
node --check "${TMPDIR:-/tmp}/pelican_body.mjs" && echo "syntax OK"
