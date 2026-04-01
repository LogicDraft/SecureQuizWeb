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
  authError: document.getElementById("auth-error"),
  btnGoogleLogin: document.getElementById("btn-google-login"),
  btnLogout: document.getElementById("btn-logout"),
  loginCard: document.getElementById("login-card"),
  dashboardCard: document.getElementById("dashboard-card"),
  btnBackOverview: document.getElementById("btn-back-overview"),
  overviewView: document.getElementById("overview-view"),
  singleQuizView: document.getElementById("single-quiz-view"),
  quizzesGrid: document.getElementById("quizzes-grid"),
  btnExport: document.getElementById("btn-export"),
};

let currentUser = null;
let currentSubmissions = [];
let currentFilter = 'all';

async function checkAuth() {
  const { data } = await supabase.auth.getSession();
  if (data.session) {
    currentUser = data.session.user;
    DOM.loginCard.classList.add("hidden");
    DOM.dashboardCard.classList.remove("hidden");
    init(); // Run dashboard init only when logged in
  } else {
    currentUser = null;
    DOM.loginCard.classList.remove("hidden");
    DOM.dashboardCard.classList.add("hidden");
  }
}

function showAuthError(msg) {
  DOM.authError.textContent = msg;
  DOM.authError.classList.remove("hidden");
}

DOM.btnGoogleLogin.addEventListener("click", async () => {
  DOM.authError.classList.add("hidden");
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: window.location.href,
    }
  });
  if (error) {
    showAuthError("Google Login failed: " + error.message);
  }
});

DOM.btnLogout.addEventListener("click", async () => {
  await supabase.auth.signOut();
  await checkAuth();
});

function buildSupabaseDashboardError(error, operation, tableName) {
  const code = error && error.code ? String(error.code) : "UNKNOWN";
  
  if (["42501", "PGRST301", "PGRST116"].includes(code)) {
    return "We couldn't load the requested data due to a permission error. Please contact your administrator.";
  }
  
  if (code === "22P02") {
    return "Invalid data format received. Please check the provided link and try again.";
  }

  return "An unexpected error occurred while communicating with the server. Please try again.";
}

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
  let filtered = submissions;
  if (currentFilter === 'flagged') {
    filtered = submissions.filter(sub => {
      const tabs = Number(sub.tab_switches ?? sub.tabSwitches ?? 0);
      const fs = Number(sub.fullscreen_exits ?? sub.fullscreenExits ?? 0);
      const ss = Number(sub.screenshot_attempts ?? sub.screenshotAttempts ?? 0);
      return (tabs + fs + ss) >= 5;
    });
  } else if (currentFilter === 'auto') {
    filtered = submissions.filter(sub => Boolean(sub.auto_submit ?? sub.autoSubmit));
  } else if (currentFilter === 'perfect') {
    filtered = submissions.filter(sub => {
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
      return total > 0 && score === total;
    });
  }

  DOM.subCount.textContent = String(filtered.length);

  if (!filtered.length) {
    DOM.rows.innerHTML = `
      <tr><td colspan="10" class="dashboard-empty">
        <div class="dashboard-empty-icon">📋</div>
        <h3>No submissions yet</h3>
        <p>Share the quiz link with students. Submissions will appear here in real-time.</p>
      </td></tr>`;
    return;
  }

  DOM.rows.innerHTML = filtered.map((sub, idx) => {
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

async function loadMyQuizzes() {
  if (!currentUser) return;
  try {
    const { data: quizzes, error } = await supabase
      .from("quizzes")
      .select("id, title, created_at, questions")
      .eq("user_id", currentUser.id)
      .order("created_at", { ascending: false });

    if (error) {
      showError(buildSupabaseDashboardError(error, "select", "quizzes"));
      return;
    }

    if (!quizzes || quizzes.length === 0) {
      DOM.subtitle.textContent = "You haven't created any quizzes yet.";
      DOM.quizzesGrid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 3rem; background: rgba(255,255,255,0.02); border-radius: 12px; border: 1px dashed var(--glass-border);">
          <div style="font-size: 2.5rem; margin-bottom: 1rem;">📝</div>
          <h3 style="margin-bottom: 0.5rem; color: var(--text-1);">No Quizzes Found</h3>
          <p style="color: var(--text-3); font-size: 0.9rem; margin-bottom: 1.5rem;">Create your first secure quiz to start gathering submissions.</p>
          <a href="create" class="btn-primary" style="text-decoration: none;">Create Quiz</a>
        </div>
      `;
      return;
    }

    const quizIds = quizzes.map((quiz) => quiz.id);
    const statsByQuizId = new Map();

    if (quizIds.length > 0) {
      const { data: submissions, error: submissionStatsError } = await supabase
        .from("submissions")
        .select("quiz_id, score_correct, score_total, created_at")
        .in("quiz_id", quizIds);

      if (submissionStatsError) {
        showError(buildSupabaseDashboardError(submissionStatsError, "select", "submissions"));
        return;
      }

      (submissions || []).forEach((sub) => {
        const quizId = sub.quiz_id;
        if (!quizId) return;

        if (!statsByQuizId.has(quizId)) {
          statsByQuizId.set(quizId, {
            count: 0,
            scoreSum: 0,
            scoreTotalSum: 0,
            lastSubmittedAt: null,
          });
        }

        const stat = statsByQuizId.get(quizId);
        stat.count += 1;
        stat.scoreSum += Number(sub.score_correct || 0);
        stat.scoreTotalSum += Number(sub.score_total || 0);

        const ts = sub.created_at ? new Date(sub.created_at).getTime() : 0;
        const currentLastTs = stat.lastSubmittedAt ? new Date(stat.lastSubmittedAt).getTime() : 0;
        if (ts > currentLastTs) {
          stat.lastSubmittedAt = sub.created_at;
        }
      });
    }

    DOM.subtitle.textContent = `You have ${quizzes.length} quizzes.`;
    DOM.quizzesGrid.innerHTML = quizzes.map(quiz => {
      const qCount = Array.isArray(quiz.questions) ? quiz.questions.length : 0;
      const date = formatDate(quiz.created_at);
      const title = escapeText(quiz.title || "Untitled Quiz");
      const stats = statsByQuizId.get(quiz.id) || { count: 0, scoreSum: 0, scoreTotalSum: 0, lastSubmittedAt: null };
      const avgPct = stats.scoreTotalSum > 0
        ? Math.round((stats.scoreSum / stats.scoreTotalSum) * 100)
        : 0;
      const avgLabel = stats.count > 0 ? `${avgPct}% avg` : "No attempts";
      const lastSubmittedLabel = stats.lastSubmittedAt ? formatDate(stats.lastSubmittedAt) : "No submissions";

      return `
        <a href="dashboard?quizId=${quiz.id}" class="quiz-card">
          <h3>${title}</h3>
          <div class="quiz-card-meta">
            <span>${qCount} questions</span>
            <span>${date.split(',')[0]}</span>
          </div>
          <div class="quiz-card-meta">
            <span>${stats.count} submissions</span>
            <span>${avgLabel}</span>
          </div>
          <div class="quiz-card-meta">
            <span>Last submission</span>
            <span>${escapeText(lastSubmittedLabel)}</span>
          </div>
        </a>
      `;
    }).join("");

  } catch (err) {
    showError("Failed to load quizzes: " + err.message);
  }
}

async function init() {
  if (!QUIZ_ID) {
    DOM.overviewView.classList.remove("hidden");
    DOM.singleQuizView.classList.add("hidden");
    DOM.btnBackOverview.classList.add("hidden");
    document.title = "My Quizzes | Dashboard";
    await loadMyQuizzes();
    return;
  }

  DOM.overviewView.classList.add("hidden");
  DOM.singleQuizView.classList.remove("hidden");
  DOM.btnBackOverview.classList.remove("hidden");
  DOM.quizId.textContent = QUIZ_ID;

  try {
    const { data: quizData, error: quizError } = await supabase
      .from("quizzes")
      .select("id, title")
      .eq("id", QUIZ_ID)
      .single();

    if (quizError) {
      DOM.subtitle.textContent = "Quiz lookup failed";
      showError(buildSupabaseDashboardError(quizError, "select", "quizzes"));
      return;
    }

    if (!quizData) {
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

      if (submissionsError) {
        throw new Error(buildSupabaseDashboardError(submissionsError, "select", "submissions"));
      }
      currentSubmissions = submissions || [];
      renderRows(currentSubmissions);
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

DOM.btnExport.addEventListener("click", () => {
  if (!currentSubmissions || currentSubmissions.length === 0) {
    showError("No data to export.");
    return;
  }

  const exportData = currentSubmissions.map((sub, idx) => {
    const tabs = Number(sub.tab_switches ?? sub.tabSwitches ?? 0);
    const fs = Number(sub.fullscreen_exits ?? sub.fullscreenExits ?? 0);
    const ss = Number(sub.screenshot_attempts ?? sub.screenshotAttempts ?? 0);
    const totalViolations = tabs + fs + ss;

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
    const pct = total > 0 ? Math.round((score / total) * 100) : 0;

    return {
      "S.No": idx + 1,
      "Student Name": sub.student_name || sub.studentName || "Unknown",
      "Student ID": sub.student_id || sub.studentId || "--",
      "Score": `${score}/${total}`,
      "Percentage": `${pct}%`,
      "Tab Switches": tabs,
      "Fullscreen Exits": fs,
      "Screenshot Attempts": ss,
      "Status": totalViolations >= 5 ? "Flagged" : "Clean",
      "Auto-Submit": (sub.auto_submit ?? sub.autoSubmit) ? "Yes" : "No",
      "Device": sub.device || "--",
      "Submitted At": formatDate(sub.created_at || sub.submitted_at_iso || sub.submittedAt || sub.timestamp)
    };
  });

  const worksheet = typeof XLSX !== "undefined" && XLSX.utils ? XLSX.utils.json_to_sheet(exportData) : null;
  if (!worksheet) {
    showError("Excel library not loaded properly. Please refresh the page.");
    return;
  }

  // Apply styles to all cells
  for (const cellRef in worksheet) {
    if (cellRef.startsWith('!')) continue;
    
    const row = parseInt(cellRef.replace(/\D/g, ''), 10);
    
    // Default style
    const cellStyle = {
      font: { name: "Arial", sz: 11 },
      alignment: { vertical: "center", horizontal: "center" },
      fill: { fgColor: { rgb: "FFFFFF" } } // White background default
    };

    if (row === 1) {
      // Header Style
      cellStyle.font.bold = true;
      cellStyle.font.color = { rgb: "FFFFFF" };
      cellStyle.fill.fgColor.rgb = "343A40"; // Dark Gray
    } else {
      // Conditional Row Styles
      const rowData = exportData[row - 2];
      if (rowData) {
         const pct = parseInt(rowData["Percentage"].replace('%', ''), 10);
         
         if (pct === 100) {
           cellStyle.fill.fgColor.rgb = "D4EDDA"; // Light Green
         } else if (pct < 40) {
           cellStyle.fill.fgColor.rgb = "F8D7DA"; // Light Red
         } else if (rowData["Auto-Submit"] === "Yes") {
           cellStyle.fill.fgColor.rgb = "FFF3CD"; // Light Yellow
         }
      }
    }
    
    worksheet[cellRef].s = cellStyle;
  }

  worksheet["!cols"] = [
    { wch: 6 },  // S.No
    { wch: 25 }, // Name
    { wch: 15 }, // ID
    { wch: 10 }, // Score
    { wch: 12 }, // Percentage
    { wch: 15 }, // Tabs
    { wch: 16 }, // FS
    { wch: 20 }, // Screenshots
    { wch: 12 }, // Status
    { wch: 12 }, // Auto
    { wch: 15 }, // Device
    { wch: 22 }  // Date
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Results");
  
  const title = DOM.quizTitle.textContent || "Quiz";
  XLSX.writeFile(workbook, `SecureQuiz_Results_${title.replace(/[^a-z0-9]/gi, '_')}.xlsx`);
});

document.querySelectorAll('.btn-filter').forEach(btn => {
  btn.addEventListener('click', (e) => {
    document.querySelectorAll('.btn-filter').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    currentFilter = e.target.getAttribute('data-filter') || 'all';
    if (currentSubmissions) renderRows(currentSubmissions);
  });
});

checkAuth();
