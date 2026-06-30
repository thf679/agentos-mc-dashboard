# agentos-mc-dashboard — Project Context

## Architecture
- AgentOS Mission Control dashboard frontend: HTML/CSS/JS, no framework
- Served by stdlib Python HTTP server (server.py in hermes-agent)
- Two dashboards: v1 (index.html — 6 tabs) and v2 (dashboard.html — 5 panels)
- SSE endpoint at /events pushes snapshot every 5s
- Design tokens in tokens.css, reusable components in components.js

## Environment
- Host: Termux + proot-distro Ubuntu on Android (aarch64)
- No npm, no bundler, no TypeScript — vanilla JS only
- Server: stdlib http.server, port 51763, bind 0.0.0.0

## Coding Standards
- Vanilla JavaScript (no React, Vue, Svelte, jQuery)
- CSS custom properties for all design values (tokens.css)
- Component factory functions (components.js pattern)
- Mobile-first responsive design with 5 breakpoints
- Touch targets ≥44×44px (WCAG 2.1 AA)
- No external CDN dependencies — self-contained

## Key Commands
- Lint CSS: make lint-css
- Lint JS: make lint-js
- Test: make test
- Deploy: make deploy

## Model Routing
- Architect: deepseek-v4-pro
- Reviewer: deepseek-v4-pro
- Tester: kimi-k2.7-code
- DevOps: kimi-k2.7-code
- Coder (Claude Code): kimi-k2.7-code
