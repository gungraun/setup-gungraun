#!/usr/bin/env sh

set -e

if [ -n "${GUNGRAUN_ACTION_DEBUG}" ]; then set -x; fi

scripts_dir="$(dirname "${0}")"

strategy="$1"
valgrind_version="$2"

case "$strategy" in
system)
    system_version="$("${scripts_dir}/system-valgrind-version.sh")"

    if [ -z "$valgrind_version" ] || [ "$valgrind_version" = "auto" ]; then
        echo "${system_version}"
    elif [ "$valgrind_version" = "latest" ]; then
        latest_version="$("${scripts_dir}/source-valgrind-versions.sh" | tail -1)"
        if [ "$system_version" = "$latest_version" ]; then
            echo "${latest_version}"
        else
            echo "none"
        fi
    elif [ "$system_version" = "$valgrind_version" ]; then
        echo "${valgrind_version}"
    else
        echo "none"
    fi
    ;;
builder)
    if [ "$valgrind_version" = "latest" ] || [ "$valgrind_version" = "auto" ]; then
        latest_builder_version="$("${scripts_dir}/builder-valgrind-versions.sh" | tail -1)"
        echo "${latest_builder_version}"
    elif "${scripts_dir}/builder-valgrind-versions.sh" | grep -q "$valgrind_version"; then
        echo "${valgrind_version}"
    else
        echo "none"
    fi
    ;;
source)
    if [ "$valgrind_version" = "latest" ] || [ "$valgrind_version" = "auto" ]; then
        latest_source_version="$("${scripts_dir}/source-valgrind-versions.sh" | tail -1)"
        echo "${latest_source_version}"
    elif "${scripts_dir}/source-valgrind-versions.sh" | grep -q "$valgrind_version"; then
        echo "${valgrind_version}"
    else
        echo "none"
    fi
    ;;
*)
    echo "Invalid value for valgrind-strategy: ${strategy}" >&2
    exit 1
    ;;
esac
