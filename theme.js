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

// Helper function to apply classes to the body
function applyTheme(theme) {
  if (theme === "minimal") {
    document.body.classList.remove("glass-theme");
    document.body.classList.add("minimal-theme");
  } else {
    document.body.classList.remove("minimal-theme");
    document.body.classList.add("glass-theme");
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
  syncToggleButtons(savedTheme);
  const toggleBtns = document.querySelectorAll(".btn-theme-switch");
  toggleBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      // Determine the next theme
      const currentTheme = document.body.classList.contains("minimal-theme") ? "minimal" : "glass";
      const newTheme = currentTheme === "glass" ? "minimal" : "glass";
      
      // Save and apply
      localStorage.setItem(THEME_KEY, newTheme);
      applyTheme(newTheme);
    });
  });
});
