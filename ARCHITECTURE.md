# ARCHITECTURE.md — AgentOS Mission Control Dashboard
## Drill #2: Responsive + Smart Auto-Refresh

> **Phase A — Architect Design Document**
> Author: Architect (deepseek-v4-pro)
> Date: 2026-06-30
> References: Issues #1–#4, Milestone #1 ("Drill #2 — Responsive + Auto-Refresh")

---

## Table of Contents

1. [A1: Responsive Breakpoint Map](#a1-responsive-breakpoint-map)
2. [A2: Refresh Architecture](#a2-refresh-architecture)
3. [A3: Responsive Component Contract](#a3-responsive-component-contract)
4. [A4: Diff Update Protocol](#a4-diff-update-protocol)
5. [Appendix: CSS Custom Properties](#appendix-css-custom-properties)
6. [Appendix: DOM Element ID Map](#appendix-dom-element-id-map)

---

## A1: Responsive Breakpoint Map

### 1.1 Breakpoint Definitions

| Breakpoint | Range | Primary Targets | CSS Media Query |
|-----------|-------|-----------------|-----------------|
| **Mobile** | `< 600px` | Small phones (360px), large phones | `@media (max-width: 599px)` |
| **Tablet** | `600px – 1024px` | Tablet portrait (768px), tablet landscape | `@media (min-width: 600px) and (max-width: 1024px)` |
| **Desktop** | `> 1024px` | Desktop monitors (1440px+), large screens | `@media (min-width: 1025px)` |

**Rationale for 600px/1024px split:**
- 600px: Separates small phones (360–414px) from tablets. Below 600px, single-column stacking is mandatory; above it, two-column layouts become viable.
- 1024px: Marks the transition from tablet landscape to desktop. At 1024px+, full multi-column layouts with side-by-side panels are comfortable.
- Additional fine-tuning breakpoints: 768px for tablet portrait optimizations (nav hamburger threshold), 900px for existing `.grid-2` collapse.

### 1.2 CSS Custom Properties for Breakpoints

```css
:root {
  /* Breakpoint thresholds (read-only — used by JS for matchMedia) */
  --bp-mobile:  600px;
  --bp-tablet:  1024px;

  /* Container widths */
  --content-max-width:    1400px;
  --content-padding:      var(--space-4);

  /* Mobile overrides */
  --content-padding-mobile: var(--space-3);
}
```

These custom properties are **design tokens only** — JavaScript reads them via `getComputedStyle()` for `matchMedia` checks. Media queries in CSS use the literal pixel values.

### 1.3 Component Adaptation Rules per Breakpoint

| Component | Mobile (<600px) | Tablet (600–1024px) | Desktop (>1024px) |
|-----------|----------------|---------------------|-------------------|
| **Nav bar** | Hamburger menu, compact header (48px height) | Horizontal tabs, icons+text | Full horizontal tabs with labels |
| **Tab buttons** | Icon-only or abbreviated, 44×44px min | Full text labels, 44px height | Full text labels |
| **Stat strip (5-col)** | Single column stacked, full-width cards | 2-column grid | 5-column equal grid |
| **Agent cards** | Single column, full-width | 2-column grid (`auto-fit, minmax(280px, 1fr)`) | 3+ column grid |
| **Tables** | `overflow-x:auto` scroll container, sticky first column | `overflow-x:auto` scroll container | Full-width, no scroll needed |
| **System health card** | Stacked bars, min 120px width | Side-by-side bars | Full 3-column dashboard panel |
| **Gateway card** | Single column stacked | Single column | Side-by-side with Agent Logs |
| **SDLC grid** | Single column (600px collapse) | Single column at <900px, 2-col at ≥900px | 2-column grid |
| **Sparkline canvas** | 100% width, 40px height | 100% width, 60px height | 100% width, 60px height |
| **Messages panel** | Truncated preview (60 chars), 200px max-height | Full preview (120 chars), 380px max-height | Full preview, 380px max-height |
| **Kanban board** | Horizontal scroll, compact rows | Horizontal scroll if needed | Full-width table |

### 1.4 Mobile-First Design Strategy

All new CSS follows a **mobile-first** approach:

1. Base styles target the smallest viewport (mobile)
2. `@media (min-width: 600px)` adds tablet enhancements
3. `@media (min-width: 1025px)` adds desktop enhancements

Existing styles (which are desktop-first) are progressively overridden with `max-width` media queries to avoid breaking the baseline.

### 1.5 Fluid Typography

Replace fixed `font-size` declarations with `clamp()`:

```css
/* Before (fixed) */
--font-size-base: 0.875rem;

/* After (fluid) */
--font-size-base: clamp(0.8125rem, 0.85rem + 0.1vw, 0.9375rem);
```

Key typography scales:
- **Body**: `clamp(0.8125rem, 0.85rem + 0.1vw, 0.9375rem)` (13px–15px)
- **Heading (h1)**: `clamp(1.25rem, 1rem + 2vw, 2rem)` (20px–32px)
- **Stat values**: `clamp(1rem, 0.9rem + 1vw, 1.5rem)` (16px–24px)
- **Mono/Code**: `clamp(0.6875rem, 0.7rem + 0.05vw, 0.8125rem)` (11px–13px)

---

## A2: Refresh Architecture

### 2.1 Overview

The refresh system replaces naive `setInterval`-based full-page re-renders with a **smart, non-disruptive update cycle** using Server-Sent Events (SSE) as primary transport and polling as fallback. A new shared module, `refresh.js`, serves both dashboards (v1/index.html and v2/dashboard.html).

```
┌───────────────────────────────────────────────────┐
│                  refresh.js                        │
│  ┌─────────┐  ┌──────────┐  ┌──────────────────┐ │
│  │ SSE     │  │ Polling  │  │ Diff-Patch       │ │
│  │ Client  │  │ Fallback │  │ Renderer         │ │
│  └────┬────┘  └────┬─────┘  └────────┬─────────┘ │
│       │            │                 │            │
│  ┌────┴────────────┴─────────────────┴─────────┐  │
│  │         Refresh Controller                   │  │
│  │  ┌──────────────┐  ┌────────────────────┐   │  │
│  │  │ Visibility   │  │ State Preservation │   │  │
│  │  │ API Handler  │  │ Manager            │   │  │
│  │  └──────────────┘  └────────────────────┘   │  │
│  └──────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────┘
```

### 2.2 Architecture Diagram

```
┌──────────┐     SSE (/events)     ┌──────────────┐
│ server.py│ ─────────────────────→│  refresh.js  │
│  :51763  │     snapshot every 5s │  (SSE client)│
└──────────┘                       └──────┬───────┘
       │                                  │
       │  GET /api/snapshot               │ diff against
       │  GET /api/summary                │ lastState
       │                                  │
       └──────────────────────────────────┼───────→ DOM updates
          (polling fallback)              │        (only changed
                                          │         elements)
                                   ┌──────┴───────┐
                                   │  v1 Overview │
                                   │  v2 Dashboard│
                                   └──────────────┘
```

### 2.3 SSE Connection Lifecycle

```
CONNECT ──→ OPEN ──→ parse "snapshot" event
  │           │            │
  │           │            ├──→ diff against lastState
  │           │            ├──→ patch DOM (changed nodes only)
  │           │            └──→ update data-age indicator
  │           │
  │           ├──→ onerror ──→ close() ──→ backoff timer ──→ CONNECT
  │           │
  │           └──→ visibilitychange (hidden) ──→ PAUSE (keep connection open)
  │                visibilitychange (visible) ──→ RESUME (replay last event)
  │
  └──→ DISCONNECT (user selects Manual mode)
```

**Connection details:**
- Endpoint: `/events` (GET, SSE stream)
- Event type listened: `snapshot`
- Event data: JSON — full snapshot object (same shape as `/api/snapshot`)
- Server push interval: 5 seconds (already implemented in `server.py`)
- Reconnection: automatic on connection loss with exponential backoff (see §2.6)

### 2.4 Polling Fallback Strategy

When SSE fails (network issues, browser doesn't support EventSource), the controller falls back to HTTP polling:

| Mode | Interval | Endpoint | Use Case |
|------|----------|----------|----------|
| SSE Live | N/A (push) | `/events` | Primary mode — real-time updates |
| Fast Poll | 5 seconds | `/api/snapshot` or `/api/summary` | SSE unavailable, recent data needed |
| Normal Poll | 10 seconds | `/api/snapshot` or `/api/summary` | Default fallback |
| Slow Poll | 30 seconds | `/api/snapshot` or `/api/summary` | Battery/bandwidth conservation |
| Manual | Off | None | User-initiated refresh only |

**Endpoint mapping:**
- v1: Uses `/api/snapshot` for polling (same shape as SSE snapshot events)
- v2: Uses `/api/summary` for polling

The `refresh.js` controller is configured per-dashboard with the appropriate endpoint.

### 2.5 Diff-Patch Rendering Strategy

Instead of `element.innerHTML = newHTML` (which causes flicker, loses scroll position, destroys form state), the diff-patch renderer:

1. **Compares** the incoming snapshot against `lastState` (deep comparison at the top-level keys)
2. **Computes** a diff array of changed paths (see A4: Diff Update Protocol)
3. **Applies** only the changed values to targeted DOM elements via `data-path` attributes
4. **Skips** elements that are currently being edited (detected by `contenteditable`, `input:focus`, or `data-editing` attribute)

```
Incoming snapshot           lastState               Diff array
┌──────────────┐          ┌──────────────┐         ┌─────────────────────┐
│ gateway: {   │          │ gateway: {   │         │ {path:"gateway.pid",│
│   pid: 12346,│  diff    │   pid: 12345,│  ────→  │  value:12346,       │
│   state: "ok"│ ───────→ │   state: "ok"│         │  op:"set"}          │
│ }            │          │ }            │         └─────────────────────┘
└──────────────┘          └──────────────┘                  │
                                                            ▼
                                              document.querySelector(
                                                '[data-path="gateway.pid"]'
                                              ).textContent = "12346"
```

### 2.6 Visibility-Aware Lifecycle

Using the **Page Visibility API** (`document.visibilityState`, `visibilitychange` event):

- **Tab hidden** (`document.hidden === true`):
  - SSE connection stays open (data still flows, no reconnection needed later)
  - DOM updates are **suppressed** (no rendering when invisible)
  - `lastState` is still updated so when tab becomes visible, only the latest diff is applied
  - Data age counter freezes

- **Tab visible** (`document.hidden === false`):
  - On becoming visible: immediately diff `lastState` against current DOM state
  - Apply any pending changes
  - Resume normal update cycle
  - Update data age indicator

- **Polling mode**: `clearInterval` on hidden, `setInterval` on visible

```
Visibility State Machine:
  VISIBLE ──visibilitychange(hidden)──→ HIDDEN
    │                                      │
    │  DOM updates active                  │  SSE stays connected
    │  age counter running                 │  DOM updates suppressed
    │                                      │  age counter frozen
    │                                      │
    └──visibilitychange(visible)───────────┘
            │
            ├── diff lastState → current DOM
            ├── apply pending patches
            └── resume age counter
```

### 2.7 Exponential Backoff

On fetch/connection errors, the controller backs off exponentially:

| Attempt | Delay | Cumulative |
|---------|-------|------------|
| 1st error | 5s | 5s |
| 2nd error | 10s | 15s |
| 3rd error | 30s | 45s |
| 4th+ error | 60s | 105s+ |

On successful connection or data receipt, the backoff timer resets to the configured base interval.

### 2.8 State Preservation

The diff-patch approach inherently preserves most state by not touching unchanged DOM nodes. Additional explicit preservation:

| State Element | Preservation Strategy |
|--------------|---------------------|
| Scroll position | `element.scrollTop` saved before diff, restored after |
| Active tab | `data-active-tab` attribute on tab container, checked before re-render |
| Expanded cards | `data-expanded` attribute on card elements, skipped in diff if present |
| Kanban inline edits | `document.activeElement` check — if inside a `[contenteditable]` or `<input>` in the Kanban panel, skip that subtree |
| Form inputs | `data-editing` attribute set on `focus`, cleared on `blur`; diff skips elements with this attribute |

### 2.9 Data Age Indicator

A small indicator in the header/nav bar shows recency:

```
"Updated 3s ago"          (green dot,  <10s: fresh)
"Updated 45s ago"         (amber dot, 10–60s: acceptable)
"Stale (2m ago)"          (red dot,   >60s: stale)
"Live ●"                  (SSE connected)
"Polling ○ (10s)"         (polling mode active)
"Paused ⏸"                (tab backgrounded)
"Manual ⏎"                (manual refresh mode)
```

Implementation: a `<span id="data-age">` element updated by `refresh.js` every second via `setInterval` (clock update) with the elapsed time since `lastUpdateTimestamp`.

### 2.10 refresh.js API Design

```javascript
// Factory function — creates a refresh controller
function createRefreshController(config) {
  // config = {
  //   mode: 'sse' | 'poll' | 'manual',     // initial mode
  //   pollInterval: 10000,                  // ms for poll mode
  //   endpoint: '/api/snapshot',            // polling endpoint
  //   renderFn: function(snapshot) {},      // called with full snapshot on first load
  //   diffFn: function(diffArray) {},       // called with diff array on updates (optional)
  //   dataAgeEl: '#data-age',              // selector for age indicator
  //   onError: function(err) {}             // error callback
  // }

  return {
    start: function() {},       // begin refresh cycle
    stop: function() {},        // stop all refresh
    setMode: function(mode) {}, // switch mode: 'sse', 'poll', 'manual'
    refresh: function() {},     // force immediate refresh
    getAge: function() {},      // returns seconds since last update
    destroy: function() {}      // cleanup: close SSE, clear intervals, remove listeners
  };
}
```

---

## A3: Responsive Component Contract

### 3.1 Component Adaptation Rules

Each dashboard component has a defined responsive behavior contract. The contract specifies:
- **Base behavior** (mobile-first default)
- **Tablet adaptation** (600–1024px)
- **Desktop adaptation** (>1024px)
- **CSS class naming convention**
- **JavaScript interaction requirements**

### 3.2 Nav Bar → Hamburger Menu

**Location:** `index.html` (v1) `.nav` div
**Also applies to:** v2 header

| Breakpoint | Behavior |
|-----------|----------|
| Mobile (<600px) | Hamburger icon (☰) replaces tab row. Toggle opens a vertical dropdown menu. Header height: 48px. Brand: icon only. |
| Tablet (600–1024px) | Horizontal tabs with abbreviated labels. Header height: 56px. |
| Desktop (>1024px) | Full horizontal tabs with text labels + icons. Header height: 56px. |

**CSS Classes:**
- `.nav` — base nav container
- `.nav-hamburger` — hamburger toggle button (hidden on tablet+)
- `.nav-menu` — dropdown menu (visible when `.nav-menu.open`)
- `.nav-menu.open` — toggled open state
- `.nav-tabs` — horizontal tab row (hidden on mobile when hamburger active)

**JavaScript Requirements:**
- Hamburger click handler toggles `.nav-menu.open`
- Click outside menu closes it
- Focus trap inside open menu (for accessibility)
- ESC key closes menu
- On breakpoint change (resize from mobile to tablet), close menu and restore tab row

### 3.3 Grid Layout → Stack Layout

**Affected components:** Stat strip, agent cards, SDLC grid, footer stats, Agent Statistics (2×2 grid)

| Breakpoint | Stat Strip (5-col) | Agent Cards | SDLC Grid | Footer Stats (5-col) |
|-----------|-------------------|-------------|-----------|----------------------|
| Mobile | 1 column, full-width | 1 column, full-width | 1 column | 2 columns |
| Tablet | 2 columns | 2 columns | 1 column (<900px) / 2 columns (≥900px) | 3 columns |
| Desktop | 5 columns | 3+ columns | 2 columns | 5 columns |

**CSS Classes:**
- `.stat-strip` — stat card container
- `.stat-strip-2col` — tablet override (2 columns)
- `.stat-strip-1col` — mobile override (1 column)
- `.agent-grid` — agent card container
- `.agent-grid-2col` — tablet override
- `.agent-grid-1col` — mobile override
- `.footer-stats` — footer stat container

**Implementation:**
Use CSS `@media` queries with `grid-template-columns` overrides. No JS needed for layout changes — pure CSS. Existing `auto-fit, minmax()` patterns in `components.js` are preserved.

### 3.4 Table → Scroll Card

**Affected components:** Tasks table, Schedule table, Library table, Sessions table, Kanban table, SDLC tables

| Breakpoint | Behavior |
|-----------|----------|
| Mobile (<600px) | `overflow-x:auto` wrapper, sticky first column (`position:sticky; left:0`), `-webkit-overflow-scrolling: touch` for iOS |
| Tablet (600–1024px) | `overflow-x:auto` wrapper if content exceeds viewport, no sticky column needed |
| Desktop (>1024px) | Full-width table, no scroll wrapper |

**CSS Classes:**
- `.table-scroll` — `overflow-x:auto` wrapper div
- `.table-scroll-ios` — iOS smooth scrolling
- `.table-sticky-col` — `position:sticky; left:0` on first column `<th>` and `<td>`

**DOM Structure:**
```html
<div class="table-scroll table-scroll-ios">
  <table>
    <thead>
      <tr>
        <th class="table-sticky-col">ID</th>
        <th>Title</th>
        <th>Status</th>
        ...
      </tr>
    </thead>
    <tbody>
      <tr>
        <td class="table-sticky-col">...</td>
        <td>...</td>
        <td>...</td>
      </tr>
    </tbody>
  </table>
</div>
```

**JavaScript Requirements:**
- None for scrolling behavior (pure CSS)
- Components.js `DataTable` factory optionally accepts `scrollable: true` option to wrap output in `.table-scroll`

### 3.5 Stat Cards & System Health

**System Health Card (CPU/RAM/Disk):**

| Breakpoint | Behavior |
|-----------|----------|
| Mobile | Bars stack vertically, min 120px wide each, labels above bars |
| Tablet+ | Side-by-side layout as currently designed |

**Stat cards (StatCard component):**

| Breakpoint | Stat Card |
|-----------|----------|
| Mobile | `min-width: 120px`, padding `var(--space-3)`, reduced font |
| Tablet+ | Current behavior preserved |

### 3.6 Touch Target Requirements

All interactive elements must meet **WCAG 2.1 AA** touch target size:

| Element | Minimum Size | Current | Action |
|---------|-------------|---------|--------|
| Tab buttons | 44×44px | ~30×28px (6px padding) | Increase padding to `var(--space-3) var(--space-4)` |
| Hamburger icon | 44×44px | N/A (new) | Design at 44×44px |
| Refresh selector | 44px height | ~28px | Increase padding |
| Kanban action buttons | 44×44px | Variable | Enforce min dimensions |
| SDLC check icons | 44×44px | Variable | Enforce min dimensions |
| Badge close buttons | 44×44px | N/A | If added |

**Implementation:** CSS `min-height: 44px; min-width: 44px;` on all interactive elements, with `padding` used to reach the minimum when content is smaller.

### 3.7 components.js Integration

The existing `components.js` factory functions get responsive awareness:

- **`DataTable(props)`** — new `opts.scrollable` flag adds `.table-scroll` wrapper
- **`GlassCard(props)`** — new `opts.responsive` flag adds `data-responsive` attribute for JS resize handling
- **`StatCard(props)`** — unchanged (styling handled by parent CSS grid)
- **No new factory functions needed** — responsive behavior lives in CSS media queries, not JS

---

## A4: Diff Update Protocol

### 4.1 Protocol Overview

The diff update protocol enables **surgical DOM updates** — only changed values are written to the DOM, avoiding full `innerHTML` replacement. This preserves scroll position, form state, expanded sections, and Kanban edits.

### 4.2 Diff Entry JSON Schema

Each diff entry is a flat object:

```json
{
  "path": "gateway.pid",
  "value": 12346,
  "op": "set"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `path` | `string` | Yes | Dot-separated path into the snapshot JSON object (e.g., `"gateway.platforms.telegram.state"`) |
| `value` | `any` | Yes | The new value to apply |
| `op` | `string` | Yes | Operation type: `"set"`, `"append"`, `"remove"`, `"replace"` |

### 4.3 Supported Operations

#### `set` — Replace a scalar value
```json
{ "path": "gateway.pid", "value": 12346, "op": "set" }
```
- Replaces the text content of `[data-path="gateway.pid"]`
- If the element doesn't exist, the diff is queued for the next full render

#### `append` — Add item to an array
```json
{ "path": "activity.entries", "value": {"agent_name": "coder", "status": "completed"}, "op": "append" }
```
- Appends a new row/entry to a list element (`[data-path="activity.entries"]`)
- The value is rendered using the appropriate component factory for that list type
- If the list exceeds a max display length, the oldest item is removed

#### `remove` — Remove a key or array item
```json
{ "path": "gateway.platforms.discord", "value": null, "op": "remove" }
```
- Removes the targeted DOM subtree
- Sets `data-removed="true"` with a CSS fade-out transition before actual removal

#### `replace` — Replace a complex subtree
```json
{ "path": "kanban", "value": { "total": 5, "tasks": [...] }, "op": "replace" }
```
- Performs a full `innerHTML` replacement of the target subtree
- Used when too many individual diffs would be less efficient
- Preserves scroll position of ancestor scroll container

### 4.4 DOM Mapping Convention

DOM elements are annotated with `data-path` attributes that mirror the JSON paths:

```html
<!-- Simple scalar -->
<span data-path="gateway.pid">12345</span>

<!-- Nested value -->
<span data-path="gateway.platforms.telegram.state">connected</span>

<!-- Array container -->
<div data-path="activity.entries">
  <div data-path="activity.entries.0">...</div>
  <div data-path="activity.entries.1">...</div>
</div>

<!-- Complex object -->
<div data-path="system_health">
  <span data-path="system_health.cpu_pct">42</span>
  <span data-path="system_health.ram_pct">67</span>
</div>
```

**Path resolution rules:**
1. `document.querySelector('[data-path="..."]')` is the primary lookup
2. If an exact match isn't found, walk up the path (e.g., try `"gateway"` if `"gateway.pid"` not found)
3. If no element exists for the path, log a warning and skip
4. Path components use only `[a-zA-Z0-9_.]` — no special characters

### 4.5 Path → Snapshot Key Mapping

The server's snapshot JSON structure maps to paths as follows:

| Snapshot Key | Path Prefix | DOM Container |
|-------------|-------------|---------------|
| `gateway` | `gateway.*` | Gateway panel |
| `vps_health` | `vps_health.*` | System health card |
| `activity` | `activity.*` | Overview + Agents tab |
| `sessions` | `sessions.*` | Sessions table |
| `kanban` | `kanban.*` | Kanban board |
| `agents` | `agents.*` | Agents tab |
| `harness` | `harness.*` | Harness Health card |

### 4.6 Diff Computation Algorithm

```
function computeDiff(oldState, newState, prefix=''):
    diffs = []
    for each key in newState:
        fullPath = prefix ? prefix + '.' + key : key
        oldValue = oldState[key]
        newValue = newState[key]

        if oldValue === undefined:
            diffs.push({path: fullPath, value: newValue, op: 'set'})
        else if typeof newValue !== typeof oldValue:
            diffs.push({path: fullPath, value: newValue, op: 'replace'})
        else if typeof newValue === 'object' && newValue !== null:
            if Array.isArray(newValue):
                if JSON.stringify(newValue) !== JSON.stringify(oldValue):
                    diffs.push({path: fullPath, value: newValue, op: 'replace'})
            else:
                diffs = diffs.concat(computeDiff(oldValue, newValue, fullPath))
        else if newValue !== oldValue:
            diffs.push({path: fullPath, value: newValue, op: 'set'})

    // Detect removed keys
    for each key in oldState:
        if !(key in newState):
            fullPath = prefix ? prefix + '.' + key : key
            diffs.push({path: fullPath, value: null, op: 'remove'})

    return diffs
```

### 4.7 Diff Application Algorithm

```
function applyDiff(diffArray, lastState):
    for each diff in diffArray:
        el = document.querySelector('[data-path="' + diff.path + '"]')

        // Skip if element is being edited
        if el && (el.hasAttribute('data-editing') ||
                  el.querySelector(':focus') ||
                  el.matches(':focus')):
            continue

        switch diff.op:
            case 'set':
                if el: el.textContent = String(diff.value)
                break
            case 'replace':
                if el: el.innerHTML = renderSubtree(diff.path, diff.value)
                break
            case 'append':
                if el: appendToContainer(el, diff.value)
                break
            case 'remove':
                if el: fadeOutAndRemove(el)
                break

        // Update lastState
        setNestedValue(lastState, diff.path, diff.value)
```

### 4.8 Edge Cases

| Edge Case | Handling |
|-----------|----------|
| Path not found in DOM | Log warning, skip. Will be corrected on next full render. |
| Value is `null` | Set text content to "—" (em dash) |
| Large array diff (>50 items) | Fall back to `replace` operation for efficiency |
| Nested object change in array | Use `replace` for the array item, not individual field diffs |
| Concurrent edits | `data-editing` attribute set on `focus`, cleared on `blur`; diff skips editing elements |
| Element removed from DOM externally | `querySelector` returns null; skip and log |
| SSE delivers partial update | Diff only contains changed fields; unchanged fields are not included |

### 4.9 Performance Constraints

- Diff computation: **<5ms** for typical snapshot (~50 top-level keys, 200 nested values)
- DOM patching: **<16ms** (one frame) for typical change set (5–20 diffs)
- If diff count exceeds 50, fall back to full `innerHTML` replacement for the affected subtree
- Diff computation runs synchronously (blocking is acceptable for <5ms)
- Batch all DOM writes before triggering layout (use `requestAnimationFrame` for visual updates)

---

## Appendix: CSS Custom Properties

### New Properties for Responsive Layout

```css
:root {
  /* ── Responsive Breakpoints ── */
  --bp-mobile:  600px;
  --bp-tablet:  1024px;

  /* ── Responsive Spacing ── */
  --content-padding-mobile: var(--space-3);
  --content-padding-tablet: var(--space-4);
  --content-padding-desktop: var(--space-6);
  --nav-height-mobile: 48px;
  --nav-height-tablet: 56px;
  --nav-height-desktop: 56px;

  /* ── Touch Targets ── */
  --touch-target-min: 44px;

  /* ── Fluid Typography ── */
  --font-size-fluid-body:   clamp(0.8125rem, 0.85rem + 0.1vw, 0.9375rem);
  --font-size-fluid-heading: clamp(1.25rem, 1rem + 2vw, 2rem);
  --font-size-fluid-mono:   clamp(0.6875rem, 0.7rem + 0.05vw, 0.8125rem);
}
```

---

## Appendix: DOM Element ID Map

| Element ID | Path | Component | Dashboard |
|-----------|------|-----------|-----------|
| `#gw` | `gateway.*` | Gateway panel | v2 |
| `#ls` | `logs.*` | Agent Logs | v2 |
| `#se` | `sessions.*` | Sessions table | v2 |
| `#kb` | `kanban.*` | Kanban board | v2 |
| `#msg` | `messages.*` | Messages panel | v2 |
| `#dot` | `health.status` | Status dot | v2 |
| `#ts` | (data age) | Timestamp | v2 |
| `#overview-loading` | (snapshot) | Overview tab | v1 |
| `#agents-loading` | `agents.*` | Agents tab | v1 |
| `#tasks-loading` | `tasks.*` | Tasks tab | v1 |
| `#schedule-loading` | `schedule.*` | Schedule tab | v1 |
| `#content-loading` | `content.*` | Library tab | v1 |
| `#sdlc-loading` | `sdlc.*` | SDLC tab | v1 |
| `#sparkline` | (canvas) | Throughput sparkline | v1 |
| `#data-age` | (age) | Data age indicator | v1 + v2 |
| `#ref` | (refresh mode) | Refresh mode selector | v2 |
| `#status-label` | `health.status` | Status text | v1 |
| `#clock` | (wall clock) | 24-hour clock | v1 |

---

> **Next Phase:** Phase B — Coder implements Issues #5–#9 based on this architecture.
> **Review:** Phase C — Reviewer inspects this document (PR #1) for correctness and completeness.
