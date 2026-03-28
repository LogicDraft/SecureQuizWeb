import { supabase, isSupabaseConfigured } from "./supabase-config.js";

const DOM = {
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
  createError: document.getElementById("create-error"),
  createCard: document.getElementById("create-card"),
  resultSection: document.getElementById("result-section"),
  inpQuizLink: document.getElementById("inp-quiz-link"),
  inpDashLink: document.getElementById("inp-dashboard-link"),
  btnCopyQuiz: document.getElementById("btn-copy-quiz"),
  btnCopyDash: document.getElementById("btn-copy-dash"),
  btnNewQuiz: document.getElementById("btn-new-quiz"),
  btnGoDash: document.getElementById("btn-go-dashboard"),
};

const questionBuilderState = {
  questions: [],
};

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

function clearQuestionDraft() {
  DOM.inpQuestionText.value = "";
  DOM.inpOpt1.value = "";
  DOM.inpOpt2.value = "";
  DOM.inpOpt3.value = "";
  DOM.inpOpt4.value = "";
  DOM.inpCorrectAnswer.value = "0";
}

function syncQuestionsJsonPreview() {
  DOM.questionsCount.textContent = String(questionBuilderState.questions.length);
}

function renderQuestionsList() {
  if (!questionBuilderState.questions.length) {
    DOM.questionsList.innerHTML = '<div class="questions-empty">No questions added yet.</div>';
    syncQuestionsJsonPreview();
    return;
  }

  DOM.questionsList.innerHTML = "";

  questionBuilderState.questions.forEach((question, index) => {
    const article = document.createElement("article");
    article.className = "question-item";

    const head = document.createElement("div");
    head.className = "question-item-head";

    const title = document.createElement("strong");
    title.textContent = `Q${index + 1}.`;

    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "btn-secondary question-remove-btn";
    removeButton.dataset.index = String(index);
    removeButton.textContent = "Remove";

    head.appendChild(title);
    head.appendChild(removeButton);

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
    DOM.questionsList.appendChild(article);
  });

  syncQuestionsJsonPreview();
}

function getBaseUrl() {
  return window.location.origin + window.location.pathname.replace(/create\.html$/, "");
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

  const nextId = `q${String(questionBuilderState.questions.length + 1).padStart(3, "0")}`;
  questionBuilderState.questions.push({
    id: nextId,
    q: questionText,
    options,
    answer,
  });

  clearQuestionDraft();
  renderQuestionsList();
});

DOM.questionsList.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;

  const removeButton = target.closest(".question-remove-btn");
  if (!removeButton) return;

  const index = parseInt(removeButton.dataset.index || "-1", 10);
  if (index < 0 || index >= questionBuilderState.questions.length) return;

  questionBuilderState.questions.splice(index, 1);
  questionBuilderState.questions = questionBuilderState.questions.map((question, idx) => ({
    ...question,
    id: `q${String(idx + 1).padStart(3, "0")}`,
  }));

  renderQuestionsList();
});

DOM.btnPublish.addEventListener("click", async () => {
  clearError();

  const title = DOM.inpTitle.value.trim();
  const timeLimit = parseInt(DOM.inpTime.value, 10);
  const maxViolations = parseInt(DOM.inpViolations.value, 10) || 5;

  if (!title) return showError("Please enter a quiz title.");
  if (!timeLimit || timeLimit < 1) return showError("Please enter a valid time limit in minutes.");
  if (!questionBuilderState.questions.length) {
    return showError("Please add at least one question.");
  }
  if (!isSupabaseConfigured()) {
    return showError("Supabase is not configured. Update supabase-config.js with your project URL and anon key, then publish again.");
  }

  const questions = [...questionBuilderState.questions];

  if (!Array.isArray(questions) || questions.length === 0) {
    return showError("Questions must be a non-empty JSON array.");
  }

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    if (!q.q || !Array.isArray(q.options) || q.options.length < 2) {
      return showError(`Question ${i + 1} is missing 'q' text or has fewer than 2 options.`);
    }
    if (!q.answer) {
      return showError(`Question ${i + 1} is missing the 'answer' field.`);
    }
    if (!q.id) {
      q.id = `q${String(i + 1).padStart(3, "0")}`;
    }
  }

  setLoading(true);

  try {
    const { data, error } = await supabase
      .from("quizzes")
      .insert({
      title,
      config: {
        timeLimit,
        maxViolations,
      },
      questions,
      })
      .select("id")
      .single();

    if (error) throw error;

    const quizId = data.id;
    const base = getBaseUrl();
    const quizLink = `${base}index.html?quizId=${quizId}`;
    const dashLink = `${base}dashboard.html?quizId=${quizId}`;

    DOM.inpQuizLink.value = quizLink;
    DOM.inpDashLink.value = dashLink;
    DOM.btnGoDash.href = dashLink;

    DOM.createCard.classList.add("hidden");
    DOM.resultSection.classList.remove("hidden");
  } catch (err) {
    console.error("[SecureQuiz] Failed to publish quiz:", err);
    if (err && (err.code === "42501" || err.code === "PGRST301")) {
      showError("Publish blocked by Supabase policies. Allow insert access on quizzes table.");
    } else if (err && err.code === "PGRST204") {
      showError("Publish failed due to invalid quiz data. Check question fields and try again.");
    } else {
      showError("Failed to publish quiz: " + (err.message || "Unknown error"));
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
  DOM.inpTitle.value = "";
  DOM.inpTime.value = "";
  DOM.inpViolations.value = "5";
  questionBuilderState.questions = [];
  clearQuestionDraft();
  renderQuestionsList();
  clearError();
  DOM.resultSection.classList.add("hidden");
  DOM.createCard.classList.remove("hidden");
});

renderQuestionsList();
