#!/usr/bin/env bash
# Live smoke test for the BibleWay AI agent. Run from the repo root.
# Auto-loads NVIDIA_* from backend/.env. Requires: curl, jq.
#   bash agent_live_smoke_test.sh
set -euo pipefail

for ENVF in backend/.env ./.env ../backend/.env; do
  if [ -z "${NVIDIA_API_KEY:-}" ] && [ -f "$ENVF" ]; then set -a; . <(grep -E '^NVIDIA_' "$ENVF"); set +a; fi
done
KEY="${NVIDIA_API_KEY:-}"
MODEL="${NVIDIA_MODEL:-openai/gpt-oss-20b}"
BASE="${NVIDIA_BASE_URL:-https://integrate.api.nvidia.com/v1}"
[ -z "$KEY" ] && { echo "Set NVIDIA_API_KEY (or run from repo root so backend/.env is found)."; exit 1; }
command -v jq >/dev/null || { echo "jq not found — install with: sudo apt install jq"; exit 1; }

SYS='You are the BibleWay study assistant. Answer through the teaching of the Bible and quote at least one relevant verse with its reference (Book Chapter:Verse). Be warm and concise. If the Bible does not address it, say so honestly.'

pass=0; fail=0
echo "=== 1) Direct NVIDIA call — does the model answer with scripture? (model: $MODEL) ==="
for Q in "What does the Bible say about anxiety?" "How can I forgive someone who hurt me?" "What is the best phone to buy?"; do
  echo "Q: $Q"
  RESP=$(curl -s --max-time 90 "$BASE/chat/completions" \
    -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
    -d "$(jq -n --arg m "$MODEL" --arg s "$SYS" --arg q "$Q" \
      '{model:$m,temperature:0.6,top_p:0.95,top_k:20,presence_penalty:0,repetition_penalty:1,max_tokens:2048,stream:false,messages:[{role:"system",content:$s},{role:"user",content:$q}]}')")
  ANS=$(echo "$RESP" | jq -r '.choices[0].message.content // .detail // .error // "NO CONTENT"' | sed -E 's/<think>.*<\/think>//g')
  echo "$ANS"
  if echo "$ANS" | grep -qoE '\b([1-3] )?[A-Z][a-z]+( of [A-Z][a-z]+)? [0-9]+:[0-9]+'; then echo "  ✓ verse reference found"; pass=$((pass+1)); else echo "  ✗ no verse reference"; fail=$((fail+1)); fi
  echo "----"
done
echo "Direct checks: $pass with verses, $fail without (the 3rd, off-topic, may legitimately decline)."

echo ""
echo "=== 2) Through your backend (start first: cd backend && npm run dev) ==="
TOKEN="${SUPABASE_ACCESS_TOKEN:-}"
if [ -n "$TOKEN" ]; then
  curl -s --max-time 90 http://localhost:3000/api/v1/agent/ask \
    -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    -d '{"question":"What does the Bible say about hope?"}' | jq
else
  echo "(skipped — set SUPABASE_ACCESS_TOKEN to test the protected endpoint, or temporarily"
  echo " swap SupabaseAuthGuard -> OptionalAuthGuard in agent.controller.ts for an unauthenticated curl)"
fi
