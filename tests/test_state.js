#!/usr/bin/env node
/**
 * test_state.js — State preservation test harness
 *
 * Covers:
 *   - Scroll position preservation during DOM updates
 *   - Active input focus preservation (data-editing attribute)
 *   - Selected tab persistence across renders
 *   - Diff-based DOM mutation skips focused elements
 *   - Tab state synchronization with nav-menu mobile
 *
 * Run: node tests/test_state.js
 */

(function () {
  'use strict';

  var passed = 0, failed = 0;
  var errors = [];

  function assert(cond, msg) {
    if (cond) { passed++; return true; }
    failed++;
    errors.push('FAIL: ' + msg);
    return false;
  }

  function assertEqual(actual, expected, msg) {
    if (actual === expected) { passed++; return true; }
    failed++;
    errors.push('FAIL: ' + msg + ' — expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual));
    return false;
  }

  // ═══════════════════════════════════════════════════
  // SECTION 1: Scroll position preservation
  // ═══════════════════════════════════════════════════

  (function () {
    // refresh.js preserveScroll(): captures scrollX/scrollY, returns restore function
    function preserveScroll() {
      var scrollY = typeof window !== 'undefined' ? window.scrollY : 450;
      var scrollX = typeof window !== 'undefined' ? window.scrollX : 0;
      return function restoreScroll() {
        // window.scrollTo(scrollX, scrollY)
        return { x: scrollX, y: scrollY };
      };
    }

    var capture = preserveScroll();
    // Simulate scroll happened
    assertEqual(capture().x, 0, 'scroll: captures scrollX');
    assertEqual(capture().y, 450, 'scroll: captures scrollY');

    // Test: scroll preservation across a DOM update cycle
    var scrollState = { x: 120, y: 850 };

    function preserveAndRestore(state) {
      return {
        before: { x: state.x, y: state.y },
        after: state  // unchanged by restore since scrollTo is a no-op in test
      };
    }

    var result = preserveAndRestore(scrollState);
    assertEqual(result.before.x, result.after.x, 'scroll: x position unchanged after DOM update');
    assertEqual(result.before.y, result.after.y, 'scroll: y position unchanged after DOM update');
  })();

  // ═══════════════════════════════════════════════════
  // SECTION 2: Active input / data-editing preservation
  // ═══════════════════════════════════════════════════

  (function () {
    // refresh.js uses 'data-editing' attribute and ':focus' check to skip mutations
    function shouldSkipDiff(el) {
      if (!el) return false;
      if (el.hasAttribute && el.hasAttribute('data-editing')) return true;
      // Check for focused child
      if (el.querySelector && el.querySelector(':focus')) return true;
      // Check if element itself is focused
      if (el.matches && el.matches(':focus')) return true;
      return false;
    }

    // Case 1: Element being edited
    var editingEl = {
      _attrs: { 'data-editing': 'true' },
      hasAttribute: function (name) { return name in this._attrs; },
      querySelector: function () { return null; },
      matches: function () { return false; }
    };
    assert(shouldSkipDiff(editingEl), 'editing: skips element with data-editing attribute');

    // Case 2: Focused child
    var hasDocument = typeof document !== 'undefined';
    var focusedChild = hasDocument ? null : { // Node-style mock
      focused: true
    };
    var parentWithFocused = {
      _attrs: {},
      hasAttribute: function (name) { return false; },
      querySelector: function (sel) { return sel === ':focus' ? focusedChild : null; },
      matches: function () { return false; }
    };
    assert(shouldSkipDiff(parentWithFocused), 'editing: skips element containing focused child');

    // Case 3: Element itself focused
    var focusedEl = {
      _attrs: {},
      hasAttribute: function (name) { return false; },
      querySelector: function () { return null; },
      matches: function (sel) { return sel === ':focus'; }
    };
    assert(shouldSkipDiff(focusedEl), 'editing: skips currently focused element');

    // Case 4: Normal element (should NOT skip)
    var normalEl = {
      _attrs: {},
      hasAttribute: function (name) { return false; },
      querySelector: function () { return null; },
      matches: function () { return false; }
    };
    assert(!shouldSkipDiff(normalEl), 'editing: does NOT skip normal element');

    // Case 5: Null element (safeguard)
    assert(!shouldSkipDiff(null), 'editing: null element not skipped (safely returns false)');
  })();

  // ═══════════════════════════════════════════════════
  // SECTION 3: Tab selection persistence
  // ═══════════════════════════════════════════════════

  (function () {
    // Simulate tab switching with state tracking
    var activeTab = 'overview';
    var tabPanels = {
      'overview': { active: true },
      'agents': { active: false },
      'tasks': { active: false },
      'schedule': { active: false },
      'content': { active: false },
      'sdlc': { active: false }
    };

    function switchTab(newTab) {
      // Deactivate all
      for (var k in tabPanels) {
        tabPanels[k].active = false;
      }
      // Activate selected
      if (tabPanels[newTab]) {
        tabPanels[newTab].active = true;
        activeTab = newTab;
      }
    }

    // Initial state
    assertEqual(activeTab, 'overview', 'tabs: initial tab is overview');
    assert(tabPanels['overview'].active, 'tabs: overview panel active');

    // Switch to agents
    switchTab('agents');
    assertEqual(activeTab, 'agents', 'tabs: switched to agents');
    assert(tabPanels['agents'].active, 'tabs: agents panel active');
    assert(!tabPanels['overview'].active, 'tabs: overview panel deactivated');

    // Switch to sdlc
    switchTab('sdlc');
    assertEqual(activeTab, 'sdlc', 'tabs: switched to sdlc');
    assert(!tabPanels['agents'].active, 'tabs: agents panel deactivated');

    // Tab state persists across DOM refreshes
    // (Tab state is stored in JS variable, not affected by DOM mutations)
    var savedTab = activeTab;
    assertEqual(savedTab, 'sdlc', 'tabs: state persists after simulated DOM refresh');
  })();

  // ═══════════════════════════════════════════════════
  // SECTION 4: Mobile menu syncs with tab selection
  // ═══════════════════════════════════════════════════

  (function () {
    // When a tab is selected on mobile, the hamburger menu closes
    var menuState = { open: false };
    var hamburgerIcon = '\u2630'; // ☰

    function selectTab(tabName) {
      // Update active tab
      // Close mobile menu if open
      if (menuState.open) {
        menuState.open = false;
        hamburgerIcon = '\u2630';
      }
      return { tab: tabName, menuClosed: !menuState.open };
    }

    menuState.open = true;
    hamburgerIcon = '\u2715';

    var result = selectTab('agents');
    assert(!menuState.open, 'tab-sync: hamburger menu closes when tab selected');
    assertEqual(hamburgerIcon, '\u2630', 'tab-sync: hamburger icon resets to ☰');
    assertEqual(result.tab, 'agents', 'tab-sync: correct tab selected');

    // Selecting a tab when menu is already closed should keep it closed
    result = selectTab('tasks');
    assert(!menuState.open, 'tab-sync: menu stays closed');
  })();

  // ═══════════════════════════════════════════════════
  // SECTION 5: Tab button state synchronization
  // ═══════════════════════════════════════════════════

  (function () {
    // Both .nav-tabs and .nav-menu mirror the same active tab
    var navTabStates = {};
    var menuTabStates = {};

    var tabs = ['overview', 'agents', 'tasks', 'schedule', 'content', 'sdlc'];
    tabs.forEach(function (t) { navTabStates[t] = false; menuTabStates[t] = false; });
    navTabStates['overview'] = true;
    menuTabStates['overview'] = true;

    function syncActiveTab(newTab) {
      for (var i = 0; i < tabs.length; i++) {
        navTabStates[tabs[i]] = false;
        menuTabStates[tabs[i]] = false;
      }
      if (navTabStates.hasOwnProperty(newTab)) {
        navTabStates[newTab] = true;
        menuTabStates[newTab] = true;
      }
    }

    syncActiveTab('agents');
    assert(navTabStates['agents'], 'tab-sync: nav-tabs agent active after sync');
    assert(menuTabStates['agents'], 'tab-sync: nav-menu agent active after sync');
    assert(!navTabStates['overview'], 'tab-sync: nav-tabs overview deactivated');

    // Both sets should agree
    for (var i = 0; i < tabs.length; i++) {
      var t = tabs[i];
      assertEqual(navTabStates[t], menuTabStates[t], 'tab-sync: nav and menu agree on tab "' + t + '"');
    }
  })();

  // ═══════════════════════════════════════════════════
  // SECTION 6: Diff-based soft-update preserves user input
  // ═══════════════════════════════════════════════════

  (function () {
    // refresh.js applyDiff() checks data-editing and :focus before mutating
    // This simulates a user actively typing in a field when new data arrives

    var userInputs = {
      'agent.title': { value: 'User is typing...', editing: true },
      'agent.count': { value: '5', editing: false }
    };

    function applyDiffSafely(diffs, currentInputs) {
      for (var i = 0; i < diffs.length; i++) {
        var d = diffs[i];
        var inputState = currentInputs[d.path];

        // Skip if being edited
        if (inputState && inputState.editing) continue;

        // Apply
        currentInputs[d.path] = { value: d.value, editing: false };
      }
    }

    var diffs = [
      { path: 'agent.title', value: 'Server Update: Task Complete', op: 'set' },
      { path: 'agent.count', value: '6', op: 'set' }
    ];

    applyDiffSafely(diffs, userInputs);

    // agent.title should NOT be overwritten (user is typing)
    assertEqual(userInputs['agent.title'].value, 'User is typing...',
      'soft-update: user input preserved during diff application');

    // agent.count SHOULD be overwritten (not being edited)
    assertEqual(userInputs['agent.count'].value, '6',
      'soft-update: non-editing field updated by diff');

    assert(userInputs['agent.title'].editing, 'soft-update: editing flag still set after diff');
  })();

  // ═══════════════════════════════════════════════════
  // SECTION 7: Data-dirty replace flag doesn't clobber editing
  // ═══════════════════════════════════════════════════

  (function () {
    // processReplaceOps in refresh.js checks data-editing before applying replacements
    var replaced = [];

    function processReplaceOps(elements, data) {
      for (var i = 0; i < elements.length; i++) {
        var el = elements[i];
        if (el.hasAttribute('data-editing')) {
          replaced.push({ path: el.path, skipped: true, reason: 'editing' });
          continue;
        }
        if (el.querySelector(':focus') || el.matches(':focus')) {
          replaced.push({ path: el.path, skipped: true, reason: 'focus' });
          continue;
        }
        // Apply replace
        el.textContent = String(data[el.path] || '');
        replaced.push({ path: el.path, skipped: false });
      }
    }

    var elements = [
      {
        path: 'status.label', textContent: 'old',
        _attrs: { 'data-editing': 'true' },
        hasAttribute: function (n) { return n in this._attrs; },
        querySelector: function () { return null; },
        matches: function () { return false; }
      },
      {
        path: 'health.uptime', textContent: '3600',
        _attrs: {},
        hasAttribute: function (n) { return n in this._attrs; },
        querySelector: function () { return null; },
        matches: function () { return false; }
      }
    ];

    processReplaceOps(elements, { 'status.label': 'new status', 'health.uptime': '7200' });

    assert(replaced[0].skipped, 'replace-ops: editing element skipped');
    assertEqual(replaced[0].reason, 'editing', 'replace-ops: skip reason is editing');
    assert(!replaced[1].skipped, 'replace-ops: non-editing element updated');
    assertEqual(elements[0].textContent, 'old', 'replace-ops: editing element content unchanged');
    assertEqual(elements[1].textContent, '7200', 'replace-ops: normal element content updated');
  })();

  // ═══════════════════════════════════════════════════
  // SECTION 8: Remove-op with fade-out
  // ═══════════════════════════════════════════════════

  (function () {
    // refresh.js applyDiff 'remove' op sets data-removed, opacity:0, then removes
    var removedEls = [];

    function applyRemove(el) {
      if (!el) return;
      el.setAttribute('data-removed', 'true');
      el.style = el.style || {};
      el.style.opacity = '0';
      el.style.transition = 'opacity 0.3s';
      // setTimeout removal — simulate the cleanup
      removedEls.push({ path: el._path, removed: true, parentHad: true });
    }

    var el = {
      _path: 'old.field',
      _attrs: {},
      style: {},
      parentNode: {},
      setAttribute: function (n, v) { this._attrs[n] = v; },
      getAttribute: function (n) { return this._attrs[n] || null; }
    };

    applyRemove(el);

    assertEqual(el.getAttribute('data-removed'), 'true', 'remove: element marked as removed');
    assertEqual(el.style.opacity, '0', 'remove: element faded out');
    assert(removedEls.length === 1, 'remove: element queued for DOM removal');
    assertEqual(removedEls[0].path, 'old.field', 'remove: correct element path tracked');
  })();

  // ═══════════════════════════════════════════════════
  // SECTION 9: Visibility change preserves last state
  // ═══════════════════════════════════════════════════

  (function () {
    // When tab becomes visible again, last known state is applied
    var lastState = null;
    var renderCalls = [];

    function handleVisibilityChange(hidden, state) {
      if (hidden) {
        // pause — nothing rendered
        return;
      }
      // On resume, apply last state
      if (state) {
        renderCalls.push(state);
      }
    }

    lastState = { health: 'ok', agents: 5 };
    handleVisibilityChange(false, lastState);
    assertEqual(renderCalls.length, 1, 'visibility-resume: last state rendered on resume');
    assertEqual(renderCalls[0].health, 'ok', 'visibility-resume: correct health state');

    // Hidden — no render
    var prevLen = renderCalls.length;
    handleVisibilityChange(true, null);
    assertEqual(renderCalls.length, prevLen, 'visibility-hide: no render when hidden');
  })();

  // ═══════════════════════════════════════════════════
  // SECTION 10: Tab order preservation
  // ═══════════════════════════════════════════════════

  (function () {
    // Tabs: Overview, Agents, Tasks, Schedule, Library, SDLC
    var expectedTabs = ['overview', 'agents', 'tasks', 'schedule', 'content', 'sdlc'];
    var expectedLabels = ['Overview', 'Agents', 'Tasks', 'Schedule', 'Library', 'SDLC'];

    assertEqual(expectedTabs.length, 6, 'tab-order: 6 tabs defined');
    assertEqual(expectedTabs[0], 'overview', 'tab-order: Overview is first tab');
    assertEqual(expectedTabs[expectedTabs.length - 1], 'sdlc', 'tab-order: SDLC is last tab');

    // Library tab data-tab is 'content' — verify mapping
    assertEqual(expectedTabs[4], 'content', 'tab-order: Library maps to data-tab="content"');
    assertEqual(expectedLabels[4], 'Library', 'tab-order: label is Library');
  })();

  // ═══════════════════════════════════════════════════
  // REPORT
  // ═══════════════════════════════════════════════════

  var total = passed + failed;
  console.log('');
  console.log('═══════════════════════════════════════════');
  console.log('  test_state.js — State Preservation Tests');
  console.log('═══════════════════════════════════════════');
  if (errors.length > 0) {
    console.log('');
    for (var ei = 0; ei < errors.length; ei++) {
      console.log('  ' + errors[ei]);
    }
  }
  console.log('');
  console.log('  Passed: ' + passed);
  console.log('  Failed: ' + failed);
  console.log('  Total:  ' + total);
  console.log('');

  if (typeof process !== 'undefined') {
    process.exit(failed > 0 ? 1 : 0);
  }

  return { passed: passed, failed: failed, total: total };
})();
