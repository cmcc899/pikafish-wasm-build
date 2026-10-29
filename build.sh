#!/usr/bin/env bash
# 多线程浏览器构建：SINGLE_FILE 内嵌 wasm；pthread 搜索线程池（需 SAB/COOP/COEP，否则降级 JS）
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/pikafish-src" && pwd)
src_dir="$repo_root/src"
out_dir="${1:-$repo_root/dist/wasm}"

mkdir -p "$out_dir"

mapfile -t source_paths < <(find "$src_dir" -name '*.cpp' -not -path '*/universal/*' | sort)

em++ \
  "${source_paths[@]}" \
  -I"$src_dir" \
  -std=c++17 \
  -O3 -funroll-loops \
  -DNDEBUG \
  -DIS_64BIT \
  -DNO_PREFETCH \
  -DUSE_POPCNT \
  -DUSE_SSE2 -msse2 \
  -DUSE_SSSE3 -mssse3 \
  -DUSE_SSE41 -msse4.1 \
  -DUSE_SLOPPY_ATOMICS \
  -msimd128 \
  -pthread \
  -fno-exceptions \
  -sWASM=1 \
  -sSINGLE_FILE=1 \
  -sMODULARIZE=1 \
  -sEXPORT_NAME=Pikafish \
  -sENVIRONMENT=web,worker,node \
  -sEXPORTED_FUNCTIONS=_pikafish_initialize,_pikafish_command,_main,_malloc,_free \
  -sEXPORTED_RUNTIME_METHODS=cwrap,ccall,FS \
  -sINITIAL_MEMORY=256MB \
  -sALLOW_MEMORY_GROWTH=1 \
  -sMAXIMUM_MEMORY=1GB \
  -sSTACK_SIZE=3MB \
  -sPTHREAD_POOL_SIZE=8 \
  -sPTHREAD_POOL_SIZE_STRICT=0 \
  -sNO_EXIT_RUNTIME=1 \
  -sINVOKE_RUN=0 \
  -o "$out_dir/pikafish.js"

cp "$repo_root/Copying.txt" "$out_dir/COPYING.txt"
echo "built: $out_dir/pikafish.js ($(wc -c < "$out_dir/pikafish.js") bytes)"
