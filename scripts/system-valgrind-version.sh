#!/usr/bin/env bash

set -euo pipefail

. /etc/os-release

detect_package_manager() {
    for id in ${ID_LIKE:-} ${ID:-}; do
        case "$id" in
        debian)
            echo "apt"
            return
            ;;
        fedora | rhel)
            echo "dnf"
            return
            ;;
        opensuse | suse)
            echo "zypper"
            return
            ;;
        arch)
            echo "pacman"
            return
            ;;
        alpine)
            echo "apk"
            return
            ;;
        amzn)
            echo "yum"
            return
            ;;
        esac
    done
    echo "error: unsupported distro (ID=$ID, ID_LIKE=$ID_LIKE)" >&2
    return 1
}

pkg_manager=$(detect_package_manager)

case "$pkg_manager" in
apt)
    sudo apt-get update -qq >/dev/null 2>&1 || true
    apt-cache policy valgrind 2>/dev/null |
        awk '/\s*Candidate:/ { match($0, /[0-9]+\.[0-9]+\.[0-9]+/); print substr($0, RSTART, RLENGTH) }' |
        sort -V | tail -1
    ;;
dnf)
    sudo dnf list --showduplicates valgrind 2>/dev/null |
        awk '/^valgrind/ { match($0, /[0-9]+\.[0-9]+\.[0-9]+/); print substr($0, RSTART, RLENGTH) }' |
        sort -V | tail -1
    ;;
yum)
    (sudo yum list --showduplicates valgrind 2>/dev/null || sudo dnf list --showduplicates valgrind 2>/dev/null) |
        awk '/^valgrind/ { match($0, /[0-9]+\.[0-9]+\.[0-9]+/); print substr($0, RSTART, RLENGTH) }' |
        sort -V | tail -1
    ;;
zypper)
    sudo zypper --non-interactive --quiet refresh >/dev/null 2>&1 || true
    sudo zypper --non-interactive info valgrind 2>/dev/null |
        awk '/^Version/ { match($0, /[0-9]+\.[0-9]+\.[0-9]+/); print substr($0, RSTART, RLENGTH) }' |
        sort -V | tail -1
    ;;
pacman)
    sudo pacman -Sy >/dev/null 2>&1 || true
    sudo pacman -Si valgrind 2>/dev/null |
        awk '/^Version/ { match($0, /[0-9]+\.[0-9]+\.[0-9]+/); print substr($0, RSTART, RLENGTH) }' |
        sort -V | tail -1
    ;;
apk)
    sudo apk update >/dev/null 2>&1 || true
    sudo apk policy valgrind 2>/dev/null |
        awk '/^[[:space:]]+[0-9]/ { match($0, /[0-9]+\.[0-9]+\.[0-9]+/); print substr($0, RSTART, RLENGTH) }' |
        sort -V | tail -1
    ;;
*)
    echo "error: unknown package manager '$pkg_manager'" >&2
    exit 1
    ;;
esac
