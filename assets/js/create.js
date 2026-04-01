import { supabase, isSupabaseConfigured } from "./supabase-config.js";

const DOM = {
  loginCard: document.getElementById("login-card"),
  authError: document.getElementById("auth-error"),
  btnGoogleLogin: document.getElementById("btn-google-login"),

  accountCard: document.getElementById("account-card"),
  btnAccountLogout: document.getElementById("btn-account-logout"),
  btnShowCreate: document.getElementById("btn-show-create"),
  profileName: document.getElementById("profile-name"),
  profileEmail: document.getElementById("profile-email"),
  profileInitials: document.getElementById("profile-initials"),
  profileAvatar: document.getElementById("profile-avatar"),
  quizzesGrid: document.getElementById("quizzes-grid"),
  accountSubtitle: document.getElementById("account-subtitle"),

  createCard: document.getElementById("create-card"),
  btnBackAccount: document.getElementById("btn-back-account"),
  createError: document.getElementById("create-error"),

  inpTitle: document.getElementById("inp-title"),
  inpTime: document.getElementById("inp-time"),
  inpViolations: document.getElementById("inp-violations"),
  inpQuestionText: document.getElementById("inp-question-text"),
  inpOpt1: document.getElementById("inp-opt-1"),
  inpOpt2: document.getElementById("inp-opt-2"),
  inpOpt3: document.getElementById("inp-opt-3"),
  inpOpt4: document.getElementById("inp-opt-4"),
  inpCorrectAnswer: document.getElementById("inp-correct-answer"),
  btnAddQuestion: document.getElementById("btn-add-question"),
  questionsList: document.getElementById("questions-list"),
  questionsCount: document.getElementById("questions-count"),
  btnPublish: document.getElementById("btn-publish"),
  btnPublishText: document.getElementById("btn-publish-text"),
  btnPublishSpinner: document.getElementById("btn-publish-spinner"),

  resultSection: document.getElementById("result-section"),
  inpQuizLink: document.getElementById("inp-quiz-link"),
  inpDashLink: document.getElementById("inp-dashboard-link"),
  btnCopyQuiz: document.getElementById("btn-copy-quiz"),
  btnCopyDash: document.getElementById("btn-copy-dash"),
  btnNewQuiz: document.getElementById("btn-new-quiz"),
  btnGoAccount: document.getElementById("btn-go-account"),
};

const state = {
  currentUser: null,
  questions: [],
  accountCache: null,
  accountLoadPromise: null,
};

const ACCOUNT_CACHE_TTL_MS = 30 * 1000;

function showLoginView() {
  DOM.loginCard.classList.remove("hidden");
  DOM.accountCard.classList.add("hidden");
  DOM.createCard.classList.add("hidden");
  DOM.resultSection.classList.add("hidden");
}

function showAccountView() {
  DOM.loginCard.classList.add("hidden");
  DOM.accountCard.classList.remove("hidden");
  DOM.createCard.classList.add("hidden");
  DOM.resultSection.classList.add("hidden");
}

function showCreateView() {
  DOM.loginCard.classList.add("hidden");
  DOM.accountCard.classList.add("hidden");
  DOM.createCard.classList.remove("hidden");
  DOM.resultSection.classList.add("hidden");
}

function showResultView() {
  DOM.loginCard.classList.add("hidden");
  DOM.accountCard.classList.add("hidden");
  DOM.createCard.classList.add("hidden");
  DOM.resultSection.classList.remove("hidden");
}

function showAuthError(msg) {
  DOM.authError.textContent = msg;
  DOM.authError.classList.remove("hidden");
}

function showError(msg) {
  DOM.createError.textContent = msg;
  DOM.createError.classList.remove("hidden");
}

function clearError() {
  DOM.createError.classList.add("hidden");
}

function setLoading(loading) {
  DOM.btnPublish.disabled = loading;
  DOM.btnPublishText.classList.toggle("hidden", loading);
  DOM.btnPublishSpinner.classList.toggle("hidden", !loading);
}

function escapeText(val) {
  return String(val ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
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

function getDisplayName(user) {
  const metadata = user && user.user_metadata ? user.user_metadata : {};
  return metadata.full_name || metadata.name || user?.email || "Creator";
}

function getInitials(name) {
  const safe = String(name || "C").trim();
  if (!safe) return "C";
  const parts = safe.split(/\s+/).slice(0, 2);
  return parts.map((p) => p.charAt(0).toUpperCase()).join("");
}

function getAvatarUrl(user) {
  const metadata = user && user.user_metadata ? user.user_metadata : {};
  return metadata.avatar_url || metadata.picture || "";
}

function getBaseUrl() {
  const normalizedPath = window.location.pathname.replace(/(?:create(?:\.html)?\/?$)/, "");
  return window.location.origin + normalizedPath;
}

function copyToClipboard(text, btn) {
  navigator.clipboard.writeText(text).then(() => {
    const orig = btn.textContent;
    btn.textContent = "Copied!";
    setTimeout(() => { btn.textContent = orig; }, 1500);
  }).catch(() => {
    const inp = document.createElement("input");
    inp.value = text;
    document.body.appendChild(inp);
    inp.select();
    document.execCommand("copy");
    inp.remove();
    const orig = btn.textContent;
    btn.textContent = "Copied!";
    setTimeout(() => { btn.textContent = orig; }, 1500);
  });
}

function clearQuestionDraft() {
  DOM.inpQuestionText.value = "";
  DOM.inpOpt1.value = "";
  DOM.inpOpt2.value = "";
  DOM.inpOpt3.value = "";
  DOM.inpOpt4.value = "";
  DOM.inpCorrectAnswer.value = "0";
}

function syncQuestionsCount() {
  DOM.questionsCount.textContent = String(state.questions.length);
}

function renderQuestionsList() {
  if (!state.questions.length) {
    DOM.questionsList.innerHTML = '<div class="questions-empty">No questions added yet.</div>';
    syncQuestionsCount();
    return;
  }

  DOM.questionsList.innerHTML = "";

  const fragment = document.createDocumentFragment();

  state.questions.forEach((question, index) => {
    const article = document.createElement("article");
    article.className = "question-item";

    const head = document.createElement("div");
    head.className = "question-item-head";

    const title = document.createElement("strong");
    title.textContent = `Q${index + 1}.`;

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "btn-danger-ghost question-remove-btn";
    removeButton.dataset.index = String(index);
    removeButton.textContent = "Remove";

    const cloneButton = document.createElement("button");
    cloneButton.type = "button";
    cloneButton.className = "btn-icon-ghost question-clone-btn";
    cloneButton.dataset.index = String(index);
    cloneButton.innerHTML = "Duplicate";

    const actionsDiv = document.createElement("div");
    actionsDiv.style.display = "flex";
    actionsDiv.style.gap = "0.5rem";
    actionsDiv.appendChild(cloneButton);
    actionsDiv.appendChild(removeButton);

    head.appendChild(title);
    head.appendChild(actionsDiv);

    const questionText = document.createElement("p");
    questionText.className = "question-item-text";
    questionText.textContent = question.q;

    const optionsList = document.createElement("ul");
    optionsList.className = "question-item-options";
    question.options.forEach((opt) => {
      const li = document.createElement("li");
      li.textContent = opt;
      optionsList.appendChild(li);
    });

    const answer = document.createElement("p");
    answer.className = "question-item-answer";
    answer.textContent = `Correct: ${question.answer}`;

    article.appendChild(head);
    article.appendChild(questionText);
    article.appendChild(optionsList);
    article.appendChild(answer);
    fragment.appendChild(article);
  });

  DOM.questionsList.appendChild(fragment);

  syncQuestionsCount();
}

function resetQuizBuilderDraft() {
  DOM.inpTitle.value = "";
  DOM.inpTime.value = "";
  DOM.inpViolations.value = "5";
  state.questions = [];
  clearQuestionDraft();
  renderQuestionsList();
  clearError();
}

async function loadPersonalAccountData({ force = false } = {}) {
  if (!state.currentUser) return;

  const displayName = getDisplayName(state.currentUser);
  DOM.profileName.textContent = displayName;
  DOM.profileEmail.textContent = state.currentUser.email || "--";

  const avatarUrl = getAvatarUrl(state.currentUser);
  DOM.profileInitials.textContent = getInitials(displayName);

  if (avatarUrl) {
    DOM.profileAvatar.src = avatarUrl;
    DOM.profileAvatar.classList.remove("hidden");
    DOM.profileInitials.classList.add("hidden");
    DOM.profileAvatar.onerror = () => {
      DOM.profileAvatar.classList.add("hidden");
      DOM.profileInitials.classList.remove("hidden");
    };
  } else {
    DOM.profileAvatar.classList.add("hidden");
    DOM.profileInitials.classList.remove("hidden");
  }

  const now = Date.now();
  const cache = state.accountCache;
  if (!force && cache && cache.userId === state.currentUser.id && now - cache.fetchedAt < ACCOUNT_CACHE_TTL_MS) {
    DOM.accountSubtitle.textContent = cache.subtitle;
    DOM.quizzesGrid.innerHTML = cache.html;
    return;
  }

  if (!force && state.accountLoadPromise) {
    await state.accountLoadPromise;
    return;
  }

  DOM.accountSubtitle.textContent = "Loading your quizzes...";

  state.accountLoadPromise = (async () => {

  const { data: quizzes, error: quizzesError } = await supabase
    .from("quizzes")
    .select("id, title, created_at, questions")
    .eq("user_id", state.currentUser.id)
    .order("created_at", { ascending: false });

    if (quizzesError) {
      DOM.accountSubtitle.textContent = "Could not load your quiz history.";
      DOM.quizzesGrid.innerHTML = `<div class="questions-empty">Failed to load quizzes: ${escapeText(quizzesError.message || "Unknown error")}</div>`;
      return;
    }

    const quizIds = (quizzes || []).map((quiz) => quiz.id);
    const statsByQuizId = new Map();

    if (quizIds.length > 0) {
      const { data: submissions } = await supabase
        .from("submissions")
        .select("quiz_id, score_correct, score_total, created_at")
        .in("quiz_id", quizIds);

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

    if (!quizzes || quizzes.length === 0) {
      const subtitle = "You have not created any quizzes yet.";
      const html = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 2rem; background: rgba(255,255,255,0.02); border-radius: 12px; border: 1px dashed var(--glass-border);">
        <div style="font-size: 2rem; margin-bottom: 0.6rem;">📝</div>
        <h3 style="margin: 0 0 0.4rem; color: var(--text-1);">No quizzes yet</h3>
        <p style="margin: 0; color: var(--text-3); font-size: 0.9rem;">Click Build New Quiz to publish your first quiz.</p>
      </div>
    `;
      DOM.accountSubtitle.textContent = subtitle;
      DOM.quizzesGrid.innerHTML = html;
      state.accountCache = {
        userId: state.currentUser.id,
        fetchedAt: Date.now(),
        subtitle,
        html,
      };
      return;
    }

    const subtitle = `You have ${quizzes.length} quiz${quizzes.length > 1 ? "zes" : ""}.`;
    const html = quizzes.map((quiz, index) => {
    const stats = statsByQuizId.get(quiz.id) || { count: 0, scoreSum: 0, scoreTotalSum: 0, lastSubmittedAt: null };
    const qCount = Array.isArray(quiz.questions) ? quiz.questions.length : 0;
    const avgPct = stats.scoreTotalSum > 0 ? Math.round((stats.scoreSum / stats.scoreTotalSum) * 100) : 0;
    const avgText = stats.count > 0 ? `${avgPct}% avg score` : "No attempts";
    const lastSubmittedLabel = stats.lastSubmittedAt ? formatDate(stats.lastSubmittedAt) : "No submissions";

      const createdDate = formatDate(quiz.created_at);

      return `
      <article class="quiz-card" style="animation-delay: ${index * 0.05}s">
        <h3>${escapeText(quiz.title || "Untitled Quiz")}</h3>
        <div class="quiz-card-meta">
          <span>${qCount} questions</span>
          <span>${escapeText(createdDate.split(",")[0])}</span>
        </div>
        <div class="quiz-card-meta">
          <span>${stats.count} submissions</span>
          <span>${escapeText(avgText)}</span>
        </div>
        <div class="quiz-card-meta" style="margin-bottom: 0.8rem;">
          <span>Last submission</span>
          <span>${escapeText(lastSubmittedLabel)}</span>
        </div>
        <div style="display:flex; gap:0.5rem; flex-wrap: wrap;">
          <a class="btn-secondary" href="dashboard?quizId=${quiz.id}" style="padding:0.35rem 0.65rem; font-size:0.78rem; text-decoration:none;">View Data</a>
          <a class="btn-secondary" href="quiz?quizId=${quiz.id}" style="padding:0.35rem 0.65rem; font-size:0.78rem; text-decoration:none;">Open Quiz Link</a>
        </div>
      </article>
      `;
    }).join("");

    DOM.accountSubtitle.textContent = subtitle;
    DOM.quizzesGrid.innerHTML = html;
    state.accountCache = {
      userId: state.currentUser.id,
      fetchedAt: Date.now(),
      subtitle,
      html,
    };
  })();

  try {
    await state.accountLoadPromise;
  } finally {
    state.accountLoadPromise = null;
  }
}

async function syncAuthView() {
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    showLoginView();
    showAuthError("Unable to read session. Please try login again.");
    return;
  }

  if (data?.session?.user) {
    state.currentUser = data.session.user;
    showAccountView();
    void loadPersonalAccountData();
  } else {
    state.currentUser = null;
    showLoginView();
  }
}

function wireAuthListeners() {
  supabase.auth.onAuthStateChange(async (_event, session) => {
    if (session?.user) {
      state.currentUser = session.user;
      showAccountView();
      void loadPersonalAccountData();
    } else {
      state.currentUser = null;
      state.accountCache = null;
      showLoginView();
    }
  });
}

DOM.btnGoogleLogin.addEventListener("click", async () => {
  DOM.authError.classList.add("hidden");

  const redirectTo = `${window.location.origin}${window.location.pathname}`;
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo },
  });

  if (error) {
    showAuthError("Google login failed: " + error.message);
  }
});

DOM.btnAccountLogout.addEventListener("click", async () => {
  await supabase.auth.signOut();
  state.accountCache = null;
  showLoginView();
});

DOM.btnShowCreate.addEventListener("click", () => {
  showCreateView();
});

DOM.btnBackAccount.addEventListener("click", async () => {
  await loadPersonalAccountData();
  showAccountView();
});

DOM.btnAddQuestion.addEventListener("click", () => {
  clearError();

  const questionText = DOM.inpQuestionText.value.trim();
  const selectedAnswerIndex = parseInt(DOM.inpCorrectAnswer.value, 10);
  const optionsBySlot = [DOM.inpOpt1.value, DOM.inpOpt2.value, DOM.inpOpt3.value, DOM.inpOpt4.value].map((item) => item.trim());
  const options = optionsBySlot.filter(Boolean);

  if (!questionText) return showError("Please enter question text.");
  if (!optionsBySlot[0] || !optionsBySlot[1]) return showError("Please fill at least Option A and Option B.");

  const answer = optionsBySlot[selectedAnswerIndex];
  if (!answer) {
    return showError("Selected correct answer option is empty. Fill that option or choose another correct answer.");
  }

  const nextId = `q${String(state.questions.length + 1).padStart(3, "0")}`;
  state.questions.push({ id: nextId, q: questionText, options, answer });

  clearQuestionDraft();
  renderQuestionsList();
});

DOM.questionsList.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;

  const removeButton = target.closest(".question-remove-btn");
  if (removeButton) {
    const index = parseInt(removeButton.dataset.index || "-1", 10);
    if (index < 0 || index >= state.questions.length) return;

    state.questions.splice(index, 1);
    state.questions = state.questions.map((question, idx) => ({
      ...question,
      id: `q${String(idx + 1).padStart(3, "0")}`,
    }));

    renderQuestionsList();
    return;
  }

  const cloneButton = target.closest(".question-clone-btn");
  if (cloneButton) {
    const index = parseInt(cloneButton.dataset.index || "-1", 10);
    if (index < 0 || index >= state.questions.length) return;

    const sourceQuestion = state.questions[index];
    DOM.inpQuestionText.value = sourceQuestion.q;
    DOM.inpOpt1.value = sourceQuestion.options[0] || "";
    DOM.inpOpt2.value = sourceQuestion.options[1] || "";
    DOM.inpOpt3.value = sourceQuestion.options[2] || "";
    DOM.inpOpt4.value = sourceQuestion.options[3] || "";
    
    const ansIndex = sourceQuestion.options.indexOf(sourceQuestion.answer);
    DOM.inpCorrectAnswer.value = ansIndex >= 0 ? String(ansIndex) : "0";
    
    // Scroll up gracefully to the question builder
    document.querySelector(".question-builder").scrollIntoView({ behavior: "smooth", block: "start" });
  }
});

DOM.btnPublish.addEventListener("click", async () => {
  clearError();

  const isDrafting = DOM.inpQuestionText.value.trim() !== "" || DOM.inpOpt1.value.trim() !== "";
  if (isDrafting) {
    return showError("You have an unsaved question in the builder. Please click '+ Add Question' or clear the inputs before publishing.");
  }

  const title = DOM.inpTitle.value.trim();
  const timeLimit = parseInt(DOM.inpTime.value, 10);
  const maxViolations = parseInt(DOM.inpViolations.value, 10) || 5;

  if (!state.currentUser) return showError("Please sign in before publishing.");
  if (!title) return showError("Please enter a quiz title.");
  if (!timeLimit || timeLimit < 1) return showError("Please enter a valid time limit in minutes.");
  if (!state.questions.length) return showError("Please add at least one question.");

  if (!isSupabaseConfigured()) {
    return showError("Supabase is not configured. Update assets/js/supabase-config.js with your project URL and anon key, then publish again.");
  }

  const questions = [...state.questions];

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    if (!q.q || !Array.isArray(q.options) || q.options.length < 2) {
      return showError(`Question ${i + 1} is missing 'q' text or has fewer than 2 options.`);
    }
    if (!q.answer) {
      return showError(`Question ${i + 1} is missing the 'answer' field.`);
    }
  }

  setLoading(true);

  try {
    const { data, error } = await supabase
      .from("quizzes")
      .insert({
        user_id: state.currentUser.id,
        title,
        config: { timeLimit, maxViolations },
        questions,
      })
      .select("id")
      .single();

    if (error) throw error;

    const quizId = data.id;
    const base = getBaseUrl();
    DOM.inpQuizLink.value = `${base}quiz?quizId=${quizId}`;
    DOM.inpDashLink.value = `${base}dashboard?quizId=${quizId}`;
    state.accountCache = null;

    showResultView();
  } catch (err) {
    const code = err && err.code ? String(err.code) : "UNKNOWN";
    if (["42501", "PGRST301", "PGRST116"].includes(code)) {
      showError("We couldn't save the requested data due to a permission error. Please contact your administrator.");
    } else if (code === "PGRST204") {
      showError("Publish failed due to invalid quiz data. Check question fields and try again.");
    } else if (code === "22P02") {
      showError("Invalid data format received. Please check the query and try again.");
    } else {
      showError("An unexpected database error occurred. Please try again.");
    }
  } finally {
    setLoading(false);
  }
});

DOM.btnCopyQuiz.addEventListener("click", () => {
  copyToClipboard(DOM.inpQuizLink.value, DOM.btnCopyQuiz);
});

DOM.btnCopyDash.addEventListener("click", () => {
  copyToClipboard(DOM.inpDashLink.value, DOM.btnCopyDash);
});

DOM.btnNewQuiz.addEventListener("click", () => {
  resetQuizBuilderDraft();
  showCreateView();
});

DOM.btnGoAccount.addEventListener("click", async () => {
  await loadPersonalAccountData({ force: true });
  showAccountView();
});

renderQuestionsList();
wireAuthListeners();
syncAuthView();
