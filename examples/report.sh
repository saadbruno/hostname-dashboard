#!/usr/bin/env bash
set -euo pipefail

# Install jq and curl, then set these three values in the environment or here.
: "${BEACON_URL:?Set BEACON_URL, e.g. https://beacon.example.com}"
: "${BEACON_TOKEN:?Set BEACON_TOKEN to your WEBHOOK_TOKEN}"

HOST_LABEL="${HOST_LABEL:-$(hostname -f 2>/dev/null || hostname)}"

public_ipv4="$(curl --silent --fail --max-time 5 --ipv4 https://api.ipify.org 2>/dev/null || true)"
public_ipv6="$(curl --silent --fail --max-time 5 --ipv6 https://api6.ipify.org 2>/dev/null || true)"
uptime_seconds="$(cut -d. -f1 /proc/uptime)"
read -r load_1 load_5 load_15 _ < /proc/loadavg
cpu_count="$(getconf _NPROCESSORS_ONLN)"
memory_total_kb="$(awk '/MemTotal/ {print $2}' /proc/meminfo)"
memory_available_kb="$(awk '/MemAvailable/ {print $2}' /proc/meminfo)"
memory_total_bytes="$((memory_total_kb * 1024))"
memory_used_bytes="$(((memory_total_kb - memory_available_kb) * 1024))"
read -r disk_total_bytes disk_used_bytes < <(df -B1 --output=size,used / | tail -1)
temperature_c=""

if [[ -r /sys/class/thermal/thermal_zone0/temp ]]; then
  temperature_millidegrees="$(< /sys/class/thermal/thermal_zone0/temp)"
  temperature_c="$(awk -v value="$temperature_millidegrees" 'BEGIN { printf "%.1f", value / 1000 }')"
fi

payload="$(jq -n \
  --arg hostname "$HOST_LABEL" \
  --arg ipv4 "$public_ipv4" \
  --arg ipv6 "$public_ipv6" \
  --arg os "$(. /etc/os-release && printf '%s' "$PRETTY_NAME")" \
  --arg kernel "$(uname -r)" \
  --argjson uptime_seconds "$uptime_seconds" \
  --argjson load_1 "$load_1" \
  --argjson load_5 "$load_5" \
  --argjson load_15 "$load_15" \
  --argjson cpu_count "$cpu_count" \
  --argjson memory_total_bytes "$memory_total_bytes" \
  --argjson memory_used_bytes "$memory_used_bytes" \
  --argjson disk_total_bytes "$disk_total_bytes" \
  --argjson disk_used_bytes "$disk_used_bytes" \
  --arg temperature_c "$temperature_c" \
  '{
    hostname: $hostname,
    ipv4: (if $ipv4 == "" then null else $ipv4 end),
    ipv6: (if $ipv6 == "" then null else $ipv6 end),
    uptime_seconds: $uptime_seconds,
    load_1: $load_1,
    load_5: $load_5,
    load_15: $load_15,
    os: $os,
    kernel: $kernel,
    cpu_count: $cpu_count,
    memory_total_bytes: $memory_total_bytes,
    memory_used_bytes: $memory_used_bytes,
    disk_total_bytes: $disk_total_bytes,
    disk_used_bytes: $disk_used_bytes,
    temperature_c: (if $temperature_c == "" then null else ($temperature_c | tonumber) end),
    reported_at: (now | todateiso8601)
  }')"

curl --silent --show-error --fail \
  --request POST \
  --header "Authorization: Bearer ${BEACON_TOKEN}" \
  --header "Content-Type: application/json" \
  --data "$payload" \
  "${BEACON_URL%/}/api/webhook"
