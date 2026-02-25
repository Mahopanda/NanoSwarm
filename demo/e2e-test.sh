#!/usr/bin/env bash
set -euo pipefail

# ── E2E Test Script for A2A Shopping Demo ─────────────────────
# Usage: make demo-test  (services must be running via make demo-up)

GATEWAY="http://localhost:4000"
SELLER_A="http://localhost:4001"
SELLER_B="http://localhost:4002"
ADMIN_API_KEY="${ADMIN_API_KEY:-demo-admin-key}"

PASS=0
FAIL=0
SKIP=0
TOTAL=0

# ── Helpers ───────────────────────────────────────────────────

green() { printf "\033[32m%s\033[0m" "$1"; }
red()   { printf "\033[31m%s\033[0m" "$1"; }
yellow(){ printf "\033[33m%s\033[0m" "$1"; }
bold()  { printf "\033[1m%s\033[0m" "$1"; }

pass() {
  TOTAL=$((TOTAL + 1))
  PASS=$((PASS + 1))
  printf "  $(green "PASS") %s\n" "$1"
}

fail() {
  TOTAL=$((TOTAL + 1))
  FAIL=$((FAIL + 1))
  printf "  $(red "FAIL") %s\n" "$1"
  if [ -n "${2:-}" ]; then
    printf "       %s\n" "$2"
  fi
}

skip() {
  TOTAL=$((TOTAL + 1))
  SKIP=$((SKIP + 1))
  printf "  $(yellow "SKIP") %s\n" "$1"
}

section() {
  echo ""
  bold "── $1 ──"
  echo ""
}

# Assert HTTP status code
# Usage: assert_status "test name" STATUS_CODE CURL_ARGS...
assert_status() {
  local name="$1" expected="$2"
  shift 2
  local status
  status=$(curl -s -o /dev/null -w "%{http_code}" "$@") || true
  if [ "$status" = "$expected" ]; then
    pass "$name"
  else
    fail "$name" "expected $expected, got $status"
  fi
}

# Assert response body contains string
# Usage: assert_contains "test name" SUBSTRING CURL_ARGS...
assert_contains() {
  local name="$1" substring="$2"
  shift 2
  local body
  body=$(curl -s "$@") || true
  if echo "$body" | grep -q "$substring"; then
    pass "$name"
  else
    fail "$name" "response does not contain '$substring'"
  fi
}

# ── Preflight ─────────────────────────────────────────────────

echo ""
bold "NanoSwarm E2E Test Suite"
echo ""
printf "Checking services..."

if ! curl -sf "$GATEWAY/health" > /dev/null 2>&1; then
  echo ""
  echo ""
  printf "  $(red "ERROR") Gateway not reachable at %s\n" "$GATEWAY"
  echo "  Run 'make demo-up' first, then retry."
  echo ""
  exit 1
fi
echo " ready."

# ── 1. Health Checks ─────────────────────────────────────────

section "Health Checks"

assert_contains "seller-a health" '"status":"ok"' "$SELLER_A/health"
assert_contains "seller-b health" '"status":"ok"' "$SELLER_B/health"
assert_contains "gateway health"  '"status":"ok"' "$GATEWAY/health"

# ── 2. Agent Card Discovery ──────────────────────────────────

section "Agent Card Discovery"

assert_contains "seller-a agent card" '"CrewAI Electronics Store"' \
  "$SELLER_A/.well-known/agent-card.json"

assert_contains "seller-b agent card" '"LangGraph Product Advisor"' \
  "$SELLER_B/.well-known/agent-card.json"

assert_contains "gateway agent card" '"Shopping Assistant"' \
  "$GATEWAY/.well-known/agent-card.json"

# ── 3. Agent Registry ────────────────────────────────────────

section "Agent Registry"

AGENTS_BODY=$(curl -s "$GATEWAY/api/agents")
AGENT_COUNT=$(echo "$AGENTS_BODY" | grep -o '"id"' | wc -l | tr -d ' ')

if [ "$AGENT_COUNT" = "3" ]; then
  pass "registry lists 3 agents"
else
  fail "registry lists 3 agents" "got $AGENT_COUNT agents"
fi

# ── 4. A2A JSON-RPC Direct ───────────────────────────────────

section "A2A JSON-RPC Direct"

# seller-a: query "Sony" → should return Sony products
JSONRPC_PAYLOAD='{"jsonrpc":"2.0","id":1,"method":"message/send","params":{"message":{"role":"user","messageId":"test-1","parts":[{"kind":"text","text":"Sony headphones"}]}}}'

SELLER_A_RESP=$(curl -s -X POST "$SELLER_A/a2a/jsonrpc" \
  -H "Content-Type: application/json" \
  -d "$JSONRPC_PAYLOAD")

if echo "$SELLER_A_RESP" | grep -q "Sony"; then
  pass "seller-a A2A returns Sony products"
else
  fail "seller-a A2A returns Sony products" "no Sony in response"
fi

# seller-b: query "earbuds" → should return earbuds
JSONRPC_PAYLOAD_B='{"jsonrpc":"2.0","id":2,"method":"message/send","params":{"message":{"role":"user","messageId":"test-2","parts":[{"kind":"text","text":"earbuds"}]}}}'

SELLER_B_RESP=$(curl -s -X POST "$SELLER_B/a2a/jsonrpc" \
  -H "Content-Type: application/json" \
  -d "$JSONRPC_PAYLOAD_B")

if echo "$SELLER_B_RESP" | grep -q "Jabra"; then
  pass "seller-b A2A returns earbuds"
else
  fail "seller-b A2A returns earbuds" "no Jabra in response"
fi

# ── 5. Per-Agent Endpoints via Gateway ────────────────────────

section "Per-Agent Endpoints via Gateway"

SELLER_A_VIA_GW=$(curl -s -X POST "$GATEWAY/a2a/agents/seller-a/jsonrpc" \
  -H "Content-Type: application/json" \
  -d "$JSONRPC_PAYLOAD")

if echo "$SELLER_A_VIA_GW" | grep -q "Sony"; then
  pass "per-agent gateway → seller-a"
else
  fail "per-agent gateway → seller-a" "no Sony in response"
fi

SELLER_B_VIA_GW=$(curl -s -X POST "$GATEWAY/a2a/agents/seller-b/jsonrpc" \
  -H "Content-Type: application/json" \
  -d "$JSONRPC_PAYLOAD_B")

if echo "$SELLER_B_VIA_GW" | grep -q "Jabra"; then
  pass "per-agent gateway → seller-b"
else
  fail "per-agent gateway → seller-b" "no Jabra in response"
fi

# Per-agent agent card
assert_contains "per-agent agent card (seller-a)" '"CrewAI Electronics Store"' \
  "$GATEWAY/a2a/agents/seller-a/.well-known/agent-card.json"

# ── 6. Admin Auth ─────────────────────────────────────────────

section "Admin Auth"

# 6a. Register without key → 401
assert_status "register without key → 401" "401" \
  -X POST "$GATEWAY/api/agents/register" \
  -H "Content-Type: application/json" \
  -d '{"id":"test-agent","name":"Test","url":"http://localhost:9999"}'

# 6b. Register with wrong key → 401
assert_status "register with wrong key → 401" "401" \
  -X POST "$GATEWAY/api/agents/register" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer wrong-key" \
  -d '{"id":"test-agent","name":"Test","url":"http://localhost:9999"}'

# 6c. Full register → verify → delete → verify cycle
REGISTER_RESP=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "$GATEWAY/api/agents/register" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_API_KEY" \
  -d '{"id":"test-agent","name":"Test Agent","url":"http://seller-a:4001"}')

if [ "$REGISTER_RESP" = "200" ]; then
  # Verify 4 agents
  COUNT_AFTER=$(curl -s "$GATEWAY/api/agents" | grep -o '"id"' | wc -l | tr -d ' ')
  # Delete
  curl -s -X DELETE "$GATEWAY/api/agents/test-agent" \
    -H "Authorization: Bearer $ADMIN_API_KEY" > /dev/null
  # Verify back to 3
  COUNT_FINAL=$(curl -s "$GATEWAY/api/agents" | grep -o '"id"' | wc -l | tr -d ' ')

  if [ "$COUNT_AFTER" = "4" ] && [ "$COUNT_FINAL" = "3" ]; then
    pass "register → 4 agents → delete → 3 agents"
  else
    fail "register → 4 agents → delete → 3 agents" "after=$COUNT_AFTER final=$COUNT_FINAL"
  fi
else
  fail "register → 4 agents → delete → 3 agents" "register returned $REGISTER_RESP"
fi

# 6d. Delete without auth → 401
assert_status "delete without auth → 401" "401" \
  -X DELETE "$GATEWAY/api/agents/seller-a"

# 6e. Non-existent agent → 404
assert_status "delete non-existent agent → 404" "404" \
  -X DELETE "$GATEWAY/api/agents/no-such-agent" \
  -H "Authorization: Bearer $ADMIN_API_KEY"

# ── 7. LLM Test (requires GEMINI_API_KEY) ────────────────────

section "LLM Integration"

if [ -z "${GEMINI_API_KEY:-}" ]; then
  skip "REST /api/chat (GEMINI_API_KEY not set)"
else
  CHAT_RESP=$(curl -s -X POST "$GATEWAY/api/chat" \
    -H "Content-Type: application/json" \
    -d '{"message":"Find me wireless headphones under $300"}')

  if echo "$CHAT_RESP" | grep -q '"text"'; then
    pass "REST /api/chat returns text"
  else
    fail "REST /api/chat returns text" "no 'text' field in response"
  fi
fi

# ── Summary ───────────────────────────────────────────────────

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ "$FAIL" -eq 0 ]; then
  printf "  $(green "All passed:") %d/%d" "$PASS" "$TOTAL"
else
  printf "  $(red "Failures:") %d passed, %d failed out of %d" "$PASS" "$FAIL" "$TOTAL"
fi
if [ "$SKIP" -gt 0 ]; then
  printf ", %d skipped" "$SKIP"
fi
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
