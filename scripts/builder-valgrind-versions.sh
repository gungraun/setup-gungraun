#!/usr/bin/env sh

set -e

if [ -n "${GUNGRAUN_ACTION_DEBUG}" ]; then set -x; fi

gh release view --repo gungraun/valgrind-builder --json assets --jq '.assets[].name' |
    awk '/^valgrind-/ { match($0, /[-][0-9]+\.[0-9]+\.[0-9]+[-]/); print substr($0, RSTART + 1, RLENGTH - 2) }' |
    sort -uV
