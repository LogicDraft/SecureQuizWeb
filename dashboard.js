import { db } from "./firebase-config.js";
import {
  doc,
  getDoc,
  collection,
  query,
  orderBy,
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const DOM = {
  quizId: document.getElementById("quiz-id"),
  quizTitle: document.getElementById("quiz-title"),
  subCount: document.getElementById("sub-count"),
  subtitle: document.getElementById("dash-subtitle"),
  error: document.getElementById("dash-error"),
  rows: document.getElementById("submission-rows"),
};

function showError(message) {
  DOM.error.textContent = message;
  DOM.error.classList.remove("hidden");
}

function escapeText(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDate(value) {
  if (!value) return "--";

  if (typeof value === "object" && typeof value.toDate === "function") {
    return value.toDate().toLocaleString();
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleString();
}

function getStatusBadge(item) {
  if (item.autoSubmit) return "<span class=\"dash-pill danger\">Auto-Submitted</span>";
  return "<span class=\"dash-pill success\">Completed</span>";
}

function renderRows(items) {
  DOM.subCount.textContent = String(items.length);

  if (!items.length) {
    DOM.rows.innerHTML = '<tr><td colspan="5" class="dashboard-empty">No submissions yet.</td></tr>';
    return;
  }

  DOM.rows.innerHTML = items
    .map((item) => {
      const studentName = escapeText(item.studentName || "Unknown");
      const studentId = escapeText(item.studentId || "--");
      const score = Number.isFinite(item.scoreCorrect) && Number.isFinite(item.scoreTotal)
        ? `${item.scoreCorrect}/${item.scoreTotal}`
        : escapeText(item.scoreText || "--");
      const submittedAt = formatDate(item.createdAt || item.submittedAtISO);

      const tabs = Number(item.tabSwitches || 0);
      const fs = Number(item.fullscreenExits || 0);
      const ss = Number(item.screenshotAttempts || 0);

      return `
        <tr>
          <td>
            <div class="student-cell">
              <strong>${studentName}</strong>
              <span>${studentId}</span>
            </div>
          </td>
          <td><strong>${score}</strong></td>
          <td>${escapeText(submittedAt)}</td>
          <td>
            <div class="integrity-cell">
              <span>Tabs: ${tabs}</span>
              <span>FS: ${fs}</span>
              <span>SS: ${ss}</span>
            </div>
          </td>
          <td>${getStatusBadge(item)}</td>
        </tr>
      `;
    })
    .join("");
}

async function initDashboard() {
  const params = new URLSearchParams(window.location.search);
  const quizId = (params.get("quizId") || "").trim();

  if (!quizId) {
    DOM.subtitle.textContent = "Missing quiz ID";
    showError("This dashboard link is missing quizId. Open it from the Create Quiz page.");
    return;
  }

  DOM.quizId.textContent = quizId;

  const quizRef = doc(db, "quizzes", quizId);
  const quizSnap = await getDoc(quizRef);

  if (!quizSnap.exists()) {
    DOM.subtitle.textContent = "Quiz not found";
    showError("Quiz not found. Verify the link and Firebase project settings.");
    return;
  }

  const quizData = quizSnap.data() || {};
  const quizTitle = quizData.title || "Untitled Quiz";
  DOM.quizTitle.textContent = quizTitle;
  DOM.subtitle.textContent = `Live submissions for ${quizTitle}`;

  const submissionsQuery = query(
    collection(db, "quizzes", quizId, "submissions"),
    orderBy("createdAt", "desc")
  );

  onSnapshot(
    submissionsQuery,
    (snapshot) => {
      const rows = snapshot.docs.map((docItem) => ({ id: docItem.id, ...docItem.data() }));
      renderRows(rows);
    },
    (error) => {
      console.error("[SecureQuiz] Dashboard listener error:", error);
      showError(`Failed to load submissions: ${error.message}`);
    }
  );
}

initDashboard().catch((error) => {
  console.error("[SecureQuiz] Dashboard init error:", error);
  showError(`Dashboard failed to initialize: ${error.message}`);
});
