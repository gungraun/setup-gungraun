#!/usr/bin/env bash

set -euo pipefail

VALGRIND_SOURCE_REPO='https://sourceware.org/git/valgrind.git'

git ls-remote "$VALGRIND_SOURCE_REPO" 2>/dev/null |
    awk '/VALGRIND_/ { match($0, /[0-9]+_[0-9]+_[0-9]+/); print substr($0, RSTART, RLENGTH) }' |
    sort -uV |
    tr '_' '.'
