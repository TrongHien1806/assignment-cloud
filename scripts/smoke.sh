#!/usr/bin/env bash
# Kiểm tra nhanh contract trên một instance đang chạy: bash scripts/smoke.sh [BASE_URL]
set -euo pipefail

BASE_URL="${1:-http://localhost:8080}"
failures=0

check() {
  local name="$1" expected_status="$2" expected_body="$3"
  shift 3
  local output status body
  output="$(curl -sS -w '\n%{http_code}' "$@")"
  status="${output##*$'\n'}"
  body="${output%$'\n'*}"
  if [[ "$status" == "$expected_status" && "$body" == *"$expected_body"* ]]; then
    echo "ok    $name ($status)"
  else
    echo "FAIL  $name: muốn $expected_status chứa '$expected_body', nhận $status: $body"
    failures=$((failures + 1))
  fi
}

check_quote() {
  local name="$1" status="$2" expected="$3" body="$4" content_type="${5:-application/json}"
  check "$name" "$status" "$expected" \
    -X POST "$BASE_URL/api/v1/quotes" -H "Content-Type: $content_type" -d "$body"
}

check "health live" 200 '"status":"ok"' "$BASE_URL/health/live"
check "health ready" 200 '"status":"ok"' "$BASE_URL/health/ready"
check "info" 200 '"service":"shipquote"' "$BASE_URL/api/v1/info"
check "rates" 200 '"base_fee_vnd"' "$BASE_URL/api/v1/rates"

check_quote "quote hợp lệ" 200 '"billable_weight_kg":2' '{"weight_grams":1500,"distance_km":12}'
check_quote "sai Content-Type" 415 'UNSUPPORTED_MEDIA_TYPE' '{"weight_grams":1500,"distance_km":12}' 'text/plain'
check_quote "JSON hỏng" 400 'INVALID_JSON' '{broken'
check_quote "ngoài miền" 422 'VALIDATION_ERROR' '{"weight_grams":0,"distance_km":12}'
check_quote "sai kiểu" 422 'VALIDATION_ERROR' '{"weight_grams":"1500","distance_km":12}'
check "không phục vụ file repo" 404 'NOT_FOUND' "$BASE_URL/package.json"

if ((failures > 0)); then
  echo "$failures kiểm tra thất bại"
  exit 1
fi
echo "Tất cả kiểm tra đều qua"
