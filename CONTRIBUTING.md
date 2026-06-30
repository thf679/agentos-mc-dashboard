# Contributing — agentos-mc-dashboard

## PR Process
1. Branch from `main`: `feat/drill2-{section}` or `fix/drill2-{section}`
2. Open PR referencing issue(s) with `Closes #N`
3. CI must pass (lint-css + lint-js + test)
4. At least 1 approving review required
5. Squash-merge into main

## Code Review Checklist
- [ ] No layout thrashing (batch DOM reads, then writes)
- [ ] `requestAnimationFrame` for canvas/animation
- [ ] `prefers-reduced-motion` respected
- [ ] Touch targets ≥44×44px
- [ ] Focus-visible on all interactive elements
- [ ] ARIA labels on dynamic content
- [ ] No innerHTML where textContent would work (XSS prevention)
- [ ] Responsive at 360/600/768/1024/1440px
- [ ] CSS uses design tokens (no hardcoded colors)
- [ ] JS follows factory function pattern
