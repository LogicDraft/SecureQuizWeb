/**
 * theme.js — SecureQuiz UI Theme Manager
 *
 * FOUC prevention: the IIFE at the top runs synchronously during HTML parsing,
 * before any paint occurs, so the correct data-ui attribute is always on <html>
 * before the browser renders a single pixel of <body>.
 */

// ─── Synchronous IIFE: eliminates Flash of Unstyled Content ───────────────────
// Runs immediately on script parse — no DOMContentLoaded wait needed.
(function () {
  try {
    const savedUI = localStorage.getItem('secureQuiz_ui_pref')
      || localStorage.getItem('theme')
      || localStorage.getItem('securequiz_theme')
      || 'glass';
    document.documentElement.setAttribute('data-ui', savedUI);
  } catch (e) {
    // localStorage blocked (private browsing, etc.) — default to glass
    document.documentElement.setAttribute('data-ui', 'glass');
  }
})();

// ─── Constants ────────────────────────────────────────────────────────────────
const THEME_KEY = 'secureQuiz_ui_pref';
const LEGACY_THEME_KEY_1 = 'theme';
const LEGACY_THEME_KEY_2 = 'securequiz_theme';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function syncToggleButtons(theme) {
  const toggleBtns = document.querySelectorAll('.btn-theme-switch, .btn-icon-toggle');
  toggleBtns.forEach((btn) => {
    btn.classList.toggle('is-minimal', theme === 'minimal');
    btn.setAttribute('role', 'switch');
    btn.setAttribute('aria-checked', theme === 'minimal' ? 'true' : 'false');
    btn.setAttribute('aria-label', 'Switch UI');
    btn.setAttribute('title', theme === 'minimal' ? 'Switch UI (Minimal)' : 'Switch UI (Glass)');
  });
}

/**
 * Apply a theme by setting data-ui on <html> only.
 * The CSS selectors in minimal.css / style.css now use `html[data-ui=...]`
 * so styling is applied as soon as the attribute lands on the root element —
 * no body reference needed, no FOUC possible.
 */
function applyTheme(theme) {
  document.documentElement.setAttribute('data-ui', theme);
  syncToggleButtons(theme);
}

// ─── OS preference fallback ───────────────────────────────────────────────────
const mediaQueryLight = typeof window.matchMedia === 'function'
  ? window.matchMedia('(prefers-color-scheme: light)')
  : null;
const defaultTheme = mediaQueryLight && mediaQueryLight.matches ? 'minimal' : 'glass';

// Read from the unified key first, fall back to legacy keys
const savedTheme = localStorage.getItem(THEME_KEY)
  || localStorage.getItem(LEGACY_THEME_KEY_1)
  || localStorage.getItem(LEGACY_THEME_KEY_2);

// Sync the html attribute with whatever the IIFE already set (in case of OS default)
applyTheme(savedTheme || defaultTheme);

// ─── DOM wiring (deferred until body is ready) ────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  syncToggleButtons(savedTheme || defaultTheme);

  // Live OS theme change (only when user hasn't hard-locked a preference)
  if (mediaQueryLight) {
    mediaQueryLight.addEventListener('change', (e) => {
      const hasLocked = localStorage.getItem(THEME_KEY)
        || localStorage.getItem(LEGACY_THEME_KEY_1)
        || localStorage.getItem(LEGACY_THEME_KEY_2);
      if (!hasLocked) {
        applyTheme(e.matches ? 'minimal' : 'glass');
      }
    });
  }

  // Toggle button click handler
  document.querySelectorAll('.btn-theme-switch, .btn-icon-toggle').forEach((btn) => {
    btn.addEventListener('click', () => {
      const currentTheme = document.documentElement.getAttribute('data-ui') || 'glass';
      const newTheme = currentTheme === 'glass' ? 'minimal' : 'glass';
      localStorage.setItem(THEME_KEY, newTheme);
      applyTheme(newTheme);
    });
  });
});
