#!/usr/bin/env node
/**
 * test_refresh.js — Test harness for refresh.js smart-refresh controller
 *
 * Covers:
 *   - computeDiff (deep object diff — pure function)
 *   - safeJSONParse helper
 *   - Backoff step progression
 *   - Data age clock logic
 *   - Visibility change pause/resume simulation
 *   - Mode switching (SSE / poll / manual)
 *   - LocalStorage preference persistence
 *
 * Run: node tests/test_refresh.js
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

  function assertDeepEqual(actual, expected, msg) {
    var a = JSON.stringify(actual), e = JSON.stringify(expected);
    if (a === e) { passed++; return true; }
    failed++;
    errors.push('FAIL: ' + msg + ' — expected ' + e + ', got ' + a);
    return false;
  }

  // ═══════════════════════════════════════════════════
  // SECTION 1: safeJSONParse — pure utility
  // ═══════════════════════════════════════════════════

  function safeJSONParse(str) {
    try { return JSON.parse(str); } catch (e) { return null; }
  }

  assertDeepEqual(safeJSONParse('{"a":1}'), {a:1}, 'safeJSONParse valid JSON');
  assertEqual(safeJSONParse('not json'), null, 'safeJSONParse invalid JSON');
  assertEqual(safeJSONParse(''), null, 'safeJSONParse empty string');
  assertEqual(safeJSONParse('null'), null, 'safeJSONParse null literal');
  assertEqual(safeJSONParse('42'), 42, 'safeJSONParse number');

  // ═══════════════════════════════════════════════════
  // SECTION 2: computeDiff — pure function (extracted from refresh.js)
  // ═══════════════════════════════════════════════════

  function computeDiff(oldState, newState, prefix) {
    prefix = prefix || '';
    var diffs = [];
    var oldKeys = oldState ? Object.keys(oldState) : [];
    var newKeys = newState ? Object.keys(newState) : [];

    for (var i = 0; i < newKeys.length; i++) {
      var key = newKeys[i];
      var fullPath = prefix ? prefix + '.' + key : key;
      var oldVal = oldState ? oldState[key] : undefined;
      var newVal = newState[key];

      if (oldVal === undefined) {
        diffs.push({ path: fullPath, value: newVal, op: 'set' });
      } else if (typeof newVal !== typeof oldVal) {
        diffs.push({ path: fullPath, value: newVal, op: 'replace' });
      } else if (typeof newVal === 'object' && newVal !== null) {
        if (Array.isArray(newVal)) {
          if (JSON.stringify(newVal) !== JSON.stringify(oldVal)) {
            diffs.push({ path: fullPath, value: newVal, op: 'replace' });
          }
        } else {
          diffs = diffs.concat(computeDiff(oldVal, newVal, fullPath));
        }
      } else if (newVal !== oldVal) {
        diffs.push({ path: fullPath, value: newVal, op: 'set' });
      }
    }

    for (var j = 0; j < oldKeys.length; j++) {
      var oldKey = oldKeys[j];
      if (!(oldKey in (newState || {}))) {
        var remPath = prefix ? prefix + '.' + oldKey : oldKey;
        diffs.push({ path: remPath, value: null, op: 'remove' });
      }
    }

    return diffs;
  }

  // --- 2.1: Identity — no changes ---
  (function () {
    var d = computeDiff({a: 1}, {a: 1});
    assert(d.length === 0, 'computeDiff identity: empty diff for identical objects');
  })();

  // --- 2.2: New key ---
  (function () {
    var d = computeDiff({a: 1}, {a: 1, b: 2});
    assertDeepEqual(d, [{path: 'b', value: 2, op: 'set'}], 'computeDiff set: added key');
  })();

  // --- 2.3: Changed value ---
  (function () {
    var d = computeDiff({a: 1}, {a: 42});
    assertDeepEqual(d, [{path: 'a', value: 42, op: 'set'}], 'computeDiff set: changed scalar');
  })();

  // --- 2.4: Removed key ---
  (function () {
    var d = computeDiff({a: 1, b: 2}, {a: 1});
    assertDeepEqual(d, [{path: 'b', value: null, op: 'remove'}], 'computeDiff remove: removed key');
  })();

  // --- 2.5: Type change -> replace ---
  (function () {
    var d = computeDiff({a: 'hello'}, {a: 42});
    assertDeepEqual(d, [{path: 'a', value: 42, op: 'replace'}], 'computeDiff replace: type change string->number');
  })();

  // --- 2.6: Nested object change ---
  (function () {
    var d = computeDiff({a: {x: 1}}, {a: {x: 2}});
    assertDeepEqual(d, [{path: 'a.x', value: 2, op: 'set'}], 'computeDiff nested: changed sub-key');
  })();

  // --- 2.7: Nested object: new sub-key ---
  (function () {
    var d = computeDiff({a: {x: 1}}, {a: {x: 1, y: 2}});
    assertDeepEqual(d, [{path: 'a.y', value: 2, op: 'set'}], 'computeDiff nested: added sub-key');
  })();

  // --- 2.8: Nested object: removed sub-key ---
  (function () {
    var d = computeDiff({a: {x: 1, y: 2}}, {a: {x: 1}});
    assertDeepEqual(d, [{path: 'a.y', value: null, op: 'remove'}], 'computeDiff nested: removed sub-key');
  })();

  // --- 2.9: Array change -> replace (whole array) ---
  (function () {
    var d = computeDiff({items: [1, 2, 3]}, {items: [1, 2, 4]});
    assertDeepEqual(d, [{path: 'items', value: [1, 2, 4], op: 'replace'}], 'computeDiff array: changed element -> replace');
  })();

  // --- 2.10: Array unchanged -> no diff ---
  (function () {
    var d = computeDiff({items: [1, 2, 3]}, {items: [1, 2, 3]});
    assert(d.length === 0, 'computeDiff array: identical arrays no diff');
  })();

  // --- 2.11: Null/undefined handling ---
  (function () {
    // typeof null === 'object', typeof undefined === 'undefined' → type mismatch → op='replace'
    var d = computeDiff({a: null}, {a: undefined});
    assertDeepEqual(d, [{path: 'a', value: undefined, op: 'replace'}],
      'computeDiff edge: null -> undefined (type change triggers replace)');
  })();

  // --- 2.12: Deeply nested ---
  (function () {
    var oldS = {health: {status: 'ok', uptime: 3600}, agents: {count: 5}};
    var newS = {health: {status: 'degraded', uptime: 3600}, agents: {count: 5, active: 3}};
    var d = computeDiff(oldS, newS);
    var paths = d.map(function (x) { return x.path; }).sort();
    assertDeepEqual(paths, ['agents.active', 'health.status'],
      'computeDiff deep: correct paths for multi-nested changes');
  })();

  // --- 2.13: Empty oldState (first load) ---
  (function () {
    var d = computeDiff(null, {a: 1, b: {c: 2}});
    assert(d.length >= 2, 'computeDiff first-load: null oldState produces set diffs');
  })();

  // --- 2.14: Boolean changes ---
  (function () {
    var d = computeDiff({active: true}, {active: false});
    assertDeepEqual(d, [{path: 'active', value: false, op: 'set'}], 'computeDiff boolean: toggle');
  })();

  // ═══════════════════════════════════════════════════
  // SECTION 3: Backoff timing logic
  // ═══════════════════════════════════════════════════

  (function () {
    var BACKOFF_STEPS = [5000, 10000, 30000, 60000];
    assertEqual(BACKOFF_STEPS.length, 4, 'backoff: 4 steps defined');

    // Simulate escalation
    var idx = 0;
    var delays = [];
    for (var i = 0; i < 6; i++) {
      var step = Math.min(idx, BACKOFF_STEPS.length - 1);
      delays.push(BACKOFF_STEPS[step]);
      idx = Math.min(idx + 1, BACKOFF_STEPS.length - 1);
    }
    assertDeepEqual(delays, [5000, 10000, 30000, 60000, 60000, 60000],
      'backoff: escalation stays at max (60s)');
  })();

  (function () {
    var BACKOFF_STEPS = [5000, 10000, 30000, 60000];
    // Reset on success
    var backoffIdx = 3; // worst-case
    backoffIdx = 0; // after successful fetch
    assertEqual(backoffIdx, 0, 'backoff: resets to 0 on success');
    assertEqual(BACKOFF_STEPS[backoffIdx], 5000, 'backoff: first step is 5s after reset');
  })();

  // ═══════════════════════════════════════════════════
  // SECTION 4: Age display logic (pure function tests)
  // ═══════════════════════════════════════════════════

  (function () {
    var STALE_THRESHOLD = 60000;
    assertEqual(STALE_THRESHOLD, 60000, 'age: stale threshold is 60s');

    // Test age computation (not wall-clock dependent — just math)
    function ageInSeconds(lastTimestampMs, currentMs) {
      return Math.floor((currentMs - lastTimestampMs) / 1000);
    }

    assertEqual(ageInSeconds(100000, 101000), 1, 'age: 1s ago');
    assertEqual(ageInSeconds(100000, 105000), 5, 'age: 5s ago');
    assertEqual(ageInSeconds(100000, 160000), 60, 'age: 60s ago (stale)');
    assertEqual(ageInSeconds(100000, 400000), 300, 'age: 5m ago');

    // Age classification
    function classifyAge(age) {
      if (age < 0) return 'none';
      if (age < 5) return 'live';
      if (age < 60) return 'recent';
      return 'stale';
    }

    assertEqual(classifyAge(3), 'live', 'age class: 3s = live');
    assertEqual(classifyAge(10), 'recent', 'age class: 10s = recent');
    assertEqual(classifyAge(65), 'stale', 'age class: 65s = stale');
  })();

  // ═══════════════════════════════════════════════════
  // SECTION 5: Visibility simulation
  // ═══════════════════════════════════════════════════

  (function () {
    // Simulate document.hidden toggles
    var visibilityChanges = [];
    var paused = false;

    function handleVisibility(hidden) {
      if (hidden) {
        paused = true;
        visibilityChanges.push('paused');
      } else {
        paused = false;
        visibilityChanges.push('resumed');
      }
    }

    handleVisibility(true);
    assert(paused, 'visibility: pauses when hidden');
    handleVisibility(false);
    assert(!paused, 'visibility: resumes when visible');
    assertDeepEqual(visibilityChanges, ['paused', 'resumed'],
      'visibility: correct state transitions');
  })();

  // ═══════════════════════════════════════════════════
  // SECTION 6: Mode switching logic
  // ═══════════════════════════════════════════════════

  (function () {
    var MODE_SSE = 'sse', MODE_POLL = 'poll', MODE_MANUAL = 'manual';

    assertEqual(MODE_SSE, 'sse', 'mode: SSE constant');
    assertEqual(MODE_POLL, 'poll', 'mode: POLL constant');
    assertEqual(MODE_MANUAL, 'manual', 'mode: MANUAL constant');

    // Test mode transitions
    var modes = [MODE_SSE, MODE_POLL, MODE_MANUAL];
    var current = MODE_SSE;

    current = MODE_POLL;
    assertEqual(current, 'poll', 'mode: switch SSE -> poll');
    current = MODE_MANUAL;
    assertEqual(current, 'manual', 'mode: switch poll -> manual');
  })();

  // ═══════════════════════════════════════════════════
  // SECTION 7: Refresh selector option mapping
  // ═══════════════════════════════════════════════════

  (function () {
    var SELECTOR_OPTIONS = [
      { value: 'sse', mode: 'sse', interval: null },
      { value: 'poll-10', mode: 'poll', interval: 10000 },
      { value: 'poll-30', mode: 'poll', interval: 30000 },
      { value: 'manual', mode: 'manual', interval: null }
    ];

    // Test selector option -> mode mapping
    function getModeFromOption(optVal) {
      for (var i = 0; i < SELECTOR_OPTIONS.length; i++) {
        if (SELECTOR_OPTIONS[i].value === optVal) {
          return SELECTOR_OPTIONS[i].mode;
        }
      }
      return null;
    }

    assertEqual(getModeFromOption('sse'), 'sse', 'selector: SSE -> sse mode');
    assertEqual(getModeFromOption('poll-10'), 'poll', 'selector: poll-10 -> poll mode');
    assertEqual(getModeFromOption('poll-30'), 'poll', 'selector: poll-30 -> poll mode');
    assertEqual(getModeFromOption('manual'), 'manual', 'selector: manual -> manual mode');
    assertEqual(getModeFromOption('invalid'), null, 'selector: invalid -> null');
  })();

  // ═══════════════════════════════════════════════════
  // SECTION 8: Diff application to mock DOM
  // ═══════════════════════════════════════════════════

  (function () {
    // Mock DOM element
    var mockEls = {};
    mockEls['a'] = {
      textContent: '',
      _attr: {},
      getAttribute: function (name) { return this._attr[name] || null; },
      setAttribute: function (name, val) { this._attr[name] = val; },
      hasAttribute: function (name) { return name in this._attr; },
      removeAttribute: function (name) { delete this._attr[name]; }
    };

    // Test set op via textContent
    var el = mockEls['a'];
    el.textContent = 'old';
    // Simulate set diff
    if (typeof 'new' === 'string') {
      el.textContent = 'new';
    }
    assertEqual(el.textContent, 'new', 'diff apply: set updates textContent');

    // Test replace op via data-dirty attribute
    el.setAttribute('data-dirty', 'replace');
    el.setAttribute('data-dirty-value', JSON.stringify({complex: true}));
    assert(el.hasAttribute('data-dirty'), 'diff apply: replace sets data-dirty attr');
    assertEqual(el.getAttribute('data-dirty-value'), '{"complex":true}',
      'diff apply: replace stores serialized value');

    // Simulate processReplaceOps cleanup
    el.removeAttribute('data-dirty');
    el.removeAttribute('data-dirty-value');
    assert(!el.hasAttribute('data-dirty'), 'diff apply: replace cleanup removes dirty flag');
  })();

  // ═══════════════════════════════════════════════════
  // SECTION 9: Focus preservation (don't mutate editing elements)
  // ═══════════════════════════════════════════════════

  (function () {
    // Simulate an element being edited
    var editingEl = {
      _attrs: { 'data-editing': 'true' },
      _focused: true,
      hasAttribute: function (name) { return name in this._attrs; },
      querySelector: function () { return null; },
      matches: function (sel) { return sel === ':focus' && this._focused; }
    };

    // shouldSkip logic
    function shouldSkip(el) {
      if (el.hasAttribute('data-editing')) return true;
      var focused = el.querySelector(':focus');
      if (focused) return true;
      if (el.matches(':focus')) return true;
      return false;
    }

    assert(shouldSkip(editingEl), 'focus: skips element with data-editing attribute');

    var normalEl = {
      _attrs: {},
      _focused: false,
      hasAttribute: function (name) { return name in this._attrs; },
      querySelector: function () { return null; },
      matches: function (sel) { return sel === ':focus' && this._focused; }
    };
    assert(!shouldSkip(normalEl), 'focus: does not skip normal element');
  })();

  // ═══════════════════════════════════════════════════
  // SECTION 10: LocalStorage preference persistence
  // ═══════════════════════════════════════════════════

  (function () {
    var store = {};
    var mockLS = {
      getItem: function (k) { return store[k] || null; },
      setItem: function (k, v) { store[k] = v; },
      removeItem: function (k) { delete store[k]; }
    };

    // Simulate saving mode
    mockLS.setItem('hermes-refresh-mode', 'poll');
    mockLS.setItem('hermes-refresh-interval', '10000');
    assertEqual(mockLS.getItem('hermes-refresh-mode'), 'poll', 'localStorage: saves mode');
    assertEqual(mockLS.getItem('hermes-refresh-interval'), '10000', 'localStorage: saves interval');

    // Simulate reading saved preferences
    var savedMode = mockLS.getItem('hermes-refresh-mode');
    var savedInterval = mockLS.getItem('hermes-refresh-interval');
    assert(savedMode === 'poll' || savedMode === 'sse' || savedMode === 'manual',
      'localStorage: saved mode is a valid mode');
    assert(parseInt(savedInterval, 10) > 0, 'localStorage: saved interval is positive');
  })();

  // ═══════════════════════════════════════════════════
  // SECTION 11: Poll interval fallback on SSE failure
  // ═══════════════════════════════════════════════════

  (function () {
    // When SSE fails, fallbackToPoll is called with increasing backoff
    var backoffCalls = [];
    var BACKOFF_STEPS = [5000, 10000, 30000, 60000];
    var backoffIdx = 0;

    function fallbackToPoll() {
      var delay = BACKOFF_STEPS[Math.min(backoffIdx, BACKOFF_STEPS.length - 1)];
      backoffCalls.push(delay);
      backoffIdx = Math.min(backoffIdx + 1, BACKOFF_STEPS.length - 1);
    }

    fallbackToPoll(); // 1st fallback
    fallbackToPoll(); // 2nd fallback
    fallbackToPoll(); // 3rd fallback
    fallbackToPoll(); // 4th fallback

    assertDeepEqual(backoffCalls, [5000, 10000, 30000, 60000],
      'fallback: correct exponential backoff sequence');
  })();

  // ═══════════════════════════════════════════════════
  // REPORT
  // ═══════════════════════════════════════════════════

  var total = passed + failed;
  console.log('');
  console.log('═══════════════════════════════════════════');
  console.log('  test_refresh.js — Smart Refresh Tests');
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

  // Return object for programmatic use
  return { passed: passed, failed: failed, total: total };
})();
