#!/bin/sh
set -eu
cd Frontend
TMP=$(mktemp /tmp/fe-vitest-debug-XXXXXXXX.log)
npx vitest run src/components/SqlPatientModule.test.jsx > "$TMP" 2>&1
FE=$?
echo "vitest exit=$FE"
echo "=== FULL captured ==="
cat "$TMP"
rm -f "$TMP"
