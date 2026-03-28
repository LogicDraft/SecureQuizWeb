import { db } from "./firebase-config.js";
import {
  doc,
  getDoc,
  collection,
  query,
  orderBy,
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

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
  if (typeof val === "object" && typeof val.toDate === "function") {
    return val.toDate().toLocaleString("en-IN", {
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  }
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
    const name = escapeText(sub.studentName || "Unknown");
    const usn = escapeText(sub.studentId || "--");
    const score = Number.isFinite(sub.score) ? sub.score : 0;
    const total = Number.isFinite(sub.totalQuestions) ? sub.totalQuestions : 0;
    const logs = sub.proctorLogs || {};
    const tabs = Number(logs.tabSwitches || 0);
    const fs = Number(logs.fullscreenExits || 0);
    const ss = Number(logs.screenshotAttempts || 0);
    const device = escapeText(sub.device || "--");
    const autoSubmit = sub.autoSubmit;
    const submittedAt = formatDate(sub.submittedAt || sub.timestamp);

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
    const quizSnap = await getDoc(doc(db, "quizzes", QUIZ_ID));
    if (!quizSnap.exists()) {
      DOM.subtitle.textContent = "Quiz not found";
      showError("Quiz not found. The quiz may have been deleted or the link is incorrect.");
      return;
    }

    const quizData = quizSnap.data();
    const title = quizData.title || "Untitled Quiz";
    DOM.quizTitle.textContent = title;
    DOM.subtitle.textContent = `Live submissions for "${title}"`;
    document.title = `Dashboard — ${title} | SecureQuiz`;

    const submissionsRef = collection(db, "quizzes", QUIZ_ID, "submissions");
    const q = query(submissionsRef, orderBy("submittedAt", "desc"));

    onSnapshot(q, (snapshot) => {
      const subs = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      renderRows(subs);
    }, (err) => {
      console.error("[SecureQuiz] Dashboard listener error:", err);
      showError("Failed to load submissions: " + err.message);
    });

  } catch (err) {
    console.error("[SecureQuiz] Dashboard init error:", err);
    showError("Failed to load quiz: " + err.message);
  }
}

init();
