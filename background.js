/* ─────────────────────────────────────────────────────────────────
   background.js — Interactive Canvas Background & Cursor
───────────────────────────────────────────────────────────────────*/
function initCanvasBackground(options = {}) {
  const { disabled = false } = options;

  if (typeof window.__secureQuizBackgroundCleanup === "function") {
    window.__secureQuizBackgroundCleanup();
    window.__secureQuizBackgroundCleanup = null;
  }

  const canvas = document.getElementById("canvas");
  const cursor = document.getElementById("cursor") || document.getElementById("custom-cursor");
  if (!canvas || !cursor) return null;

  canvas.hidden = !!disabled;
  cursor.hidden = !!disabled;
  cursor.style.opacity = "0";
  cursor.classList.remove("hover");

  if (disabled) {
    return null;
  }

  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) return null;

  let width = window.innerWidth;
  let height = window.innerHeight;
  let mouseX = width / 2;
  let mouseY = height / 2;
  let targetX = mouseX;
  let targetY = mouseY;
  let cursorVisible = false;
  let drawFrameId = 0;
  let cursorFrameId = 0;
  let disposed = false;

  const gridSpacing = 40;
  const dotRadius = 1.5;
  const interactionRadius = 180;
  const maxScale = 3.5;
  const maxDisplacement = 25;
  const dots = [];

  function readPalette() {
    const styles = getComputedStyle(document.documentElement);
    return {
      base: styles.getPropertyValue("--canvas-base").trim() || "#050508",
      glowPrimary: styles.getPropertyValue("--canvas-glow-primary").trim() || "rgba(59, 130, 246, 0.12)",
      glowSecondary: styles.getPropertyValue("--canvas-glow-secondary").trim() || "rgba(59, 130, 246, 0.05)",
      dot: styles.getPropertyValue("--canvas-dot").trim() || "rgba(156, 163, 175, 0.08)",
      dotGlow: styles.getPropertyValue("--canvas-dot-glow").trim() || "rgba(59, 130, 246, 0.22)",
    };
  }

  let palette = readPalette();

  function initDots() {
    dots.length = 0;

    for (let x = gridSpacing; x < width; x += gridSpacing) {
      for (let y = gridSpacing; y < height; y += gridSpacing) {
        dots.push({
          baseX: x,
          baseY: y,
          x,
          y,
          scale: 1,
          opacity: 0.08,
          vx: 0,
          vy: 0,
        });
      }
    }
  }

  function distance(x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function lerp(start, end, factor) {
    return start + (end - start) * factor;
  }

  function easeOutQuart(value) {
    return 1 - Math.pow(1 - value, 4);
  }

  function withAlpha(color, alpha) {
    const rgbaMatch = color.match(/rgba?\(([^)]+)\)/i);
    if (!rgbaMatch) return color;

    const channels = rgbaMatch[1]
      .split(",")
      .slice(0, 3)
      .map((channel) => channel.trim());

    return `rgba(${channels.join(", ")}, ${alpha})`;
  }

  function updateCanvasSize() {
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;
    initDots();
  }

  function draw() {
    if (disposed) return;

    ctx.fillStyle = palette.base;
    ctx.fillRect(0, 0, width, height);

    const gradient = ctx.createRadialGradient(mouseX, mouseY, 0, mouseX, mouseY, interactionRadius);
    gradient.addColorStop(0, palette.glowPrimary);
    gradient.addColorStop(0.4, palette.glowSecondary);
    gradient.addColorStop(1, "rgba(59, 130, 246, 0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    for (const dot of dots) {
      const dist = distance(dot.baseX, dot.baseY, mouseX, mouseY);

      if (dist < interactionRadius) {
        const influence = 1 - dist / interactionRadius;
        const easedInfluence = easeOutQuart(influence);
        const angle = Math.atan2(mouseY - dot.baseY, mouseX - dot.baseX);
        const pushDistance = easedInfluence * maxDisplacement;

        const nextX = dot.baseX - Math.cos(angle) * pushDistance;
        const nextY = dot.baseY - Math.sin(angle) * pushDistance;

        dot.vx = (nextX - dot.x) * 0.2;
        dot.vy = (nextY - dot.y) * 0.2;
        dot.x += dot.vx;
        dot.y += dot.vy;
        dot.scale = lerp(dot.scale, 1 + easedInfluence * maxScale, 0.15);
        dot.opacity = lerp(dot.opacity, 0.08 + easedInfluence * 0.7, 0.15);
      } else {
        dot.vx = (dot.baseX - dot.x) * 0.1;
        dot.vy = (dot.baseY - dot.y) * 0.1;
        dot.x += dot.vx;
        dot.y += dot.vy;
        dot.scale = lerp(dot.scale, 1, 0.1);
        dot.opacity = lerp(dot.opacity, 0.08, 0.1);
      }

      ctx.save();
      ctx.translate(dot.x, dot.y);
      ctx.scale(dot.scale, dot.scale);

      ctx.beginPath();
      ctx.arc(0, 0, dotRadius, 0, Math.PI * 2);
      ctx.fillStyle = withAlpha(palette.dot, dot.opacity);
      ctx.fill();

      if (dot.scale > 1.5) {
        ctx.beginPath();
        ctx.arc(0, 0, dotRadius * 2.5, 0, Math.PI * 2);
        const glowOpacity = (dot.scale - 1.5) * 0.15;
        ctx.fillStyle = withAlpha(palette.dotGlow, glowOpacity);
        ctx.fill();
      }

      ctx.restore();
    }

    drawFrameId = requestAnimationFrame(draw);
  }

  function updateCursor(event) {
    if (disposed) return;

    targetX = event.clientX;
    targetY = event.clientY;
    cursor.style.left = `${event.clientX}px`;
    cursor.style.top = `${event.clientY}px`;

    if (!cursorVisible) {
      cursor.style.opacity = "1";
      cursorVisible = true;
    }
  }

  function smoothCursor() {
    if (disposed) return;

    mouseX = lerp(mouseX, targetX, 0.15);
    mouseY = lerp(mouseY, targetY, 0.15);
    cursorFrameId = requestAnimationFrame(smoothCursor);
  }

  function handleMouseOver(event) {
    if (event.target.closest("button, .btn, input, textarea, select, .option-btn, .nav-dot, a")) {
      cursor.classList.add("hover");
    }
  }

  function handleMouseOut(event) {
    if (event.target.closest("button, .btn, input, textarea, select, .option-btn, .nav-dot, a")) {
      cursor.classList.remove("hover");
    }
  }

  function handleThemeChange() {
    palette = readPalette();
  }

  updateCanvasSize();

  window.addEventListener("mousemove", updateCursor);
  window.addEventListener("resize", updateCanvasSize);
  window.addEventListener("securequiz:themechange", handleThemeChange);
  document.body.addEventListener("mouseover", handleMouseOver);
  document.body.addEventListener("mouseout", handleMouseOut);

  function cleanup() {
    disposed = true;
    cancelAnimationFrame(drawFrameId);
    cancelAnimationFrame(cursorFrameId);
    window.removeEventListener("mousemove", updateCursor);
    window.removeEventListener("resize", updateCanvasSize);
    window.removeEventListener("securequiz:themechange", handleThemeChange);
    document.body.removeEventListener("mouseover", handleMouseOver);
    document.body.removeEventListener("mouseout", handleMouseOut);
    cursor.style.opacity = "0";
    cursor.classList.remove("hover");
  }

  window.__secureQuizBackgroundCleanup = cleanup;

  draw();
  smoothCursor();

  return cleanup;
}

window.initCanvasBackground = initCanvasBackground;

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    initCanvasBackground({ disabled: document.body.classList.contains("ambient-effects-off") });
  });
} else {
  initCanvasBackground({ disabled: document.body.classList.contains("ambient-effects-off") });
}
