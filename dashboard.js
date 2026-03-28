import { supabase } from "./supabase-config.js";

const urlParams = new URLSearchParams(window.location.search);
const QUIZ_ID = (urlParams.get("quizId") || "").trim();

const DOM = {
  quizId: document.getElementById("quiz-id"),
  quizTitle: document.getElementById("quiz-title"),
  subCount: document.getElementById("sub-count"),
  subtitle: document.getElementById("dash-subtitle"),
  error: document.getElementById("dash-error"),
  rows: document.getElementById("submission-rows"),
};

function showError(msg) {
  DOM.error.textContent = msg;
  DOM.error.classList.remove("hidden");
}

function escapeText(val) {
  return String(val ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDate(val) {
  if (!val) return "--";
  const d = new Date(val);
  if (Number.isNaN(d.getTime())) return "--";
  return d.toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function getScoreBadge(score, total) {
  const pct = total > 0 ? Math.round((score / total) * 100) : 0;
  const cls = pct >= 70 ? "good" : pct >= 40 ? "ok" : "bad";
  return `<span class="score-badge ${cls}">${score}/${total} (${pct}%)</span>`;
}

function getViolationClass(val, warnThreshold = 3, dangerThreshold = 5) {
  if (val >= dangerThreshold) return "danger";
  if (val >= warnThreshold) return "warn";
  return "";
}

function renderRows(submissions) {
  DOM.subCount.textContent = String(submissions.length);

  if (!submissions.length) {
    DOM.rows.innerHTML = `
      <tr><td colspan="10" class="dashboard-empty">
        <div class="dashboard-empty-icon">📋</div>
        <h3>No submissions yet</h3>
        <p>Share the quiz link with students. Submissions will appear here in real-time.</p>
      </td></tr>`;
    return;
  }

  DOM.rows.innerHTML = submissions.map((sub, idx) => {
    const name = escapeText(sub.student_name || sub.studentName || "Unknown");
    const usn = escapeText(sub.student_id || sub.studentId || "--");

    const scoreFromText = typeof sub.score_text === "string" && sub.score_text.includes("/")
      ? sub.score_text.split("/").map((item) => Number.parseInt(item, 10))
      : [];
    const score = Number.isFinite(sub.score_correct) ? sub.score_correct
      : Number.isFinite(sub.scoreCorrect) ? sub.scoreCorrect
      : Number.isFinite(scoreFromText[0]) ? scoreFromText[0]
      : 0;
    const total = Number.isFinite(sub.score_total) ? sub.score_total
      : Number.isFinite(sub.scoreTotal) ? sub.scoreTotal
      : Number.isFinite(scoreFromText[1]) ? scoreFromText[1]
      : 0;

    const tabs = Number(sub.tab_switches ?? sub.tabSwitches ?? 0);
    const fs = Number(sub.fullscreen_exits ?? sub.fullscreenExits ?? 0);
    const ss = Number(sub.screenshot_attempts ?? sub.screenshotAttempts ?? 0);
    const device = escapeText(sub.device || "--");
    const autoSubmit = Boolean(sub.auto_submit ?? sub.autoSubmit);
    const submittedAt = formatDate(sub.created_at || sub.submitted_at_iso || sub.submittedAt || sub.timestamp);

    const tabsCls = getViolationClass(tabs);
    const fsCls = getViolationClass(fs);
    const ssCls = getViolationClass(ss);

    const totalViolations = tabs + fs + ss;
    const integrityCls = totalViolations >= 5 ? "flagged" : "clean";
    const integrityLabel = totalViolations >= 5 ? "Flagged" : "Clean";

    return `
      <tr>
        <td>${idx + 1}</td>
        <td><strong>${name}</strong></td>
        <td>${usn}</td>
        <td>${getScoreBadge(score, total)}</td>
        <td class="violation-cell"><span class="${tabsCls}">${tabs}</span></td>
        <td class="violation-cell"><span class="${fsCls}">${fs}</span></td>
        <td class="violation-cell"><span class="${ssCls}">${ss}</span></td>
        <td>${device}</td>
        <td>
          <span class="integrity-pill ${integrityCls}">${integrityLabel}</span>
          ${autoSubmit ? '<span class="auto-submit-tag">AUTO</span>' : ""}
        </td>
        <td class="time-cell">${submittedAt}</td>
      </tr>
    `;
  }).join("");
}

async function init() {
  if (!QUIZ_ID) {
    DOM.subtitle.textContent = "Missing quiz ID";
    showError("No quizId found in the URL. Open this page from the Create Quiz page.");
    return;
  }

  DOM.quizId.textContent = QUIZ_ID;

  try {
    const { data: quizData, error: quizError } = await supabase
      .from("quizzes")
      .select("id, title")
      .eq("id", QUIZ_ID)
      .single();

    if (quizError || !quizData) {
      DOM.subtitle.textContent = "Quiz not found";
      showError("Quiz not found. The quiz may have been deleted or the link is incorrect.");
      return;
    }

    const title = quizData.title || "Untitled Quiz";
    DOM.quizTitle.textContent = title;
    DOM.subtitle.textContent = `Live submissions for "${title}"`;
    document.title = `Dashboard — ${title} | SecureQuiz`;

    const loadSubmissions = async () => {
      const { data: submissions, error: submissionsError } = await supabase
        .from("submissions")
        .select("*")
        .eq("quiz_id", QUIZ_ID)
        .order("created_at", { ascending: false });

      if (submissionsError) throw submissionsError;
      renderRows(submissions || []);
    };

    await loadSubmissions();

    supabase
      .channel(`submissions-${QUIZ_ID}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "submissions", filter: `quiz_id=eq.${QUIZ_ID}` },
        () => {
          void loadSubmissions();
        }
      )
      .subscribe();

  } catch (err) {
    console.error("[SecureQuiz] Dashboard init error:", err);
    showError("Failed to load quiz: " + err.message);
  }
}

init();
