.PHONY: install dev test demo-up demo-down demo-logs demo-ps demo-test

# ── Development ──────────────────────────────────────────────

install:
	bun install

dev:
	bun run dev

test:
	bun test

# ── Demo (A2A Shopping) ─────────────────────────────────────

DEMO_COMPOSE := docker compose -f demo/docker-compose.yml

demo-up: demo/.env
	$(DEMO_COMPOSE) up --build -d
	@echo ""
	@echo "  gateway   → http://localhost:4000"
	@echo "  seller-a  → http://localhost:4001"
	@echo "  seller-b  → http://localhost:4002"
	@echo ""
	@echo "  Try: curl -X POST http://localhost:4000/api/chat -H 'Content-Type: application/json' -d '{\"message\": \"Find me wireless headphones under $$300\"}'"

demo-down:
	$(DEMO_COMPOSE) down

demo-logs:
	$(DEMO_COMPOSE) logs -f

demo-ps:
	$(DEMO_COMPOSE) ps

demo-test:
	@bash demo/e2e-test.sh

demo/.env:
	@echo "GEMINI_API_KEY=your-key-here" > demo/.env
	@echo ""
	@echo "  Created demo/.env — edit it to add your GEMINI_API_KEY before running make demo-up"
	@echo ""
	@exit 1
