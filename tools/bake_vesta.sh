#!/bin/bash
# Bakes the Vesta-preset library with GaeaButBetter (run from anywhere).
cd /c/Users/ofici/Downloads/GaeaButBetter
for s in 11 23 37 41 59 67 73 89; do
  out=/c/Users/ofici/Downloads/BSP/tools/vesta_raw/v$s
  [ -f "$out/height.png" ] && continue
  python generate.py --preset vesta --seed $s --size 1024 --no-preview --out "$out" > "$out.log" 2>&1
  echo "done $s"
done
