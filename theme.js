const THEME_KEY = "theme";
const LEGACY_THEME_KEY = "securequiz_theme";

function syncToggleButtons(theme) {
  const toggleBtns = document.querySelectorAll(".btn-theme-switch");
  toggleBtns.forEach((btn) => {
    btn.classList.toggle("is-minimal", theme === "minimal");
    btn.setAttribute("role", "switch");
    btn.setAttribute("aria-checked", theme === "minimal" ? "true" : "false");
    btn.setAttribute("aria-label", "Switch UI");
    btn.setAttribute("title", theme === "minimal" ? "Switch UI (Minimal)" : "Switch UI (Glass)");
  });
}

function applyTheme(theme) {
  document.documentElement.setAttribute("data-ui", theme);
  if (document.body) {
    document.body.setAttribute("data-ui", theme);
  }
  
  syncToggleButtons(theme);
}

// 1. Determine fallback from user's OS preference (Dark = Glass, Light = Minimal)
const systemPrefersLight = window.matchMedia("(prefers-color-scheme: light)").matches;
const defaultTheme = systemPrefersLight ? "minimal" : "glass";

// 2. Immediately apply saved theme on parse to avoid flashing styles
const savedTheme = localStorage.getItem(THEME_KEY) || localStorage.getItem(LEGACY_THEME_KEY) || defaultTheme;
if (savedTheme === "minimal" || savedTheme === "glass") {
  localStorage.setItem(THEME_KEY, savedTheme);
}
applyTheme(savedTheme);

// 2. Attach click handlers to any theme toggle buttons on DOM load
document.addEventListener("DOMContentLoaded", () => {
  if (document.body) {
    document.body.setAttribute("data-ui", savedTheme);
  }
  syncToggleButtons(savedTheme);
  const toggleBtns = document.querySelectorAll(".btn-theme-switch");
  toggleBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      const currentTheme = document.documentElement.getAttribute("data-ui") || "glass";
      const newTheme = currentTheme === "glass" ? "minimal" : "glass";
      
      // Save and apply
      localStorage.setItem(THEME_KEY, newTheme);
      applyTheme(newTheme);
    });
  });
});
