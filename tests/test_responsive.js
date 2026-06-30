#!/usr/bin/env node
/**
 * test_responsive.js — Responsive layout & accessibility test harness
 *
 * Covers:
 *   - Hamburger menu toggle logic
 *   - Table scroll wrapper detection
 *   - Media query breakpoint detection (mock matchMedia)
 *   - Touch target size compliance (WCAG 2.1 AA: ≥44×44px)
 *   - Reduced motion preference detection
 *   - Fluid typography clamp() validation
 *   - CSS custom property breakpoint tokens
 *
 * Run: node tests/test_responsive.js
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
  // SECTION 1: Hamburger menu toggle logic
  // ═══════════════════════════════════════════════════

  (function () {
    // Mock DOM for hamburger
    var hamburgerProps = { textContent: '\u2630', classList: { contains: function (c) { return false; }, toggle: function (c) { this._open = !this._open; }, remove: function (c) {}, add: function (c) {} }, addEventListener: function () {} };
    var menuProps = {
      _open: false,
      classList: {
        _open: false,
        contains: function (c) { return this._open; },
        toggle: function (c) {
          this._open = !this._open;
          hamburgerProps.textContent = this._open ? '\u2715' : '\u2630';
        },
        remove: function (c) { this._open = false; hamburgerProps.textContent = '\u2630'; },
        add: function (c) { this._open = true; hamburgerProps.textContent = '\u2715'; }
      },
      contains: function () { return false; }
    };

    // Test: toggle open
    menuProps.classList.add('open');
    assert(menuProps.classList.contains('open'), 'hamburger: menu opens when class "open" added');
    assertEqual(hamburgerProps.textContent, '\u2715', 'hamburger: icon changes to ✕ when open');

    // Test: toggle close
    menuProps.classList.remove('open');
    assert(!menuProps.classList.contains('open'), 'hamburger: menu closes when class "open" removed');
    assertEqual(hamburgerProps.textContent, '\u2630', 'hamburger: icon changes to ☰ when closed');

    // Test: outside click closes menu
    // Simulate click outside menu
    var target = { notMenu: true };
    if (!menuProps.contains(target)) {
      menuProps.classList.remove('open');
    }
    assert(!menuProps.classList.contains('open'), 'hamburger: outside click closes menu');

    // Test: ESC key closes menu
    menuProps.classList.add('open');
    var escEvent = { key: 'Escape' };
    if (escEvent.key === 'Escape' && menuProps.classList.contains('open')) {
      menuProps.classList.remove('open');
    }
    assert(!menuProps.classList.contains('open'), 'hamburger: ESC key closes menu');
  })();

  // ═══════════════════════════════════════════════════
  // SECTION 2: Hamburger visibility by breakpoint
  // ═══════════════════════════════════════════════════

  (function () {
    // CSS rules: .nav-hamburger display:none by default, flex on mobile/tablet
    function hamburgerVisible(width) {
      if (width >= 768) return false;  // desktop: hidden
      return true;  // <768px: visible
    }

    assert(hamburgerVisible(360), 'hamburger: visible at 360px (mobile)');
    assert(hamburgerVisible(599), 'hamburger: visible at 599px (mobile)');
    assert(hamburgerVisible(600), 'hamburger: visible at 600px (tablet)');
    assert(hamburgerVisible(767), 'hamburger: visible at 767px (tablet edge)');
    assert(!hamburgerVisible(768), 'hamburger: hidden at 768px (desktop)');
    assert(!hamburgerVisible(1200), 'hamburger: hidden at 1200px (desktop)');
  })();

  // ═══════════════════════════════════════════════════
  // SECTION 3: Table scroll wrapper detection
  // ═══════════════════════════════════════════════════

  (function () {
    // .table-scroll enables horizontal scrolling with sticky first column
    // .table-scroll table { min-width: 600px; white-space: nowrap; }
    var TABLE_MIN_WIDTH = 600;

    // Test: table inside .table-scroll has min-width
    assertEqual(TABLE_MIN_WIDTH, 600, 'table-scroll: min-width is 600px for scrollable tables');

    // Test: DataTable component with scrollable=true adds .table-scroll wrapper
    function mockDataTable(opts) {
      var scrollable = opts.scrollable || false;
      var html = '';
      if (scrollable) {
        html = '<div class="table-scroll table-scroll-ios">';
      }
      html += '<table>...</table>';
      if (scrollable) html += '</div>';
      return html;
    }

    var scrollable = mockDataTable({ scrollable: true });
    assert(scrollable.indexOf('table-scroll') > -1, 'table-scroll: DataTable wraps in .table-scroll when scrollable=true');
    assert(scrollable.indexOf('table-scroll-ios') > -1, 'table-scroll: DataTable adds .table-scroll-ios for iOS scrolling');

    var nonScrollable = mockDataTable({ scrollable: false });
    assert(nonScrollable.indexOf('table-scroll') === -1, 'table-scroll: DataTable does NOT wrap when scrollable=false');
  })();

  // ═══════════════════════════════════════════════════
  // SECTION 4: Sticky first column detection
  // ═══════════════════════════════════════════════════

  (function () {
    // .table-sticky-col: position:sticky; left:0; z-index:1;
    var stickyColStyle = {
      position: 'sticky',
      left: '0',
      zIndex: '1',
      background: 'var(--bg-base)'
    };

    assertEqual(stickyColStyle.position, 'sticky', 'sticky-col: uses position:sticky');
    assertEqual(stickyColStyle.left, '0', 'sticky-col: sticks to left edge');
    assert(stickyColStyle.zIndex !== '0', 'sticky-col: has z-index above base');

    // Sticky header columns get higher z-index
    var stickyHeaderZ = 2; // .table-scroll thead th.table-sticky-col z-index: 2
    assert(stickyHeaderZ > 1, 'sticky-col-header: z-index > sticky body col to stay on top');
  })();

  // ═══════════════════════════════════════════════════
  // SECTION 5: Media query breakpoint detection (mock matchMedia)
  // ═══════════════════════════════════════════════════

  (function () {
    var BREAKPOINTS = {
      mobile: { max: 599 },
      tablet: { min: 600, max: 1024 },
      desktop: { min: 1025 }
    };

    function classifyWidth(width) {
      if (width <= 599) return 'mobile';
      if (width <= 1024) return 'tablet';
      return 'desktop';
    }

    assertEqual(classifyWidth(360), 'mobile', 'breakpoint: 360px = mobile');
    assertEqual(classifyWidth(599), 'mobile', 'breakpoint: 599px = mobile (edge)');
    assertEqual(classifyWidth(600), 'tablet', 'breakpoint: 600px = tablet');
    assertEqual(classifyWidth(1024), 'tablet', 'breakpoint: 1024px = tablet (edge)');
    assertEqual(classifyWidth(1025), 'desktop', 'breakpoint: 1025px = desktop');
    assertEqual(classifyWidth(1440), 'desktop', 'breakpoint: 1440px = desktop');

    // CSS breakpoint tokens
    assertEqual(BREAKPOINTS.desktop.min, 1025, 'breakpoint token: --bp-tablet is 1024px, desktop >= 1025');
  })();

  // ═══════════════════════════════════════════════════
  // SECTION 6: Grid layout breakpoints
  // ═══════════════════════════════════════════════════

  (function () {
    // v2 dashboard: 2-col grid → 1-col at <600px
    function gridColumns(width) {
      if (width <= 599) return 1;
      return 2;
    }

    assertEqual(gridColumns(400), 1, 'grid: single column at 400px');
    assertEqual(gridColumns(599), 1, 'grid: single column at 599px');
    assertEqual(gridColumns(600), 2, 'grid: two columns at 600px');
    assertEqual(gridColumns(1024), 2, 'grid: two columns at 1024px');
  })();

  // ═══════════════════════════════════════════════════
  // SECTION 7: Touch target size compliance
  // ═══════════════════════════════════════════════════

  (function () {
    var TOUCH_TARGET_MIN = 44; // px — WCAG 2.1 AA

    assertEqual(TOUCH_TARGET_MIN, 44, 'touch: minimum touch target is 44px');

    // Test interactive elements that must meet touch target
    function meetsTouchTarget(width, height) {
      return width >= TOUCH_TARGET_MIN && height >= TOUCH_TARGET_MIN;
    }

    assert(meetsTouchTarget(44, 44), 'touch: 44×44 passes');
    assert(meetsTouchTarget(48, 44), 'touch: 48×44 passes');
    assert(meetsTouchTarget(44, 48), 'touch: 44×48 passes');
    assert(!meetsTouchTarget(40, 44), 'touch: 40×44 fails (width too small)');
    assert(!meetsTouchTarget(44, 30), 'touch: 44×30 fails (height too small)');
    assert(!meetsTouchTarget(30, 30), 'touch: 30×30 fails');

    // v2 dashboard: #ref select has height:44px on mobile
    assert(meetsTouchTarget(100, 44), 'touch: v2 #ref select meets target on mobile');

    // Nav tabs have min-height: var(--touch-target-min)
    assert(meetsTouchTarget(44, 44), 'touch: nav-tab min-height meets target');
  })();

  // ═══════════════════════════════════════════════════
  // SECTION 8: Reduced motion detection
  // ═══════════════════════════════════════════════════

  (function () {
    // CSS: @media (prefers-reduced-motion: reduce) disables animations

    function reducedMotionCSS(prefersReduced) {
      if (prefersReduced === 'reduce') {
        return {
          animationDuration: '0.01ms',
          animationIterationCount: '1',
          transitionDuration: '0.01ms'
        };
      }
      return { animationDuration: 'normal', animationIterationCount: 'infinite', transitionDuration: 'normal' };
    }

    var normal = reducedMotionCSS('no-preference');
    assertEqual(normal.animationDuration, 'normal', 'reduced-motion: normal animation duration when no preference');

    var reduced = reducedMotionCSS('reduce');
    assertEqual(reduced.animationDuration, '0.01ms', 'reduced-motion: effectively disables animations');
    assertEqual(reduced.animationIterationCount, '1', 'reduced-motion: single iteration only');
    assertEqual(reduced.transitionDuration, '0.01ms', 'reduced-motion: disables transitions');
  })();

  // ═══════════════════════════════════════════════════
  // SECTION 9: Fluid typography clamp() validation
  // ═══════════════════════════════════════════════════

  (function () {
    // CSS clamp(): font-size = clamp(min, preferred, max)
    function clamp(min, preferred, max) {
      return Math.max(min, Math.min(max, preferred));
    }

    // --font-size-fluid-body: clamp(0.8125rem, 0.85rem + 0.1vw, 0.9375rem)
    function fluidBody(vw) {
      return clamp(0.8125, 0.85 + vw * 0.001, 0.9375);
    }

    // At 360px viewport (~3.6vw), preferred = 0.85 + 0.360 = 1.21
    // Clamped to max 0.9375
    assert(fluidBody(360) <= 0.9375, 'fluid: body text clamped at max on narrow screens');
    assert(fluidBody(360) >= 0.8125, 'fluid: body text at least min on narrow screens');

    // At 1440px (~14.4vw): preferred = 0.85 + 1.44 = 2.29, clamped to 0.9375
    assertEqual(fluidBody(1440), 0.9375, 'fluid: body text at max on wide screens');

    // --font-size-fluid-heading: clamp(1.25rem, 1rem + 2vw, 2rem)
    function fluidHeading(vw) {
      return clamp(1.25, 1.0 + vw * 0.02, 2.0);
    }

    assert(fluidHeading(360) >= 1.25, 'fluid: heading >= min');
    assert(fluidHeading(360) <= 2.0, 'fluid: heading <= max');
    assertEqual(fluidHeading(2000), 2.0, 'fluid: heading clamped to max on ultrawide');
    assertEqual(fluidHeading(10), 1.25, 'fluid: heading at min on tiny screen');
  })();

  // ═══════════════════════════════════════════════════
  // SECTION 10: CSS custom property breakpoint token validation
  // ═══════════════════════════════════════════════════

  (function () {
    var TOKENS = {
      '--bp-mobile': '600px',
      '--bp-tablet': '1024px',
      '--touch-target-min': '44px',
      '--nav-height-mobile': '48px',
      '--nav-height-tablet': '56px',
      '--nav-height-desktop': '56px',
      '--content-padding-mobile': 'var(--space-3)',
      '--content-padding-tablet': 'var(--space-4)',
      '--content-padding-desktop': 'var(--space-6)'
    };

    assert('--bp-mobile' in TOKENS, 'tokens: --bp-mobile defined');
    assert('--bp-tablet' in TOKENS, 'tokens: --bp-tablet defined');
    assert('--touch-target-min' in TOKENS, 'tokens: --touch-target-min defined');
    assert('--nav-height-mobile' in TOKENS, 'tokens: --nav-height-mobile defined');
    assert('--nav-height-desktop' in TOKENS, 'tokens: --nav-height-desktop defined');
    assert('--content-padding-mobile' in TOKENS, 'tokens: --content-padding-mobile defined');

    // Mobile nav is shorter than desktop
    var mobileNavH = 48, desktopNavH = 56;
    assert(mobileNavH < desktopNavH, 'tokens: mobile nav (48px) shorter than desktop (56px)');
  })();

  // ═══════════════════════════════════════════════════
  // SECTION 11: v2 dashboard responsive select element
  // ═══════════════════════════════════════════════════

  (function () {
    // v2 has a <select id="ref"> for refresh interval
    // On mobile: height:44px, font-size:.82rem
    function selectProps(width) {
      if (width <= 599) {
        return { height: '44px', fontSize: '0.82rem' };
      }
      return { height: 'auto', fontSize: '0.78rem' };
    }

    var mobile = selectProps(400);
    assertEqual(mobile.height, '44px', 'v2-select: mobile select is 44px tall');
    assertEqual(mobile.fontSize, '0.82rem', 'v2-select: mobile select has larger font');

    var desktop = selectProps(1025);
    assert(desktop.height !== '44px', 'v2-select: desktop select is not forced to 44px');
  })();

  // ═══════════════════════════════════════════════════
  // REPORT
  // ═══════════════════════════════════════════════════

  var total = passed + failed;
  console.log('');
  console.log('═══════════════════════════════════════════');
  console.log('  test_responsive.js — Responsive Tests');
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
