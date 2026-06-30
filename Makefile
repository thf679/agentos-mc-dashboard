.PHONY: install test lint-css lint-js clean deploy

# ── AgentOS Mission Control Dashboard — Makefile ─────────────

install:
	@echo "📦 No npm dependencies needed — vanilla JS project"
	@echo "   Server requires python3 (stdlib http.server)"
	@which python3 > /dev/null || echo "⚠️  python3 not found"

test:
	@echo "═══ Running test suite ═══"
	@for f in tests/test_refresh.js tests/test_responsive.js tests/test_state.js; do \
		if [ -f "$$f" ]; then \
			echo "--- $$f ---"; \
			node "$$f" || { echo "❌ Test failed: $$f"; exit 1; }; \
		else \
			echo "⚠️  Test file not found: $$f"; \
		fi; \
	done
	@echo "✅ All tests passed."

lint-css:
	@echo "═══ Linting CSS ═══"
	@for f in src/*.css; do \
		echo "  $$f"; \
		# Check balanced braces (basic heuristic)
		grep -o '{' "$$f" | wc -l > /tmp/_open_$$$$; \
		grep -o '}' "$$f" | wc -l > /tmp/_close_$$$$; \
		OPEN=$$(cat /tmp/_open_$$$$); \
		CLOSE=$$(cat /tmp/_close_$$$$); \
		rm -f /tmp/_open_$$$$ /tmp/_close_$$$$; \
		if [ "$$OPEN" != "$$CLOSE" ]; then \
			echo "    ❌ Unbalanced braces: $$OPEN open, $$CLOSE close"; \
		else \
			echo "    ✅ Braces balanced ($$OPEN)"; \
		fi; \
	done
	@echo "✅ CSS lint complete."

lint-js:
	@echo "═══ Syntax-checking JavaScript ═══"
	@for f in src/*.js; do \
		echo "  Checking $$f ..."; \
		node --check "$$f" && echo "    ✅ OK" || { echo "    ❌ FAILED"; exit 1; }; \
	done
	@echo "✅ JS syntax check complete."

clean:
	@echo "🧹 Cleaning..."
	@rm -rf screenshots/after/*.png 2>/dev/null || true
	@echo "✅ Clean complete."

deploy:
	@echo "🚀 Deploying AgentOS Mission Control dashboard..."
	@echo "1. Stop existing server:  pkill -f 'python3 server.py' || true"
	@echo "2. Start fresh server:    cd ~/workspace/hermes-agent/agent-mission-control && python3 server.py &"
	@echo "3. Verify health:         curl http://127.0.0.1:51763/api/health"
	@echo "4. Check refresh.js:      curl http://127.0.0.1:51763/refresh.js | head -5"
	@echo "5. Verify SSE stream:     curl http://127.0.0.1:51763/events"
	@echo ""
	@echo "Run 'make deploy' to see this guide again."
