#!/usr/bin/env sh

set -e

if [ -n "${GUNGRAUN_ACTION_DEBUG}" ]; then set -x; fi

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
sudo=$(command -v sudo || true)

case "$pkg_manager" in
apt)
    $sudo apt-get update -y 2>/dev/null >&2
    apt-cache policy valgrind |
        awk '/\s*Candidate:/ { match($0, /[0-9]+\.[0-9]+\.[0-9]+/); print substr($0, RSTART, RLENGTH) }' |
        sort -V |
        tail -1
    ;;
dnf)
    ($sudo dnf list --showduplicates valgrind 2>/dev/null || $sudo microdnf repoquery valgrind) |
        awk '/^valgrind/ { match($0, /[0-9]+\.[0-9]+\.[0-9]+/); print substr($0, RSTART, RLENGTH) }' |
        sort -V |
        tail -1
    ;;
yum)
    ($sudo yum list --showduplicates valgrind 2>/dev/null || $sudo dnf list --showduplicates valgrind 2>/dev/null || $sudo microdnf repoquery valgrind) |
        awk '/^valgrind/ { match($0, /[0-9]+\.[0-9]+\.[0-9]+/); print substr($0, RSTART, RLENGTH) }' |
        sort -V |
        tail -1
    ;;
zypper)
    $sudo zypper --non-interactive refresh 2>/dev/null >&2
    $sudo zypper --non-interactive info valgrind |
        awk '/^Version/ { match($0, /[0-9]+\.[0-9]+\.[0-9]+/); print substr($0, RSTART, RLENGTH) }' |
        sort -V |
        tail -1
    ;;
pacman)
    $sudo pacman -Sy 2>/dev/null >&2
    pacman -Si valgrind |
        awk '/^Version/ { match($0, /[0-9]+\.[0-9]+\.[0-9]+/); print substr($0, RSTART, RLENGTH) }' |
        sort -V |
        tail -1
    ;;
apk)
    $sudo apk update 2>/dev/null >&2
    apk policy valgrind |
        awk '/^[[:space:]]+[0-9]/ { match($0, /[0-9]+\.[0-9]+\.[0-9]+/); print substr($0, RSTART, RLENGTH) }' |
        sort -V |
        tail -1
    ;;
*)
    echo "error: unknown package manager '$pkg_manager'" >&2
    exit 1
    ;;
esac
