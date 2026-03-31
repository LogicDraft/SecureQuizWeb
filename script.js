/* ═══════════════════════════════════════════════════════════════════
   script.js — SecureQuiz Anti-Cheat Quiz Platform
   Vanilla JavaScript — No dependencies

   SECTIONS:
   1.  Configuration
   2.  Question Bank
   3.  App State
   4.  DOM References
   5.  Utility Functions
   6.  Anti-Cheat: Tab Switch Detection
   7.  Anti-Cheat: Fullscreen Enforcement
   8.  Anti-Cheat: Copy / Paste / Right-Click / Selection Disable
   9.  Anti-Cheat: PrintScreen & Screenshot Detection
   10. Anti-Cheat: Camera & Microphone Permission
   11. Anti-Cheat: Circle-to-Search / Window Blur Detection
   12. Anti-Cheat: Auto-Submit on Refresh
   13. Quiz Engine
   14. Timer Engine
   15. Navigation & UI
   16. Submission & Google Sheets Integration
   17. Initialization
═══════════════════════════════════════════════════════════════════ */

/* ─────────────────────────────────────────────────────────────────
   1. CONFIGURATION — Edit these values before deploying
───────────────────────────────────────────────────────────────────*/
import { supabase } from "./supabase-config.js";

const CONFIG = {
  // ⚠️  Paste your Google Apps Script Web App URL here after deploying
  APPS_SCRIPT_URL: "https://script.google.com/macros/s/AKfycbylYb8OizYN_4kPzD3aLTThICqRSN85vSsYFFhBpxeROQGO_WrmLs6bztrGe9q0wIXAIQ/exec",

  QUIZ_TITLE: "Quantum Quiz",

  // Number of seconds per question (0 = no per-question timer)
  SECONDS_PER_QUESTION: 60,

  // How many questions to pick from the bank (null = all)
  MAX_QUESTIONS: null,

  // Shuffle questions order for each student
  SHUFFLE_QUESTIONS: true,

  // Shuffle option order for each question
  SHUFFLE_OPTIONS: true,

  // Local storage key used to track students who already submitted
  SUBMITTED_KEY: "secureQuiz_submitted_v1",
  APP_STATE_KEY: "secureQuiz_app_state_v1",

  // Key to detect refresh-triggered auto-submit
  SESSION_KEY: "secureQuiz_session_v2",
  DRAFT_KEY_PREFIX: "secureQuiz_draft_v2",

  // Anti-cheat thresholds
  MAX_TAB_SWITCHES: 5,
  MAX_FULLSCREEN_EXITS: 5,
  MAX_SCREENSHOT_ATTEMPTS: 3,
  SUSPICIOUS_BLUR_ALERT_THRESHOLD: 5,
  DEVTOOLS_SIZE_THRESHOLD: 160,

  // Recovery and retake behavior
  DRAFT_SAVE_THROTTLE_MS: 5000,
  RETAKE_COOLDOWN_MS: 60 * 60 * 1000,
  SUBMISSION_REQUEST_TIMEOUT_MS: 8000,
  RESULT_LOOKUP_TIMEOUT_MS: 10000,
  RESULT_LOOKUP_INTERVAL_MS: 2000,

  // Fullscreen handling
  ENFORCE_FULLSCREEN_ON_MOBILE: true,
};

const THEME_MEDIA_QUERY = typeof window.matchMedia === "function"
  ? window.matchMedia("(prefers-color-scheme: dark)")
  : null;

/* ─────────────────────────────────────────────────────────────────
   2. QUESTION BANK
   Questions are loaded from questions.json at startup.
   Edit questions.json to add / remove / update questions without
   touching this file.
───────────────────────────────────────────────────────────────────*/
let QUESTION_BANK = []; // populated by loadQuestions() at startup

function getQuizIdFromUrl() {
  try {
    const params = new URLSearchParams(window.location.search);
    return (params.get("quizId") || "").trim();
  } catch (_error) {
    return "";
  }
}

function normalizeQuestionBank(rawQuestions = []) {
  return rawQuestions.map((question, index) => ({
    ...question,
    id: question.id || `q${String(index + 1).padStart(3, "0")}`,
    options: Array.isArray(question.options) ? [...question.options] : [],
  }));
}

function applyQuizRuntimeConfig(quizData) {
  if (!quizData || typeof quizData !== "object") return;

  if (typeof quizData.title === "string" && quizData.title.trim()) {
    CONFIG.QUIZ_TITLE = quizData.title.trim();
  }

  if (quizData.config && typeof quizData.config === "object") {
    const maxViolations = Number.parseInt(quizData.config.maxViolations, 10);
    if (Number.isFinite(maxViolations) && maxViolations > 0) {
      CONFIG.MAX_TAB_SWITCHES = maxViolations;
    }

    const timeLimitMinutes = Number.parseInt(quizData.config.timeLimit, 10);
    if (Number.isFinite(timeLimitMinutes) && timeLimitMinutes > 0) {
      const questionCount = Math.max(1, QUESTION_BANK.length);
      const derivedPerQuestion = Math.max(15, Math.floor((timeLimitMinutes * 60) / questionCount));
      CONFIG.SECONDS_PER_QUESTION = derivedPerQuestion;
    }
  }
}

async function loadQuestionsFromSupabase(quizId) {
  if (!quizId) return false;

  try {
    const { data, error } = await supabase
      .from("quizzes")
      .select("id, title, config, questions")
      .eq("id", quizId)
      .single();

    if (error || !data) {
      console.warn(`[SecureQuiz] quizId '${quizId}' not found in Supabase.`);
      return false;
    }

    const quizData = data || {};
    if (!Array.isArray(quizData.questions) || quizData.questions.length === 0) {
      console.warn(`[SecureQuiz] quizId '${quizId}' has no valid questions array.`);
      return false;
    }

    QUESTION_BANK = normalizeQuestionBank(quizData.questions);
    applyQuizRuntimeConfig(quizData);
    console.log(`[SecureQuiz] Loaded ${QUESTION_BANK.length} questions from Supabase quiz '${quizId}'.`);
    return true;
  } catch (error) {
    console.error("[SecureQuiz] Failed loading Supabase quiz:", error);
    return false;
  }
}

async function loadQuestions() {
  const quizId = getQuizIdFromUrl();
  state.quizId = quizId;

  if (!quizId) {
    state.accessBlocked = true;
    state.accessBlockReason = "Quiz access is restricted. Ask your teacher for the shared quiz link and open it exactly as provided.";
    return;
  }

  const loadedFromSupabase = await loadQuestionsFromSupabase(quizId);
  if (!loadedFromSupabase) {
    state.accessBlocked = true;
    state.accessBlockReason = "This quiz link is invalid or expired. Ask your teacher to share the latest student quiz link.";
  }
}

/* ─────────────────────────────────────────────────────────────────
   STUDENT REGISTRY — AIML N-Section 2025-26
   USN is the primary key. Only registered USNs can access the quiz.
───────────────────────────────────────────────────────────────────*/
/* ─────────────────────────────────────────────────────────────────
   3. APP STATE
───────────────────────────────────────────────────────────────────*/
const state = {
  // Student info
  student: { name: "", usn: "", email: "" },
  registrationDraft: { usn: "", email: "" },
  deviceType: "desktop",
  theme: "dark",
  currentScreen: "registration",
  instructionsAccepted: false,

  // Quiz
  questions: [],          // shuffled subset of QUESTION_BANK
  currentIndex: 0,        // current question index
  answers: {},            // { questionIndex: selectedOption }
  startTime: null,        // Date the quiz started

  // Timer
  timerInterval: null,
  timeLeft: CONFIG.SECONDS_PER_QUESTION,

  // Proctoring counters
  tabSwitchCount: 0,
  fullscreenExitCount: 0,
  screenshotAttempts: 0,
  suspiciousBlur: 0,
  cameraAccess: "not-requested",
  micAccess: "not-requested",
  suspiciousEvents: [],   // log of all suspicious events
  submissionReview: null,
  lastSubmissionTimestamp: null,
  lastReviewToken: null,
  submissionPersisted: false,
  quizId: "",
  accessBlocked: false,
  accessBlockReason: "",

  // Flags
  fullscreenMonitoringEnabled: true,
  quizStarted: false,
  submitted: false,
};

/* ─────────────────────────────────────────────────────────────────
   4. DOM REFERENCES
───────────────────────────────────────────────────────────────────*/
const DOM = {
  // Screens
  screenReg:    document.getElementById("screen-registration"),
  screenInst:   document.getElementById("screen-instructions"),
  screenQuiz:   document.getElementById("screen-quiz"),
  screenResult: document.getElementById("screen-result"),
  screenReview: document.getElementById("screen-review"),

  // Instructions
  chkAgree:     document.getElementById("chk-agree"),
  btnProceed:   document.getElementById("btn-proceed-quiz"),

  // Registration
  inpName:  document.getElementById("inp-name"),
  inpUSN:   document.getElementById("inp-usn"),
  inpEmail: document.getElementById("inp-email"),
  regError: document.getElementById("reg-error"),
  btnStart: document.getElementById("btn-start-quiz"),
  btnStartText: document.getElementById("btn-start-text"),
  btnStartSpinner: document.getElementById("btn-start-spinner"),

  // Quiz
  quizStudentName: document.getElementById("quiz-student-name"),
  quizProgressLabel: document.getElementById("quiz-progress-label"),
  quizTimer:       document.getElementById("quiz-timer"),
  progressBarFill: document.getElementById("progress-bar-fill"),
  timerBarFill:    document.getElementById("timer-bar-fill"),
  questionCard:    document.getElementById("question-card"),
  questionNumber:  document.getElementById("question-number"),
  questionText:    document.getElementById("question-text"),
  optionsList:     document.getElementById("options-list"),
  btnPrev:         document.getElementById("btn-prev"),
  btnNext:         document.getElementById("btn-next"),
  btnSubmitQuiz:   document.getElementById("btn-submit-quiz"),
  navDots:         document.getElementById("nav-dots"),

  // Proctoring stats
  statTabs: document.getElementById("stat-tabs"),
  statFS:   document.getElementById("stat-fs"),
  statSS:   document.getElementById("stat-ss"),

  // Overlays
  overlayFullscreen: document.getElementById("overlay-fullscreen"),
  overlayTabSwitch:  document.getElementById("overlay-tabswitch"),
  overlaySubmit:     document.getElementById("overlay-submit"),
  tabswitchMsg:      document.getElementById("tabswitch-msg"),
  fullscreenMsg:     document.getElementById("fullscreen-msg"),
  submitUnansweredMsg: document.getElementById("submit-unanswered-msg"),

  // Overlay buttons
  btnReturnFullscreen:  document.getElementById("btn-return-fullscreen"),
  btnDismissTabswitch:  document.getElementById("btn-dismiss-tabswitch"),
  btnCancelSubmit:      document.getElementById("btn-cancel-submit"),
  btnConfirmSubmit:     document.getElementById("btn-confirm-submit"),

  // Result
  resultIcon:      document.getElementById("result-icon"),
  resultCard:      document.getElementById("result-card"),
  resultTitle:     document.getElementById("result-title"),
  resultSubtitle:  document.getElementById("result-subtitle"),
  resultNote:      document.getElementById("result-note"),
  resultFetching:  document.getElementById("result-fetching"),
  resultRingLoader:document.getElementById("result-ring-loader"),
  scoreRingFill:   document.getElementById("score-ring-fill"),
  resultScoreNum:  document.getElementById("result-score-num"),
  resultScoreTotal:document.getElementById("result-score-total"),
  rTabs:    document.getElementById("r-tabs"),
  rFS:      document.getElementById("r-fs"),
  rSS:      document.getElementById("r-ss"),
  rDevice:  document.getElementById("r-device"),
  btnReviewAnswers: document.getElementById("btn-review-answers"),
  btnRetrySubmission: document.getElementById("btn-retry-submit"),
  btnExitFullscreen: document.getElementById("btn-exit-fullscreen"),
  pdfReportCard: document.getElementById("pdf-report-card"),
  reportStudentName: document.getElementById("report-student-name"),
  reportStudentId: document.getElementById("report-student-id"),
  reportQuizTitle: document.getElementById("report-quiz-title"),
  reportGeneratedAt: document.getElementById("report-generated-at"),
  reportTotalQuestions: document.getElementById("report-total-questions"),
  reportAttempted: document.getElementById("report-attempted"),
  reportCorrect: document.getElementById("report-correct"),
  reportWrong: document.getElementById("report-wrong"),
  reportScore: document.getElementById("report-score"),
  reportScoreCaption: document.getElementById("report-score-caption"),
  reportStatus: document.getElementById("report-status"),
  reportAccuracy: document.getElementById("report-accuracy"),

  // Review
  reviewSummary: document.getElementById("review-summary"),
  reviewContainer: document.getElementById("review-container"),
  btnCloseReview: document.getElementById("btn-close-review"),
  themeColorMeta: document.querySelector('meta[name="theme-color"]'),
};

/* ─────────────────────────────────────────────────────────────────
   5. UTILITY FUNCTIONS
───────────────────────────────────────────────────────────────────*/

/** Fisher-Yates shuffle — returns new shuffled array */
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Detect device type */
function getDeviceType() {
  const userAgent = navigator.userAgent || "";
  const mobileUserAgent = /Mobi|Android|iPhone|iPad|iPod/i.test(userAgent);
  const compactViewport = typeof window.matchMedia === "function"
    ? window.matchMedia("(max-width: 900px)").matches
    : window.innerWidth <= 900;
  const coarsePointer = typeof window.matchMedia === "function"
    ? window.matchMedia("(pointer: coarse)").matches
    : false;

  return mobileUserAgent || (compactViewport && coarsePointer) ? "mobile" : "desktop";
}

function getPreferredTheme() {
  return THEME_MEDIA_QUERY && THEME_MEDIA_QUERY.matches ? "dark" : "light";
}

function updateThemeColor(theme) {
  if (!DOM.themeColorMeta) return;
  DOM.themeColorMeta.setAttribute("content", theme === "dark" ? "#050508" : "#f8fbff");
}

function applyTheme(theme = getPreferredTheme()) {
  const resolvedTheme = theme === "light" ? "light" : "dark";
  state.theme = resolvedTheme;
  document.documentElement.dataset.theme = resolvedTheme;
  document.documentElement.style.colorScheme = resolvedTheme;
  document.body.dataset.theme = resolvedTheme;
  updateThemeColor(resolvedTheme);

  window.dispatchEvent(new CustomEvent("securequiz:themechange", {
    detail: { theme: resolvedTheme },
  }));
}

function initThemeSync() {
  applyTheme();

  if (!THEME_MEDIA_QUERY) return;

  const handleThemeChange = (event) => {
    applyTheme(event.matches ? "dark" : "light");
  };

  if (typeof THEME_MEDIA_QUERY.addEventListener === "function") {
    THEME_MEDIA_QUERY.addEventListener("change", handleThemeChange);
  } else if (typeof THEME_MEDIA_QUERY.addListener === "function") {
    THEME_MEDIA_QUERY.addListener(handleThemeChange);
  }
}

function shouldDisableAmbientEffects() {
  const compactOrTouchDevice = typeof window.matchMedia === "function"
    ? window.matchMedia("(max-width: 900px), (hover: none), (pointer: coarse), (prefers-reduced-motion: reduce)").matches
    : window.innerWidth <= 900;

  return state.deviceType === "mobile" || compactOrTouchDevice;
}

function applyAmbientEffectsMode(force = false) {
  const disableEffects = shouldDisableAmbientEffects();
  const wasDisabled = document.body.classList.contains("ambient-effects-off");

  document.body.classList.toggle("ambient-effects-off", disableEffects);

  if (typeof window.initCanvasBackground === "function" && (force || disableEffects !== wasDisabled)) {
    window.initCanvasBackground({ disabled: disableEffects });
  }
}

function supportsFullscreenApi() {
  const el = document.documentElement;
  return !!(
    el.requestFullscreen ||
    el.webkitRequestFullscreen ||
    el.mozRequestFullScreen ||
    el.msRequestFullscreen
  );
}

function shouldEnforceFullscreen() {
  return state.fullscreenMonitoringEnabled
    && supportsFullscreenApi()
    && (state.deviceType !== "mobile" || CONFIG.ENFORCE_FULLSCREEN_ON_MOBILE);
}

function isFullscreenActive() {
  return !!(
    document.fullscreenElement ||
    document.webkitFullscreenElement ||
    document.mozFullScreenElement ||
    document.msFullscreenElement
  );
}

function getDraftStorageKey(usn = state.student.usn) {
  const safeUsn = (usn || "anonymous").trim().toUpperCase();
  return `${CONFIG.DRAFT_KEY_PREFIX}_${safeUsn}`;
}

function normalizeScreenKey(screenKey) {
  const allowedScreens = new Set(["registration", "instructions", "quiz", "result", "review"]);
  return allowedScreens.has(screenKey) ? screenKey : "registration";
}

function getScreenKeyFromElement(target) {
  switch (target) {
    case DOM.screenInst:
      return "instructions";
    case DOM.screenQuiz:
      return "quiz";
    case DOM.screenResult:
      return "result";
    case DOM.screenReview:
      return "review";
    case DOM.screenReg:
    default:
      return "registration";
  }
}

function getScreenElementByKey(screenKey) {
  switch (normalizeScreenKey(screenKey)) {
    case "instructions":
      return DOM.screenInst;
    case "quiz":
      return DOM.screenQuiz;
    case "result":
      return DOM.screenResult;
    case "review":
      return DOM.screenReview;
    case "registration":
    default:
      return DOM.screenReg;
  }
}

function readRegistrationDraftFromDom() {
  const usn = DOM.inpUSN ? DOM.inpUSN.value.trim().toUpperCase() : state.registrationDraft.usn;
  const email = DOM.inpEmail ? DOM.inpEmail.value.trim().toLowerCase() : state.registrationDraft.email;

  return { usn, email };
}

function syncRegistrationDraftFromDom() {
  state.registrationDraft = readRegistrationDraftFromDom();
  return state.registrationDraft;
}

function fillRegistrationDraft(draft = state.registrationDraft) {
  const safeDraft = draft && typeof draft === "object" ? draft : { usn: "", email: "" };

  if (DOM.inpUSN) {
    DOM.inpUSN.value = safeDraft.usn || "";
  }

  if (DOM.inpEmail) {
    DOM.inpEmail.value = safeDraft.email || "";
  }
}

function getSerializableState() {
  const registrationDraft = syncRegistrationDraftFromDom();

  return {
    currentScreen: state.currentScreen,
    registrationDraft,
    instructionsAccepted: state.instructionsAccepted,
    student: state.student,
    deviceType: state.deviceType,
    questions: state.questions,
    currentIndex: state.currentIndex,
    answers: state.answers,
    startTime: state.startTime ? new Date(state.startTime).toISOString() : null,
    timeLeft: state.timeLeft,
    tabSwitchCount: state.tabSwitchCount,
    fullscreenExitCount: state.fullscreenExitCount,
    screenshotAttempts: state.screenshotAttempts,
    suspiciousBlur: state.suspiciousBlur,
    cameraAccess: state.cameraAccess,
    micAccess: state.micAccess,
    suspiciousEvents: state.suspiciousEvents,
    submissionReview: state.submissionReview,
    lastSubmissionTimestamp: state.lastSubmissionTimestamp,
    lastReviewToken: state.lastReviewToken,
    submissionPersisted: state.submissionPersisted,
    fullscreenMonitoringEnabled: state.fullscreenMonitoringEnabled,
    quizStarted: state.quizStarted,
    submitted: state.submitted,
  };
}

function applySerializedState(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return false;

  state.currentScreen = normalizeScreenKey(snapshot.currentScreen);
  state.registrationDraft = snapshot.registrationDraft && typeof snapshot.registrationDraft === "object"
    ? {
        usn: String(snapshot.registrationDraft.usn || "").trim().toUpperCase(),
        email: String(snapshot.registrationDraft.email || "").trim().toLowerCase(),
      }
    : { usn: "", email: "" };
  state.instructionsAccepted = Boolean(snapshot.instructionsAccepted);

  if (!snapshot.student || !snapshot.student.usn) return false;

  state.student = snapshot.student;
  state.deviceType = snapshot.deviceType || getDeviceType();
  state.questions = Array.isArray(snapshot.questions) ? snapshot.questions : [];
  state.currentIndex = Number.isInteger(snapshot.currentIndex) ? snapshot.currentIndex : 0;
  state.answers = snapshot.answers || {};
  state.startTime = snapshot.startTime ? new Date(snapshot.startTime) : state.startTime;
  state.timeLeft = Number.isFinite(snapshot.timeLeft) ? snapshot.timeLeft : CONFIG.SECONDS_PER_QUESTION;
  state.tabSwitchCount = snapshot.tabSwitchCount || 0;
  state.fullscreenExitCount = snapshot.fullscreenExitCount || 0;
  state.screenshotAttempts = snapshot.screenshotAttempts || 0;
  state.suspiciousBlur = snapshot.suspiciousBlur || 0;
  state.cameraAccess = snapshot.cameraAccess ?? "not-requested";
  state.micAccess = snapshot.micAccess ?? "not-requested";
  state.suspiciousEvents = Array.isArray(snapshot.suspiciousEvents) ? snapshot.suspiciousEvents : [];
  state.submissionReview = snapshot.submissionReview && typeof snapshot.submissionReview === "object"
    ? snapshot.submissionReview
    : null;
  state.lastSubmissionTimestamp = snapshot.lastSubmissionTimestamp || null;
  state.lastReviewToken = snapshot.lastReviewToken || null;
  state.submissionPersisted = snapshot.submissionPersisted ?? false;
  state.fullscreenMonitoringEnabled = snapshot.fullscreenMonitoringEnabled ?? true;
  state.quizStarted = snapshot.quizStarted ?? state.quizStarted;
  state.submitted = snapshot.submitted ?? state.submitted;

  if (!state.questions.length) {
    setupQuestions();
  }

  if (state.currentIndex >= state.questions.length) {
    state.currentIndex = Math.max(0, state.questions.length - 1);
  }

  return true;
}

function persistAppState() {
  try {
    localStorage.setItem(CONFIG.APP_STATE_KEY, JSON.stringify(getSerializableState()));
  } catch (error) {
    console.error("[SecureQuiz] Failed to persist app state:", error);
  }
}

function loadPersistedAppState() {
  try {
    const saved = localStorage.getItem(CONFIG.APP_STATE_KEY);
    if (!saved) return null;

    const parsed = JSON.parse(saved);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (error) {
    console.error("[SecureQuiz] Failed to restore persisted app state:", error);
    localStorage.removeItem(CONFIG.APP_STATE_KEY);
    return null;
  }
}

/** Show / hide screens — also toggles 'hidden' class so display:none !important doesn't block content */
function showScreen(target) {
  [DOM.screenReg, DOM.screenInst, DOM.screenQuiz, DOM.screenResult, DOM.screenReview].forEach(s => {
    if (s) {
      s.classList.remove("active");
      s.classList.add("hidden");
    }
  });
  if (target) {
    target.classList.remove("hidden");
    target.classList.add("active");
    state.currentScreen = getScreenKeyFromElement(target);
  }
  persistAppState();
}

/** Show registration error */
function showRegError(msg) {
  DOM.regError.textContent = msg;
  DOM.regError.classList.remove("hidden");
}
function clearRegError() { DOM.regError.classList.add("hidden"); }

/** Log a suspicious event */
function logEvent(type, detail = "") {
  const entry = { type, detail, time: new Date().toISOString() };
  state.suspiciousEvents.push(entry);
  console.warn("[SecureQuiz] Suspicious Event:", entry);
  saveStateToLocalStorage(true);
}

/** Update proctoring bar in quiz header */
function updateProctoringBar() {
  DOM.statTabs.textContent = `🔁 Tabs: ${state.tabSwitchCount}`;
  DOM.statFS.textContent   = `📺 FS Exits: ${state.fullscreenExitCount}`;
  DOM.statSS.textContent   = `📸 Screenshots: ${state.screenshotAttempts}`;
}

/** Show / hide overlay */
function showOverlay(el)  { el.classList.remove("hidden"); }
function hideOverlay(el)  { el.classList.add("hidden"); }

async function validateStudent(usn) {
  const url = `${CONFIG.APPS_SCRIPT_URL}?action=validateStudent&usn=${encodeURIComponent(usn)}`;
  console.log("[SecureQuiz] Validating student", { usn, url });
  const res = await fetchWithTimeout(url, {}, CONFIG.SUBMISSION_REQUEST_TIMEOUT_MS);
  if (!res.ok) throw new Error("HTTP error " + res.status);

  const data = await readJsonResponse(res, "validateStudent");
  if (!data.valid) return null;

  return data.student || null;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchWithTimeout(resource, options = {}, timeoutMs = CONFIG.SUBMISSION_REQUEST_TIMEOUT_MS) {
  const controller = typeof AbortController === "function" ? new AbortController() : null;
  const timeoutId = controller
    ? window.setTimeout(() => controller.abort(), timeoutMs)
    : null;

  try {
    return await fetch(resource, {
      ...options,
      ...(controller ? { signal: controller.signal } : {}),
    });
  } catch (error) {
    if (error && error.name === "AbortError") {
      throw new Error(`Request timed out after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    if (timeoutId) {
      window.clearTimeout(timeoutId);
    }
  }
}

async function readJsonResponse(response, contextLabel) {
  const rawText = await response.text();
  console.log(`[SecureQuiz] ${contextLabel} raw response:`, rawText);

  if (!rawText) return {};

  try {
    return JSON.parse(rawText);
  } catch (error) {
    throw new Error(`${contextLabel} returned non-JSON data: ${rawText.slice(0, 160)}`);
  }
}

function setReviewButtonState(enabled, label = "Review Answers") {
  if (!DOM.btnReviewAnswers) return;
  DOM.btnReviewAnswers.disabled = !enabled;
  DOM.btnReviewAnswers.textContent = label;
}

function setRetryButtonState(visible, label = "Retry Submission", disabled = false) {
  if (!DOM.btnRetrySubmission) return;

  DOM.btnRetrySubmission.classList.toggle("hidden", !visible);
  DOM.btnRetrySubmission.disabled = disabled;
  DOM.btnRetrySubmission.textContent = label;
}

function setResultFetchingState(isFetching) {
  if (DOM.resultCard) {
    DOM.resultCard.classList.toggle("is-loading", isFetching);
  }
  if (DOM.resultFetching) {
    DOM.resultFetching.classList.toggle("hidden", !isFetching);
  }
  if (DOM.resultRingLoader) {
    DOM.resultRingLoader.classList.toggle("hidden", !isFetching);
  }
}

function formatReportDateTime(timestamp) {
  const date = timestamp ? new Date(timestamp) : new Date();
  if (Number.isNaN(date.getTime())) return "--";

  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function resetFullscreenOverlayState() {
  if (DOM.fullscreenMsg && DOM.fullscreenMsg.parentElement) {
    DOM.fullscreenMsg.parentElement.classList.remove("warning");
  }

  if (DOM.btnReturnFullscreen) {
    DOM.btnReturnFullscreen.textContent = "Return to Fullscreen";
  }
}

function disableFullscreenMonitoring(message) {
  state.fullscreenMonitoringEnabled = false;
  document.body.classList.remove("last-strike");

  if (DOM.btnExitFullscreen) {
    DOM.btnExitFullscreen.style.display = "none";
  }

  if (!message || !state.quizStarted || state.submitted) return;

  resetFullscreenOverlayState();
  DOM.fullscreenMsg.textContent = message;
  DOM.btnReturnFullscreen.textContent = "Continue Quiz";
  showOverlay(DOM.overlayFullscreen);
}

function getAttemptedQuestionCount() {
  return state.questions.reduce((count, _question, idx) => (
    state.answers[idx] ? count + 1 : count
  ), 0);
}

function renderReportCard({
  scoreCorrect = null,
  scoreTotal = null,
  timestamp = state.lastSubmissionTimestamp,
  status = "Awaiting live grading",
  caption = "Waiting for grading...",
  accuracy = "Accuracy will appear after grading.",
  isReady = false,
} = {}) {
  if (!DOM.pdfReportCard) return;

  const totalQuestions = state.questions.length;
  const attemptedQuestions = getAttemptedQuestionCount();
  const resolvedTotal = Number.isFinite(scoreTotal) ? scoreTotal : totalQuestions;
  const hasScore = Number.isFinite(scoreCorrect) && Number.isFinite(resolvedTotal);
  const wrongAnswers = hasScore ? Math.max(attemptedQuestions - scoreCorrect, 0) : "--";
  const percent = hasScore && resolvedTotal > 0
    ? Math.round((scoreCorrect / resolvedTotal) * 100)
    : null;

  DOM.pdfReportCard.classList.toggle("is-pending", !isReady);
  DOM.reportStudentName.textContent = state.student.name || "Student Name";
  DOM.reportStudentId.textContent = `USN: ${state.student.usn || "--"}`;
  DOM.reportQuizTitle.textContent = CONFIG.QUIZ_TITLE;
  DOM.reportGeneratedAt.textContent = formatReportDateTime(timestamp);
  DOM.reportTotalQuestions.textContent = String(totalQuestions);
  DOM.reportAttempted.textContent = String(attemptedQuestions);
  DOM.reportCorrect.textContent = hasScore ? String(scoreCorrect) : "--";
  DOM.reportWrong.textContent = hasScore ? String(wrongAnswers) : "--";
  DOM.reportScore.textContent = hasScore ? `${scoreCorrect}/${resolvedTotal}` : "--";
  DOM.reportScoreCaption.textContent = caption;
  DOM.reportStatus.textContent = status;
  DOM.reportAccuracy.textContent = hasScore
    ? `${percent}% accuracy across ${attemptedQuestions}/${totalQuestions} attempted questions.`
    : accuracy;
}

function createReviewToken() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }

  if (window.crypto && typeof window.crypto.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    window.crypto.getRandomValues(bytes);
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  }

  return `review_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function buildSupabaseErrorMessage(error, operation, tableName = "submissions") {
  const code = error && error.code ? String(error.code) : "UNKNOWN";
  const base = error && error.message ? error.message : "Unknown Supabase error.";

  if (["42501", "PGRST301", "PGRST116"].includes(code)) {
    return `Supabase ${operation} blocked on '${tableName}' (code: ${code}). Run the SQL in supabase-schema.sql to create policies and grants for anon/authenticated roles.`;
  }

  if (["42703", "PGRST204"].includes(code)) {
    return `Supabase ${operation} failed because '${tableName}' schema is outdated (code: ${code}). Run supabase-schema.sql to add the latest columns.`;
  }

  if (code === "22P02") {
    return `Supabase ${operation} failed due to invalid quiz_id format (code: ${code}). Open the quiz only from the generated student link.`;
  }

  if (code === "23503") {
    return `Supabase ${operation} failed due to invalid quiz link (foreign-key mismatch on quiz_id). Open quiz using the exact generated student URL.`;
  }

  return `Supabase ${operation} failed (${code}): ${base}`;
}

async function fetchLatestSubmissionReview(usn, reviewToken) {
  const query = new URLSearchParams({
    action: "getLatestSubmission",
    usn,
    reviewToken,
  });

  const res = await fetchWithTimeout(
    `${CONFIG.APPS_SCRIPT_URL}?${query.toString()}`,
    {},
    CONFIG.SUBMISSION_REQUEST_TIMEOUT_MS
  );
  if (!res.ok) {
    throw new Error(`HTTP error ${res.status}`);
  }

  return readJsonResponse(res, "getLatestSubmission");
}

async function submitQuizViaGet(payload) {
  const query = new URLSearchParams({
    action: "submitQuiz",
    name: payload.name || "",
    studentId: payload.studentId || "",
    email: payload.email || "",
    answers: payload.answers || "[]",
    tabSwitch: String(payload.tabSwitch ?? 0),
    fullscreenExit: String(payload.fullscreenExit ?? 0),
    screenshot: String(payload.screenshot ?? 0),
    camera: String(payload.camera ?? 0),
    mic: String(payload.mic ?? 0),
    device: payload.device || "unknown",
    timestamp: payload.timestamp || new Date().toISOString(),
    autoSubmit: String(payload.autoSubmit ?? false),
    reviewToken: payload.reviewToken || "",
    suspiciousLog: payload.suspiciousLog || "[]",
  });

  const res = await fetchWithTimeout(
    `${CONFIG.APPS_SCRIPT_URL}?${query.toString()}`,
    {},
    CONFIG.SUBMISSION_REQUEST_TIMEOUT_MS
  );

  if (!res.ok) {
    throw new Error(`HTTP error ${res.status}`);
  }

  return readJsonResponse(res, "submitQuizViaGet");
}

async function submitQuizViaFormPost(payload) {
  if (!document.body) {
    throw new Error("Document body is not ready for form submission fallback.");
  }

  return new Promise((resolve, reject) => {
    const frameName = `secureQuizSubmitFrame_${Date.now()}`;
    const iframe = document.createElement("iframe");
    const form = document.createElement("form");
    let settled = false;

    const cleanup = () => {
      window.setTimeout(() => {
        iframe.remove();
        form.remove();
      }, 0);
    };

    const finish = (callback) => {
      if (settled) return;
      settled = true;
      cleanup();
      callback();
    };

    iframe.name = frameName;
    iframe.title = "SecureQuiz submission transport";
    iframe.setAttribute("aria-hidden", "true");
    iframe.tabIndex = -1;
    iframe.style.display = "none";

    form.method = "POST";
    form.action = CONFIG.APPS_SCRIPT_URL;
    form.target = frameName;
    form.acceptCharset = "UTF-8";
    form.style.display = "none";

    Object.entries(payload).forEach(([key, value]) => {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = key;
      input.value = value == null ? "" : String(value);
      form.appendChild(input);
    });

    iframe.addEventListener("load", () => {
      finish(() => resolve(null));
    }, { once: true });

    iframe.addEventListener("error", () => {
      finish(() => reject(new Error("Form submission fallback failed to load.")));
    }, { once: true });

    document.body.appendChild(iframe);
    document.body.appendChild(form);

    window.setTimeout(() => {
      finish(() => resolve(null));
    }, 2000);

    try {
      form.submit();
    } catch (error) {
      finish(() => reject(error));
    }
  });
}

function buildLocalReviewPayload() {
  const reviewAnswers = state.questions.map((q, idx) => {
    const studentAnswer = state.answers[idx] || "NOT ANSWERED";
    const correctAnswer = q.answer || "";
    return {
      questionId: q.id,
      question: q.q,
      studentAnswer,
      correctAnswer,
      isCorrect: Boolean(correctAnswer) && studentAnswer === correctAnswer,
    };
  });

  const scoreCorrect = reviewAnswers.reduce((sum, item) => sum + (item.isCorrect ? 1 : 0), 0);
  return {
    scoreCorrect,
    scoreTotal: state.questions.length,
    reviewAnswers,
  };
}

async function fetchSubmissionFromSupabase(reviewToken) {
  if (!reviewToken) return null;

  try {
    const { data, error } = await supabase
      .from("submissions")
      .select("*")
      .eq("review_token", reviewToken)
      .single();

    if (error) {
      console.error("[SecureQuiz] Failed to fetch submission from Supabase:", error);
      return null;
    }

    return data;
  } catch (error) {
    console.error("[SecureQuiz] Error in fetchSubmissionFromSupabase:", error);
    return null;
  }
}

async function persistSubmissionToSupabase({
  timestamp,
  isAutoSubmit,
  device,
  reviewToken,
  localReview,
}) {
  if (!state.quizId) return false;

  const submissionPayload = {
    quiz_id: state.quizId,
    student_name: state.student.name,
    student_id: state.student.usn,
    email: state.student.email,
    device,
    auto_submit: isAutoSubmit,
    tab_switches: state.tabSwitchCount,
    fullscreen_exits: state.fullscreenExitCount,
    screenshot_attempts: state.screenshotAttempts,
    suspicious_events: state.suspiciousEvents,
    answers: localReview.reviewAnswers,
    score_correct: localReview.scoreCorrect,
    score_total: localReview.scoreTotal,
    score_text: `${localReview.scoreCorrect}/${localReview.scoreTotal}`,
    review_token: reviewToken,
    submitted_at_iso: timestamp,
  };

  const compactPayload = {
    quiz_id: state.quizId,
    student_name: state.student.name,
    student_id: state.student.usn,
    email: state.student.email,
    device,
    auto_submit: isAutoSubmit,
    tab_switches: state.tabSwitchCount,
    fullscreen_exits: state.fullscreenExitCount,
    screenshot_attempts: state.screenshotAttempts,
    score_correct: localReview.scoreCorrect,
    score_total: localReview.scoreTotal,
    score_text: `${localReview.scoreCorrect}/${localReview.scoreTotal}`,
    submitted_at_iso: timestamp,
  };

  const minimalPayload = {
    quiz_id: state.quizId,
    student_name: state.student.name,
    student_id: state.student.usn,
    email: state.student.email,
    submitted_at_iso: timestamp,
  };

  const attempts = [
    { label: "full", payload: submissionPayload },
    { label: "compact", payload: compactPayload },
    { label: "minimal", payload: minimalPayload },
  ];

  let lastError = null;

  for (const attempt of attempts) {
    const { error } = await supabase.from("submissions").insert(attempt.payload);
    if (!error) {
      if (attempt.label !== "full") {
        console.warn(`[SecureQuiz] Supabase submissions insert succeeded via ${attempt.label} compatibility payload.`);
      }
      return true;
    }

    lastError = error;
    console.warn(`[SecureQuiz] Supabase submissions insert failed for ${attempt.label} payload:`, error);

    // Permission and relation errors won't be fixed by trying smaller payloads.
    if (["42501", "PGRST301", "PGRST116", "22P02", "23503"].includes(String(error.code || ""))) {
      break;
    }
  }

  if (lastError) {
    throw new Error(buildSupabaseErrorMessage(lastError, "insert", "submissions"));
  }

  throw new Error("Supabase insert failed for unknown reason.");
}

async function waitForSubmissionInSupabase(reviewToken) {
  if (!reviewToken) return null;

  const deadline = Date.now() + CONFIG.RESULT_LOOKUP_TIMEOUT_MS;
  let lastError = null;

  while (Date.now() < deadline) {
    try {
      const submission = await fetchSubmissionFromSupabase(reviewToken);
      if (submission) {
        return submission;
      }
    } catch (error) {
      lastError = error;
      console.error("[SecureQuiz] Supabase submission lookup error:", error);
    }

    const timeRemaining = deadline - Date.now();
    if (timeRemaining <= 0) break;

    await delay(Math.min(CONFIG.RESULT_LOOKUP_INTERVAL_MS, timeRemaining));
  }

  if (lastError) {
    // throw lastError;
    console.warn("[SecureQuiz] Final Supabase lookup failed.", lastError);
  }

  return null;
}

async function waitForSubmissionReview(usn, reviewToken) {
  const deadline = Date.now() + CONFIG.RESULT_LOOKUP_TIMEOUT_MS;
  let lastResponse = null;
  let lastError = null;

  while (Date.now() < deadline) {
    try {
      const responseData = await fetchLatestSubmissionReview(usn, reviewToken);
      lastResponse = responseData;

      if (responseData && (responseData.status === "success" || hasSubmissionScore(responseData))) {
        return responseData;
      }

      if (responseData && responseData.status && !["not_found", "ok"].includes(responseData.status)) {
        return responseData;
      }
    } catch (error) {
      lastError = error;
    }

    const timeRemaining = deadline - Date.now();
    if (timeRemaining <= 0) break;

    await delay(Math.min(CONFIG.RESULT_LOOKUP_INTERVAL_MS, timeRemaining));
  }

  if (lastResponse && lastResponse.status !== "ok") {
    return lastResponse;
  }

  if (lastError) {
    throw lastError;
  }

  return null;
}

function animateScoreRing(score, total) {
  if (!DOM.scoreRingFill) return;

  const circumference = 314;
  const safeTotal = Math.max(total || 0, 1);
  const pct = Math.max(0, Math.min(1, score / safeTotal));
  const offset = circumference - (pct * circumference);
  DOM.scoreRingFill.style.strokeDashoffset = circumference;

  requestAnimationFrame(() => {
    DOM.scoreRingFill.style.strokeDashoffset = offset;
  });
}

function parseScore(scoreText, fallbackTotal = state.questions.length) {
  if (typeof scoreText === "string" && scoreText.includes("/")) {
    const [correctText, totalText] = scoreText.split("/");
    const correct = Number.parseInt(correctText, 10);
    const total = Number.parseInt(totalText, 10);

    if (Number.isFinite(correct) && Number.isFinite(total)) {
      return { correct, total };
    }
  }

  return { correct: 0, total: fallbackTotal };
}

function hasSubmissionScore(responseData) {
  if (!responseData || typeof responseData !== "object") return false;

  if (Number.isFinite(responseData.scoreCorrect) && Number.isFinite(responseData.scoreTotal)) {
    return true;
  }

  return typeof responseData.score === "string" && responseData.score.includes("/");
}

function isOutdatedSubmitEndpointResponse(responseData) {
  if (!responseData || typeof responseData !== "object") return false;

  return responseData.status === "ok"
    && typeof responseData.message === "string"
    && /api is live/i.test(responseData.message);
}

function applySubmissionResult(result, fallbackTotal, device) {
  setResultFetchingState(false);
  setRetryButtonState(false);
  const parsedScore = parseScore(result.score, fallbackTotal);
  const scoreCorrect = Number.isFinite(result.scoreCorrect) ? result.scoreCorrect : parsedScore.correct;
  const scoreTotal = Number.isFinite(result.scoreTotal) ? result.scoreTotal : parsedScore.total;
  const reviewAnswers = Array.isArray(result.reviewAnswers) ? result.reviewAnswers : [];
  state.submitted = true;
  state.lastSubmissionTimestamp = result.timestamp || state.lastSubmissionTimestamp || new Date().toISOString();
  markSubmissionAsStored(state.lastSubmissionTimestamp);

  state.submissionReview = {
    scoreCorrect,
    scoreTotal,
    reviewAnswers,
  };

  DOM.resultIcon.textContent = "OK";
  DOM.resultTitle.textContent = "Submission Successful!";
  DOM.resultSubtitle.textContent = `Your quiz has been graded. Score: ${scoreCorrect}/${scoreTotal}.`;
  DOM.resultScoreNum.textContent = String(scoreCorrect).padStart(2, "0");
  DOM.resultScoreTotal.textContent = `/${scoreTotal}`;
  animateScoreRing(scoreCorrect, scoreTotal);

  if (DOM.resultNote) {
    DOM.resultNote.textContent = reviewAnswers.length
      ? "You can now review each question, your answer, and the correct answer."
      : "Submission completed, but detailed review data is unavailable for this environment.";
  }

  setReviewButtonState(reviewAnswers.length > 0);
  renderReportCard({
    scoreCorrect,
    scoreTotal,
    timestamp: state.lastSubmissionTimestamp,
    status: "Secure Quiz",
    caption: `Officially for ${state.student.name || state.student.usn}.`,
    isReady: true,
  });
  DOM.rDevice.textContent = device;
  persistAppState();
}

function applySubmissionFallbackState(
  message,
  {
    title = "Submission Pending",
    note = "Google Sheets has not confirmed this submission yet.",
    status = "Backend response pending",
    caption = "The result view will update automatically after a successful backend write.",
    retryLabel = "Retry Submission",
    showRetry = true,
  } = {}
) {
  setResultFetchingState(false);
  state.submitted = true;
  state.submissionReview = null;
  DOM.resultIcon.textContent = "!";
  DOM.resultTitle.textContent = title;
  DOM.resultSubtitle.textContent = message;
  DOM.resultScoreNum.textContent = "--";
  DOM.resultScoreTotal.textContent = "";
  animateScoreRing(0, 1);

  if (DOM.resultNote) {
    DOM.resultNote.textContent = note;
  }

  setReviewButtonState(false, "Review Unavailable");
  setRetryButtonState(showRetry, retryLabel, false);
  renderReportCard({
    scoreCorrect: null,
    scoreTotal: state.questions.length,
    timestamp: state.lastSubmissionTimestamp,
    status,
    caption,
    accuracy: message,
    isReady: false,
  });
  persistAppState();
}

async function resolveSubmissionState(responseData, total, device, reviewToken = state.lastReviewToken) {
  console.log("[SecureQuiz] Resolving submission state", {
    reviewToken,
    total,
    device,
    responseStatus: responseData && responseData.status ? responseData.status : null,
  });

  // Supabase-first lookup
  if (reviewToken) {
    const supabaseSubmission = await waitForSubmissionInSupabase(reviewToken);
    if (supabaseSubmission) {
      console.log("[SecureQuiz] Found submission in Supabase.", supabaseSubmission);
      const reviewAnswers = Array.isArray(supabaseSubmission.answers) ? supabaseSubmission.answers : [];
      applySubmissionResult({
        scoreCorrect: supabaseSubmission.score_correct,
        scoreTotal: supabaseSubmission.score_total,
        reviewAnswers: reviewAnswers,
        timestamp: supabaseSubmission.submitted_at_iso,
        score: supabaseSubmission.score_text,
      }, total, device);
      return;
    }
  }

  if (responseData && isOutdatedSubmitEndpointResponse(responseData)) {
    applySubmissionFallbackState(
      "This quiz page reached Google Apps Script, but the deployed web app does not yet support quiz submission writes. Redeploy the latest Apps Script code, then try the quiz again.",
      {
        title: "Backend Update Required",
        note: "The current Google Apps Script deployment is responding, but it is not saving submission rows.",
        status: "Apps Script redeploy required",
        caption: "Redeploy your backend endpoint and verify write permissions for quiz submissions.",
      }
    );
    return;
  }

  if (responseData && (responseData.status === "success" || hasSubmissionScore(responseData))) {
    applySubmissionResult(responseData, total, device);
    return;
  }

  if (responseData && responseData.status && !["not_found", "duplicate"].includes(responseData.status)) {
    applySubmissionFallbackState(
      responseData.message || "Google Sheets did not confirm a saved submission row.",
      {
        title: "Submission Not Confirmed",
        note: "The backend responded, but the quiz could not verify that the row was stored in Google Sheets.",
        status: "Google Sheets confirmation missing",
        caption: "Check Apps Script permissions, sheet names, and the deployed Web App version.",
      }
    );
    return;
  }

  if (!state.student.usn || !reviewToken) {
    applySubmissionFallbackState(
      "The quiz state was restored, but no submission token was available to resume grading.",
      {
        title: "Submission Pending",
        note: "Refresh recovery worked, but the app could not resume the grading lookup automatically.",
        status: "Review token missing",
        caption: "Submit the quiz again only if Google Sheets did not already record your attempt.",
      }
    );
    return;
  }

  try {
    const lookupResponse = await waitForSubmissionReview(state.student.usn, reviewToken);

    if (lookupResponse && (lookupResponse.status === "success" || hasSubmissionScore(lookupResponse))) {
      applySubmissionResult(lookupResponse, total, device);
    } else if (lookupResponse) {
      applySubmissionFallbackState(
        lookupResponse.message || "Google Sheets did not confirm a saved submission row.",
        {
          title: "Submission Not Confirmed",
          note: "The score lookup completed, but no saved submission row was returned from Google Apps Script.",
          status: "Submission row not found",
          caption: "This usually means the Apps Script Web App did not write to the QuizResponses sheet.",
        }
      );
    } else {
      applySubmissionFallbackState(
        "No saved row was found in Google Sheets for this attempt.",
        {
          title: "Submission Not Confirmed",
          note: "The quiz could not verify a stored response in Google Sheets.",
          status: "Submission row not found",
          caption: "Redeploy the Apps Script Web App and make sure script.js points to the latest /exec URL.",
        }
      );
    }
  } catch (lookupError) {
    console.warn("[SecureQuiz] Submission review lookup timed out or failed.", lookupError);
    applySubmissionFallbackState(
      "The app could not confirm that Google Sheets stored this attempt. Please check the Apps Script deployment and try again.",
      {
        title: "Submission Not Confirmed",
        note: "A backend timeout occurred before Google Sheets returned a stored submission row.",
        status: "Backend timeout",
        caption: "If you updated backend logic, redeploy it and verify the endpoint URL in configuration.",
      }
    );
  }
}

function restorePersistedScreen() {
  const screenKey = normalizeScreenKey(state.currentScreen);
  const total = state.questions.length || (state.submissionReview && state.submissionReview.scoreTotal) || 0;
  const device = state.deviceType || getDeviceType();

  fillRegistrationDraft(state.registrationDraft);

  if (screenKey === "instructions") {
    showScreen(DOM.screenInst);
    if (DOM.chkAgree && DOM.btnProceed) {
      DOM.chkAgree.checked = state.instructionsAccepted;
      DOM.btnProceed.disabled = !state.instructionsAccepted;
      DOM.btnProceed.classList.toggle("locked", !state.instructionsAccepted);
    }
    return;
  }

  if (screenKey === "quiz") {
    state.quizStarted = true;
    state.submitted = false;
    showScreen(DOM.screenQuiz);
    DOM.quizStudentName.textContent = state.student.name || "";
    updateProctoringBar();
    renderQuestion(true);

    if (shouldEnforceFullscreen() && !isFullscreenActive()) {
      resetFullscreenOverlayState();
      DOM.fullscreenMsg.textContent = "Return to fullscreen to continue your restored quiz session.";
      showOverlay(DOM.overlayFullscreen);
    }
    return;
  }

  if (screenKey === "result" || screenKey === "review") {
    if (state.submissionReview) {
      showScreen(DOM.screenResult);
      applySubmissionResult({
        scoreCorrect: state.submissionReview.scoreCorrect,
        scoreTotal: state.submissionReview.scoreTotal,
        reviewAnswers: state.submissionReview.reviewAnswers,
        timestamp: state.lastSubmissionTimestamp,
        score: `${state.submissionReview.scoreCorrect}/${state.submissionReview.scoreTotal}`,
      }, total || state.submissionReview.scoreTotal, device);
    } else {
      showResultScreen(total, device);
      void resolveSubmissionState(null, total, device, state.lastReviewToken);
    }

    if (screenKey === "review" && state.submissionReview && Array.isArray(state.submissionReview.reviewAnswers)) {
      renderReviewScreen();
      showScreen(DOM.screenReview);
    }
    return;
  }

  showScreen(DOM.screenReg);
}

/* ─────────────────────────────────────────────────────────────────
   6. ANTI-CHEAT: TAB SWITCH DETECTION
   Uses the Page Visibility API to detect when the student switches
   to another tab or minimizes the browser window.
───────────────────────────────────────────────────────────────────*/
function initTabSwitchDetection() {
  DOM.btnDismissTabswitch.onclick = () => {
    hideOverlay(DOM.overlayTabSwitch);
    DOM.btnDismissTabswitch.textContent = "I Understand";
    if (shouldEnforceFullscreen() && !isFullscreenActive()) {
      requestFullscreen();
    }
  };

  document.addEventListener("visibilitychange", () => {
    if (!state.quizStarted || state.submitted) return;

    if (document.hidden) {
      state.tabSwitchCount++;
      logEvent("tab_switch", `Count: ${state.tabSwitchCount}`);
      updateProctoringBar();

      if (state.tabSwitchCount >= CONFIG.MAX_TAB_SWITCHES) {
        document.body.classList.remove("last-strike");
        DOM.tabswitchMsg.innerHTML = `You have exceeded the maximum number of tab switches (${CONFIG.MAX_TAB_SWITCHES}).<br><strong>The quiz will now be auto-submitted.</strong>`;
        DOM.btnDismissTabswitch.textContent = "Submit Quiz";
        DOM.btnDismissTabswitch.onclick = () => {
          hideOverlay(DOM.overlayTabSwitch);
          confirmSubmit(true);
        };
        showOverlay(DOM.overlayTabSwitch);
      } else if (state.tabSwitchCount === CONFIG.MAX_TAB_SWITCHES - 1) {
        document.body.classList.add("last-strike");
        DOM.btnDismissTabswitch.textContent = "I Understand";
        DOM.tabswitchMsg.textContent =
          `You switched tabs or minimized the window. This is your final warning. (Total: ${state.tabSwitchCount}/${CONFIG.MAX_TAB_SWITCHES})`;
        showOverlay(DOM.overlayTabSwitch);
      } else {
        document.body.classList.remove("last-strike");
        DOM.btnDismissTabswitch.textContent = "I Understand";
        DOM.tabswitchMsg.textContent =
          `You switched tabs or minimized the window. This has been recorded. (Total: ${state.tabSwitchCount}/${CONFIG.MAX_TAB_SWITCHES})`;
        showOverlay(DOM.overlayTabSwitch);
      }
    }
  });
}

/* ─────────────────────────────────────────────────────────────────
   7. ANTI-CHEAT: FULLSCREEN ENFORCEMENT
   Requests fullscreen when quiz starts. If student exits, shows
   warning overlay and logs the event.
───────────────────────────────────────────────────────────────────*/
function requestFullscreen() {
  const canAttemptMobileFullscreen = state.deviceType !== "mobile" || CONFIG.ENFORCE_FULLSCREEN_ON_MOBILE;
  if (!state.fullscreenMonitoringEnabled || !canAttemptMobileFullscreen) return Promise.resolve(false);

  const el = document.documentElement;
  const standardRequest = el.requestFullscreen;
  const request = standardRequest
    || el.webkitRequestFullscreen
    || el.mozRequestFullScreen
    || el.msRequestFullscreen;
  if (!request) {
    disableFullscreenMonitoring(
      "Fullscreen is not supported on this device/browser. The quiz will continue without fullscreen enforcement."
    );
    return Promise.resolve(false);
  }

  try {
    const maybePromise = standardRequest
      ? standardRequest.call(el, { navigationUI: "hide" })
      : request.call(el);

    if (maybePromise && typeof maybePromise.then === "function") {
      return maybePromise
        .then(() => isFullscreenActive())
        .catch((error) => {
          console.warn("[SecureQuiz] Fullscreen request failed:", error);
          disableFullscreenMonitoring(
            state.deviceType === "mobile"
              ? "This mobile browser blocked fullscreen. The quiz will continue without fullscreen enforcement. For the best experience, use Chrome on Android."
              : "This browser blocked fullscreen. The quiz will continue, but fullscreen monitoring has been disabled for this attempt."
          );
          return false;
        });
    }
  } catch (_) {
    disableFullscreenMonitoring(
      "This browser blocked fullscreen. The quiz will continue without fullscreen enforcement."
    );
    return Promise.resolve(false);
  }

  return Promise.resolve(isFullscreenActive());
}

function initFullscreenEnforcement() {
  const handler = () => {
    if (!state.quizStarted || state.submitted || !shouldEnforceFullscreen()) return;

    const isFullscreen = isFullscreenActive();

    if (!isFullscreen) {
      state.fullscreenExitCount++;
      logEvent("fullscreen_exit", `Count: ${state.fullscreenExitCount}`);
      updateProctoringBar();
      
      if (state.fullscreenExitCount >= CONFIG.MAX_FULLSCREEN_EXITS) {
        document.body.classList.remove("last-strike");
        resetFullscreenOverlayState();
        DOM.fullscreenMsg.parentElement.classList.add("warning");
        DOM.fullscreenMsg.innerHTML = `You have exceeded the maximum number of fullscreen exits (${CONFIG.MAX_FULLSCREEN_EXITS}).<br><strong>The quiz will now be auto-submitted.</strong>`;
        DOM.btnReturnFullscreen.textContent = "Submit Quiz";
      } else if (state.fullscreenExitCount === CONFIG.MAX_FULLSCREEN_EXITS - 1) {
        document.body.classList.add("last-strike");
        resetFullscreenOverlayState();
        DOM.fullscreenMsg.textContent = `You exited fullscreen mode. This is your final warning. (Total: ${state.fullscreenExitCount}/${CONFIG.MAX_FULLSCREEN_EXITS}). Please return to fullscreen to continue the quiz.`;
      } else {
        document.body.classList.remove("last-strike");
        resetFullscreenOverlayState();
        DOM.fullscreenMsg.textContent = `You exited fullscreen mode. This action has been logged. (Total: ${state.fullscreenExitCount}/${CONFIG.MAX_FULLSCREEN_EXITS}). Please return to fullscreen to continue the quiz.`;
      }
      showOverlay(DOM.overlayFullscreen);
    } else {
      document.body.classList.remove("last-strike");
    }
  };

  document.addEventListener("fullscreenchange", handler);
  document.addEventListener("webkitfullscreenchange", handler);
  document.addEventListener("mozfullscreenchange", handler);
  document.addEventListener("MSFullscreenChange", handler);

  // Return to fullscreen button logic
  DOM.btnReturnFullscreen.onclick = async () => {
    hideOverlay(DOM.overlayFullscreen);
    if (state.fullscreenExitCount >= CONFIG.MAX_FULLSCREEN_EXITS) {
      confirmSubmit(true);
    } else if (!shouldEnforceFullscreen()) {
      resetFullscreenOverlayState();
    } else {
      await requestFullscreen();
    }
  };
}

/* ─────────────────────────────────────────────────────────────────
   8. ANTI-CHEAT: COPY / PASTE / RIGHT-CLICK / TEXT SELECTION
   Disables common ways students might copy questions and paste
   answers from external sources.
───────────────────────────────────────────────────────────────────*/
function initCopyPasteDisable() {
  // Disable right-click context menu
  document.addEventListener("contextmenu", (e) => {
    if (state.quizStarted && !state.submitted) {
      e.preventDefault();
      logEvent("right_click_attempt");
    }
  });

  // Disable copy, cut, paste
  document.addEventListener("copy", (e) => {
    if (state.quizStarted && !state.submitted) {
      e.preventDefault();
      logEvent("copy_attempt");
    }
  });

  document.addEventListener("cut", (e) => {
    if (state.quizStarted && !state.submitted) {
      e.preventDefault();
      logEvent("cut_attempt");
    }
  });

  document.addEventListener("paste", (e) => {
    if (state.quizStarted && !state.submitted) {
      e.preventDefault();
      logEvent("paste_attempt");
    }
  });

  // Disable text selection
  document.addEventListener("selectstart", (e) => {
    if (state.quizStarted && !state.submitted) {
      e.preventDefault();
    }
  });

  // Disable drag
  document.addEventListener("dragstart", (e) => {
    if (state.quizStarted && !state.submitted) e.preventDefault();
  });
}

/* ─────────────────────────────────────────────────────────────────
   9. ANTI-CHEAT: PRINTSCREEN & SCREENSHOT DETECTION
   Detects the PrintScreen key.
───────────────────────────────────────────────────────────────────*/
function initScreenshotDetection() {
  // Desktop: detect PrintScreen key
  document.addEventListener("keydown", (e) => {
    if (!state.quizStarted || state.submitted) return;
    if (e.key === "PrintScreen" || e.code === "PrintScreen") {
      state.screenshotAttempts++;
      logEvent("printscreen_key_pressed", `Count: ${state.screenshotAttempts}`);
      updateProctoringBar();
      
      alert("Screenshot detected! This activity is recorded.");
      navigator.clipboard.writeText("Screenshot disabled during exam").catch(() => {});

      if (state.screenshotAttempts >= CONFIG.MAX_SCREENSHOT_ATTEMPTS) {
        alert("Multiple screenshot attempts detected. Submitting quiz.");
        confirmSubmit(true);
      }
    }

    // Block common keyboard shortcuts that could help cheating
    if ((e.ctrlKey || e.metaKey) && ["c","v","x","a","u","s","p"].includes(e.key.toLowerCase())) {
      if (state.quizStarted && !state.submitted) {
        e.preventDefault();
        logEvent("keyboard_shortcut_blocked", e.key);
      }
    }

    // Block F12 / DevTools
    if (e.key === "F12") {
      if (state.quizStarted && !state.submitted) {
        e.preventDefault();
        logEvent("f12_devtools_attempt");
      }
    }
  });

  document.addEventListener("visibilitychange", () => {
    if (!state.quizStarted || state.submitted) return;
    if (document.hidden) {
      state.suspiciousBlur++;
      saveStateToLocalStorage();
      if (state.suspiciousBlur > CONFIG.SUSPICIOUS_BLUR_ALERT_THRESHOLD) {
        alert("Suspicious screen activity detected!");
      }
    }
  });
}

/* ─────────────────────────────────────────────────────────────────
   10. CAMERA & MIC — Disabled (not requested)
   Camera and mic permission is skipped. Values stored as 0.
───────────────────────────────────────────────────────────────────*/
function requestMediaPermissions() {
  // Camera and mic not requested — stored as 0 in Google Sheets
  state.cameraAccess = 0;
  state.micAccess    = 0;
}

/* ─────────────────────────────────────────────────────────────────
   11. ANTI-CHEAT: DEVTOOLS AND CIRCLE-TO-SEARCH DETECTION
───────────────────────────────────────────────────────────────────*/
function initWindowBlurDetection() {
  window.addEventListener("blur", () => {
    if (!state.quizStarted || state.submitted) return;
    state.suspiciousBlur++;
    logEvent("window_blur", "Possible Circle-to-Search or app switch");
    console.log("Possible Circle to Search usage");

    if (state.suspiciousBlur > CONFIG.SUSPICIOUS_BLUR_ALERT_THRESHOLD) {
      alert("Suspicious screen activity detected");
    }
  });

  // Detect Developer Tools
  setInterval(() => {
    if (!state.quizStarted || state.submitted) return;
    if (
      window.outerWidth - window.innerWidth > CONFIG.DEVTOOLS_SIZE_THRESHOLD ||
      window.outerHeight - window.innerHeight > CONFIG.DEVTOOLS_SIZE_THRESHOLD
    ) {
      logEvent("devtools_detected");
      // Uncomment if immediate alert is desired:
      // alert("Developer tools detected!");
    }
  }, 1000);
}
function initAutoSubmitOnRefresh() {
  // Persist the latest view so refresh returns to the same screen.
  window.addEventListener("beforeunload", () => {
    persistAppState();

    if (state.quizStarted && !state.submissionPersisted) {
      try {
        localStorage.setItem(getDraftStorageKey(), JSON.stringify(getSerializableState()));
      } catch (_) {}
    }
  });
}

function checkAutoSubmit() {
  const snapshot = loadPersistedAppState();
  if (!snapshot) return false;

  const savedScreen = normalizeScreenKey(snapshot.currentScreen);
  const isActiveQuizSession = savedScreen === "quiz"
    && Boolean(snapshot.quizStarted)
    && !Boolean(snapshot.submitted)
    && Boolean(snapshot.student && snapshot.student.usn);

  // Only restore on active quiz attempts. All other screens should refresh normally.
  if (!isActiveQuizSession) {
    localStorage.removeItem(CONFIG.APP_STATE_KEY);
    return false;
  }

  const restored = applySerializedState(snapshot);
  if (!restored) {
    localStorage.removeItem(CONFIG.APP_STATE_KEY);
    return false;
  }

  fillRegistrationDraft(state.registrationDraft);
  restorePersistedScreen();
  return true;
}

/* ─────────────────────────────────────────────────────────────────
   13. QUIZ ENGINE
───────────────────────────────────────────────────────────────────*/

/** Prepare and shuffle the question list */
function setupQuestions() {
  let pool = [...QUESTION_BANK];
  if (CONFIG.SHUFFLE_QUESTIONS) pool = shuffle(pool);
  if (CONFIG.MAX_QUESTIONS && CONFIG.MAX_QUESTIONS < pool.length) {
    pool = pool.slice(0, CONFIG.MAX_QUESTIONS);
  }
  // Shuffle options within each question
  if (CONFIG.SHUFFLE_OPTIONS) {
    pool = pool.map(q => ({ ...q, options: shuffle(q.options) }));
  }
  state.questions = pool;
}

/** Render the current question */
function renderQuestion(preserveTimer = false) {
  const q   = state.questions[state.currentIndex];
  const idx = state.currentIndex;
  const total = state.questions.length;

  // Update header
  DOM.quizProgressLabel.textContent = `Question ${idx + 1} of ${total}`;
  DOM.questionNumber.textContent    = `Q${idx + 1}`;
  DOM.questionText.textContent      = q.q;

  // Update progress bar
  const pct = ((idx) / total) * 100;
  DOM.progressBarFill.style.width = pct + "%";

  // Render options
  DOM.optionsList.innerHTML = "";
  q.options.forEach((opt) => {
    const btn = document.createElement("button");
    btn.className = "option-btn";
    btn.setAttribute("role", "radio");
    btn.setAttribute("aria-checked", state.answers[idx] === opt ? "true" : "false");
    btn.textContent = opt;
    if (state.answers[idx] === opt) btn.classList.add("selected");

    btn.addEventListener("click", () => selectOption(idx, opt));
    DOM.optionsList.appendChild(btn);
  });

  // Nav buttons
  DOM.btnPrev.disabled = idx === 0;
  DOM.btnNext.textContent = idx === total - 1 ? "Review →" : "Next →";

  // Nav dots
  renderNavDots(idx, total);

  // Trigger animation
  DOM.questionCard.classList.remove("slide-in");
  void DOM.questionCard.offsetWidth; // reflow
  DOM.questionCard.classList.add("slide-in");

  // Reset timer for this question
  if (CONFIG.SECONDS_PER_QUESTION > 0) {
    startQuestionTimer(preserveTimer ? state.timeLeft : CONFIG.SECONDS_PER_QUESTION);
  }
}

/** Record selected option */
let lastSaveTime = 0;
const SAVE_THROTTLE = CONFIG.DRAFT_SAVE_THROTTLE_MS;

function saveStateToLocalStorage(force = false) {
  persistAppState();
  if (!state.quizStarted || state.submitted || !state.student.usn) return;

  const now = Date.now();
  if (!force && now - lastSaveTime < SAVE_THROTTLE) return;

  try {
    localStorage.setItem(getDraftStorageKey(), JSON.stringify(getSerializableState()));
    lastSaveTime = now;
  } catch (e) {
    console.error("Failed to save state to localStorage", e);
  }
}

function restoreStateFromLocalStorage() {
  try {
    const savedState = localStorage.getItem(getDraftStorageKey());
    if (savedState) {
      const restoredState = JSON.parse(savedState);
      if (restoredState.student && restoredState.student.usn === state.student.usn) {
        applySerializedState(restoredState);
        console.log("Restored state from localStorage");
        return true;
      }
    }
  } catch (e) {
    console.error("Failed to restore state from localStorage", e);
  }
  return false;
}

function clearStateFromLocalStorage(usn = state.student.usn) {
  try {
    localStorage.removeItem(getDraftStorageKey(usn));
  } catch (_) {}
}

function clearRefreshRecoveryStorage(usn = state.student.usn) {
  clearStateFromLocalStorage(usn);
  try {
    localStorage.removeItem(CONFIG.APP_STATE_KEY);
  } catch (_) {}
  try {
    sessionStorage.removeItem(CONFIG.SESSION_KEY);
  } catch (_) {}
}

function markSubmissionAsStored(timestamp = state.lastSubmissionTimestamp) {
  state.submissionPersisted = true;

  try {
    const submitted = JSON.parse(localStorage.getItem(CONFIG.SUBMITTED_KEY) || "{}");
    submitted[state.student.usn] = timestamp || new Date().toISOString();
    localStorage.setItem(CONFIG.SUBMITTED_KEY, JSON.stringify(submitted));
  } catch (_) {}

  clearStateFromLocalStorage();
  sessionStorage.removeItem(CONFIG.SESSION_KEY);
  persistAppState();
}

function selectOption(idx, opt) {
  state.answers[idx] = opt;

  // Visually update option buttons
  DOM.optionsList.querySelectorAll(".option-btn").forEach(btn => {
    btn.classList.toggle("selected", btn.textContent === opt);
    btn.setAttribute("aria-checked", btn.textContent === opt ? "true" : "false");
  });

  // Update dot
  const dots = DOM.navDots.querySelectorAll(".nav-dot");
  if (dots[idx]) dots[idx].classList.add("answered");

  saveStateToLocalStorage(true);
}

/** Render navigation dots */
function renderNavDots(current, total) {
  DOM.navDots.innerHTML = "";
  for (let i = 0; i < total; i++) {
    const dot = document.createElement("span");
    dot.className = "nav-dot";
    if (state.answers[i] !== undefined) dot.classList.add("answered");
    if (i === current) dot.classList.add("current");
    dot.title = `Question ${i + 1}`;
    dot.addEventListener("click", () => goToQuestion(i));
    DOM.navDots.appendChild(dot);
  }
}

/** Navigate to question by index */
function goToQuestion(index) {
  if (index < 0 || index >= state.questions.length) return;
  state.currentIndex = index;
  saveStateToLocalStorage(true);
  renderQuestion();
}



/* ─────────────────────────────────────────────────────────────────
   14. TIMER ENGINE
───────────────────────────────────────────────────────────────────*/
function startQuestionTimer(nextTimeLeft = CONFIG.SECONDS_PER_QUESTION) {
  clearInterval(state.timerInterval);
  state.timeLeft = Math.max(0, nextTimeLeft);
  DOM.quizTimer.textContent = state.timeLeft;
  DOM.quizTimer.classList.remove("urgent");
  if (state.timeLeft <= 10) DOM.quizTimer.classList.add("urgent");
  DOM.timerBarFill.style.width = "100%";
  DOM.timerBarFill.style.transition = "none";

  void DOM.timerBarFill.offsetWidth; // reflow

  const totalSeconds = Math.max(CONFIG.SECONDS_PER_QUESTION, 1);
  const remainingRatio = Math.max(0, Math.min(1, state.timeLeft / totalSeconds));
  DOM.timerBarFill.style.width = `${remainingRatio * 100}%`;
  void DOM.timerBarFill.offsetWidth;
  DOM.timerBarFill.style.transition = `width ${Math.max(state.timeLeft, 0)}s linear`;
  DOM.timerBarFill.style.width = "0%";

  state.timerInterval = setInterval(() => {
    state.timeLeft--;
    DOM.quizTimer.textContent = state.timeLeft;
    saveStateToLocalStorage();

    if (state.timeLeft <= 10) DOM.quizTimer.classList.add("urgent");

    if (state.timeLeft <= 0) {
      clearInterval(state.timerInterval);
      logEvent("question_timed_out", `Q${state.currentIndex + 1}`);
      // Auto advance
      if (state.currentIndex < state.questions.length - 1) {
        goToQuestion(state.currentIndex + 1);
      } else {
        // Last question timed out — auto submit
        confirmSubmit(true);
      }
    }
  }, 1000);
}

/* ─────────────────────────────────────────────────────────────────
   15. NAVIGATION & UI
───────────────────────────────────────────────────────────────────*/
function setupNavigation() {
  DOM.btnNext.addEventListener("click", () => {
    if (state.currentIndex < state.questions.length - 1) {
      goToQuestion(state.currentIndex + 1);
    } else {
      // On last question, Next becomes "Review" — open submit dialog
      openSubmitDialog();
    }
  });

  DOM.btnPrev.addEventListener("click", () => {
    if (state.currentIndex > 0) goToQuestion(state.currentIndex - 1);
  });

  DOM.btnSubmitQuiz.addEventListener("click", openSubmitDialog);

  DOM.btnCancelSubmit.addEventListener("click", () => hideOverlay(DOM.overlaySubmit));

  DOM.btnConfirmSubmit.addEventListener("click", () => {
    hideOverlay(DOM.overlaySubmit);
    confirmSubmit();
  });
}

function openSubmitDialog() {
  const total    = state.questions.length;
  const answered = Object.keys(state.answers).length;
  const skipped  = total - answered;

  if (skipped > 0) {
    DOM.submitUnansweredMsg.textContent =
      `You have ${skipped} unanswered question(s). Are you sure you want to submit?`;
  } else {
    DOM.submitUnansweredMsg.textContent =
      "All questions answered. Are you sure you want to submit? You cannot change answers after submission.";
  }
  showOverlay(DOM.overlaySubmit);
}

function confirmSubmit(isAuto = false) {
  if (state.submitted) return;

  // Once submit is confirmed, clear all refresh-recovery storage so
  // reloading cannot restore stale in-progress quiz data.
  clearRefreshRecoveryStorage();

  state.submitted = true;
  clearInterval(state.timerInterval);
  submitQuizData(isAuto);
}

/* ─────────────────────────────────────────────────────────────────
   16. SUBMISSION & GOOGLE SHEETS INTEGRATION
   Sends all quiz data + proctoring logs to Google Apps Script.
   Shows result screen after submission.
───────────────────────────────────────────────────────────────────*/
async function submitQuizData(isAutoSubmit = false, { reviewToken: existingReviewToken = null } = {}) {
  const total    = state.questions.length;
  const device   = state.deviceType || getDeviceType();
  const timestamp = new Date().toISOString();
  const reviewToken = existingReviewToken || createReviewToken();
  const localReview = buildLocalReviewPayload();
  state.lastSubmissionTimestamp = timestamp;
  state.lastReviewToken = reviewToken;
  persistAppState();

  // Build answers array for readability in Sheets
  const answersArray = state.questions.map((q, idx) => ({
    questionId: q.id,
    studentAnswer: state.answers[idx] || "NOT ANSWERED",
  }));

  const payload = {
    name:             state.student.name,
    studentId:        state.student.usn,
    email:            state.student.email,
    answers:          JSON.stringify(answersArray),
    tabSwitch:        state.tabSwitchCount,
    fullscreenExit:   state.fullscreenExitCount,
    screenshot:       state.screenshotAttempts,
    camera:           state.cameraAccess,
    mic:              state.micAccess,
    device:           device,
    timestamp:        timestamp,
    autoSubmit:       isAutoSubmit,
    reviewToken:      reviewToken,
    suspiciousLog:    JSON.stringify(state.suspiciousEvents),
  };

  console.log("[SecureQuiz] Submitting quiz payload", {
    url: CONFIG.APPS_SCRIPT_URL,
    studentId: payload.studentId,
    questionCount: answersArray.length,
    reviewToken,
    autoSubmit: isAutoSubmit,
  });

  // Display result screen immediately (don't block on network)
  showResultScreen(total, device);

  // Primary persistence path for SaaS mode: write attempt to Supabase.
  // Apps Script remains as compatibility fallback for legacy deployments.
  try {
    const savedToSupabase = await persistSubmissionToSupabase({
      timestamp,
      isAutoSubmit,
      device,
      reviewToken,
      localReview,
    });

    if (savedToSupabase) {
      state.submissionPersisted = true;
      applySubmissionResult({
        status: "success",
        scoreCorrect: localReview.scoreCorrect,
        scoreTotal: localReview.scoreTotal,
        reviewAnswers: localReview.reviewAnswers,
        timestamp,
      }, total, device);
      DOM.resultNote.textContent = "Submission stored in SecureQuiz cloud. You can now review answers.";
    }
  } catch (supabaseError) {
    console.warn("[SecureQuiz] Supabase submission write failed, falling back to Apps Script flow.", supabaseError);
    if (DOM.resultNote) {
      DOM.resultNote.textContent = `Supabase write failed: ${supabaseError.message}. Trying backup flow...`;
    }
  }

  // Legacy Apps Script fallback path.
  // Only run when Supabase persistence did not complete successfully.
  if (state.submissionPersisted) {
    console.log("[SecureQuiz] Supabase submission confirmed. Skipping legacy Apps Script fallback.");
    return;
  }

  // Primary path: JSON POST to the Apps Script Web App.
  // If the browser or Apps Script blocks the readable response, we fall back
  // to form POST, GET submit, and finally fire-and-forget delivery.
  try {
    let responseData = null;

    try {
      const response = await fetchWithTimeout(
        CONFIG.APPS_SCRIPT_URL,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json",
          },
          body: JSON.stringify(payload),
        },
        CONFIG.SUBMISSION_REQUEST_TIMEOUT_MS
      );

      if (!response.ok) {
        throw new Error(`HTTP error ${response.status}`);
      }

      responseData = await readJsonResponse(response, "submitQuiz");
    } catch (readError) {
      console.warn("[SecureQuiz] Readable submission response unavailable, switching to async lookup.", readError);

      try {
        responseData = await submitQuizViaFormPost(payload);
      } catch (formSubmitError) {
        console.warn("[SecureQuiz] Form POST fallback failed, trying GET submission.", formSubmitError);

        try {
          responseData = await submitQuizViaGet(payload);
        } catch (getSubmitError) {
          console.warn("[SecureQuiz] GET submission fallback failed, trying fire-and-forget mode.", getSubmitError);

          try {
            await fetchWithTimeout(
              CONFIG.APPS_SCRIPT_URL,
              {
                method: "POST",
                mode: "no-cors",
                headers: { "Content-Type": "text/plain" },
                body: JSON.stringify(payload),
              },
              CONFIG.SUBMISSION_REQUEST_TIMEOUT_MS
            );
          } catch (fireAndForgetError) {
            console.warn("[SecureQuiz] Fire-and-forget submission request could not be confirmed.", fireAndForgetError);
          }
        }
      }
    }

    if (responseData || !state.submissionPersisted) {
      await resolveSubmissionState(responseData, total, device, reviewToken);
    }

    console.log("[SecureQuiz] Submission flow completed.");
  } catch (err) {
    console.error("[SecureQuiz] Submission error:", err);
    logEvent("submission_error", err.message);
    applySubmissionFallbackState(
      "The quiz could not reach a working Google Sheets submission endpoint.",
      {
        title: "Submission Failed",
        note: "No confirmed submission row was created in Google Sheets.",
        status: "Backend request failed",
        caption: "Verify the Apps Script Web App URL, deployment access, and latest backend code.",
      }
    );
  }
}

/** Render the result screen with score ring animation */
function showResultScreen(total, device) {
  clearInterval(state.timerInterval);
  state.submitted = true;
  state.submissionReview = null;
  state.submissionPersisted = false;

  // Safeguard: once result view is shown, aggressively clear all
  // refresh-recovery storage for this attempt.
  clearRefreshRecoveryStorage();

  showScreen(DOM.screenResult);

  // showScreen persists APP_STATE; remove it again so result refresh is always clean.
  try {
    localStorage.removeItem(CONFIG.APP_STATE_KEY);
  } catch (_) {}

  setResultFetchingState(true);
  setRetryButtonState(false, "Retry Submission", true);

  // Score icon & message
  DOM.resultIcon.textContent = "⏳";
  DOM.resultTitle.textContent = "Submitting Quiz...";
  DOM.resultSubtitle.textContent = "Please wait while your responses are recorded and graded.";
  DOM.resultScoreNum.textContent  = "--";
  DOM.resultScoreTotal.textContent = `/${total}`;
  animateScoreRing(0, total);
  if (DOM.resultNote) {
    DOM.resultNote.textContent = "Review answers will unlock once grading is complete.";
  }
  setReviewButtonState(false, "Grading...");
  renderReportCard({
    scoreCorrect: null,
    scoreTotal: total,
    timestamp: state.lastSubmissionTimestamp,
    status: "Secure Quiz",
    caption: "Your marks card is being prepared.",
    accuracy: "This report will update automatically as soon as grading completes.",
    isReady: false,
  });

  // Proctoring summary
  DOM.rTabs.textContent   = state.tabSwitchCount;
  DOM.rFS.textContent     = state.fullscreenExitCount;
  DOM.rSS.textContent     = state.screenshotAttempts;
  DOM.rDevice.textContent = device;
  if (DOM.btnExitFullscreen) {
    DOM.btnExitFullscreen.style.display = isFullscreenActive() ? "" : "none";
  }
  persistAppState();
}

function renderReviewScreen() {
  if (!DOM.reviewContainer) return;

  DOM.reviewContainer.innerHTML = "";

  const submissionReview = state.submissionReview;
  const reviewAnswers = submissionReview && Array.isArray(submissionReview.reviewAnswers)
    ? submissionReview.reviewAnswers
    : [];

  if (!reviewAnswers.length) {
    if (DOM.reviewSummary) {
      DOM.reviewSummary.textContent = "Review data is unavailable for this submission.";
    }

    const emptyState = document.createElement("div");
    emptyState.className = "review-empty";
    emptyState.textContent = "The backend did not return graded answer details, so this review is unavailable.";
    DOM.reviewContainer.appendChild(emptyState);
    return;
  }

  if (DOM.reviewSummary) {
    DOM.reviewSummary.textContent = `Score ${submissionReview.scoreCorrect}/${submissionReview.scoreTotal}. Green marks the correct answer, and red marks an incorrect selection.`;
  }

  const reviewByQuestionId = new Map(reviewAnswers.map((item) => [item.questionId, item]));

  state.questions.forEach((question, idx) => {
    const reviewEntry = reviewByQuestionId.get(question.id) || {};
    const studentAnswer = reviewEntry.studentAnswer || state.answers[idx] || "NOT ANSWERED";
    const correctAnswer = reviewEntry.correctAnswer || question.answer || "";
    const skipped = studentAnswer === "NOT ANSWERED";
    const isCorrect = !skipped && studentAnswer === correctAnswer;

    const item = document.createElement("article");
    item.className = "review-item";

    const header = document.createElement("div");
    header.className = "review-item-header";

    const meta = document.createElement("div");
    meta.className = "review-q-meta";

    const number = document.createElement("div");
    number.className = "review-q-num";
    number.textContent = `Question ${idx + 1}`;

    const questionText = document.createElement("div");
    questionText.className = "review-q-text";
    questionText.textContent = question.q;

    meta.appendChild(number);
    meta.appendChild(questionText);

    const status = document.createElement("div");
    status.className = `review-status ${skipped ? "skipped" : isCorrect ? "correct" : "wrong"}`;
    status.textContent = skipped ? "Skipped" : isCorrect ? "Correct" : "Incorrect";

    header.appendChild(meta);
    header.appendChild(status);
    item.appendChild(header);

    const options = document.createElement("div");
    options.className = "review-options";

    question.options.forEach((opt) => {
      const isSelected = opt === studentAnswer;
      const isCorrectOption = opt === correctAnswer;
      const isWrongSelection = isSelected && !isCorrectOption;

      const option = document.createElement("div");
      option.className = [
        "review-option",
        isSelected ? "is-selected" : "",
        isCorrectOption ? "is-correct" : "",
        isWrongSelection ? "is-wrong" : "",
      ].filter(Boolean).join(" ");

      const optionText = document.createElement("div");
      optionText.className = "review-option-text";
      optionText.textContent = opt;

      const flags = document.createElement("div");
      flags.className = "review-option-flags";

      if (isSelected) {
        const selectedFlag = document.createElement("span");
        selectedFlag.className = `review-flag ${isWrongSelection ? "wrong" : "selected"}`;
        selectedFlag.textContent = isWrongSelection ? "Your Answer" : "Selected";
        flags.appendChild(selectedFlag);
      }

      if (isCorrectOption) {
        const correctFlag = document.createElement("span");
        correctFlag.className = "review-flag correct";
        correctFlag.textContent = "Correct";
        flags.appendChild(correctFlag);
      }

      option.appendChild(optionText);
      option.appendChild(flags);
      options.appendChild(option);
    });

    item.appendChild(options);

    if (skipped) {
      const note = document.createElement("div");
      note.className = "review-note";
      note.textContent = "You did not select an answer for this question.";
      item.appendChild(note);
    }

    DOM.reviewContainer.appendChild(item);
  });
}

/* ─────────────────────────────────────────────────────────────────
   DUPLICATE ATTEMPT CHECK
   Checks localStorage to see if this Student ID has already
   submitted the quiz within the last hour.
───────────────────────────────────────────────────────────────────*/
function hasAlreadySubmitted(usn) {
  try {
    const submitted = JSON.parse(localStorage.getItem(CONFIG.SUBMITTED_KEY) || "{}");

    // If no record exists for this USN, they haven't submitted
    if (!submitted[usn]) return false;

    // Check if 1 hour (3,600,000 milliseconds) has passed
    const lastSubmitTime = new Date(submitted[usn]).getTime();
    const currentTime = new Date().getTime();
    if (currentTime - lastSubmitTime >= CONFIG.RETAKE_COOLDOWN_MS) {
      return false; // 1 hour has passed, allow re-attempt
    }

    return true; // Less than 1 hour has passed, block attempt
  } catch (_) {
    return false;
  }
}

/* ─────────────────────────────────────────────────────────────────
   17. INITIALIZATION
───────────────────────────────────────────────────────────────────*/
function init() {
  initThemeSync();
  state.deviceType = getDeviceType();
  applyAmbientEffectsMode(true);

  let resizeTicking = false;
  window.addEventListener("resize", () => {
    if (!resizeTicking) {
      window.requestAnimationFrame(() => {
        const nextDeviceType = getDeviceType();
        const deviceTypeChanged = nextDeviceType !== state.deviceType;
        state.deviceType = nextDeviceType;

        if (deviceTypeChanged && !shouldEnforceFullscreen()) {
          document.body.classList.remove("last-strike");
          hideOverlay(DOM.overlayFullscreen);
        }

        applyAmbientEffectsMode();
        resizeTicking = false;
      });
      resizeTicking = true;
    }
  }, { passive: true });

  // Initialize all anti-cheat listeners
  initTabSwitchDetection();
  initFullscreenEnforcement();
  initCopyPasteDisable();
  initScreenshotDetection();
  initWindowBlurDetection();
  initAutoSubmitOnRefresh();

  // Setup navigation buttons
  setupNavigation();

  // Exit Fullscreen Button
  if (DOM.btnExitFullscreen) {
    DOM.btnExitFullscreen.addEventListener("click", () => {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      } else if (document.webkitExitFullscreen) { /* Safari */
        document.webkitExitFullscreen();
      } else if (document.msExitFullscreen) { /* IE11 */
        document.msExitFullscreen();
      }
      DOM.btnExitFullscreen.style.display = 'none';
    });
  }

  if (DOM.btnReviewAnswers) {
    DOM.btnReviewAnswers.addEventListener("click", () => {
      if (!state.submissionReview || !state.submissionReview.reviewAnswers || !state.submissionReview.reviewAnswers.length) {
        return;
      }

      renderReviewScreen();
      showScreen(DOM.screenReview);
    });
  }

  if (DOM.btnCloseReview) {
    DOM.btnCloseReview.addEventListener("click", () => {
      showScreen(DOM.screenResult);
    });
  }

  if (DOM.btnRetrySubmission) {
    DOM.btnRetrySubmission.addEventListener("click", () => {
      const retryToken = state.lastReviewToken || createReviewToken();
      void submitQuizData(false, { reviewToken: retryToken });
    });
  }

  function debounce(func, wait) {
    let timeout;
    return function(...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func(...args), wait);
    };
  }

  const debouncedInputSave = debounce(() => {
    syncRegistrationDraftFromDom();
    persistAppState();
  }, 500);

  if (DOM.inpUSN) {
    DOM.inpUSN.addEventListener("input", debouncedInputSave);
  }

  if (DOM.inpName) {
    DOM.inpName.addEventListener("input", debouncedInputSave);
  }

  if (DOM.inpEmail) {
    DOM.inpEmail.addEventListener("input", debouncedInputSave);
  }

  if (state.accessBlocked) {
    showRegError(state.accessBlockReason || "Quiz access is restricted. Use the teacher-provided quiz link.");
    DOM.btnStart.disabled = true;
    if (DOM.btnStartText) {
      DOM.btnStartText.textContent = "Invite Link Required";
      DOM.btnStartText.classList.remove("hidden");
    }
    if (DOM.btnStartSpinner) {
      DOM.btnStartSpinner.classList.add("hidden");
    }
  }

  /* ── Registration Form Submit ── */
  DOM.btnStart.addEventListener("click", async () => {
    if (state.accessBlocked) {
      showRegError(state.accessBlockReason || "Quiz access is restricted. Use the teacher-provided quiz link.");
      return;
    }

    clearRegError();

    const enteredName = DOM.inpName ? DOM.inpName.value.trim() : "";
    const usn = DOM.inpUSN ? DOM.inpUSN.value.trim().toUpperCase() : "";
    const email = DOM.inpEmail ? DOM.inpEmail.value.trim().toLowerCase() : "";

    // 1. Name and USN must be provided
    if (!enteredName) return showRegError("Please enter your full name.");
    if (!usn)  return showRegError("Please enter your Student ID / USN.");

    // 2. Email is optional; validate only when field exists and value is provided.
    if (DOM.inpEmail && email) {
      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailPattern.test(email)) {
        return showRegError("Please enter a valid email address.");
      }
    }

    // Duplicate attempt check
    if (hasAlreadySubmitted(usn)) {
      return showRegError(
        "You have already submitted this quiz. Please wait 1 hour before attempting again."
      );
    }

    // Store student info using entered values (no external registry dependency).
    DOM.btnStartText.classList.add("hidden");
    DOM.btnStartSpinner.classList.remove("hidden");
    DOM.btnStart.disabled = true;

    try {
      state.student = {
        name: enteredName,
        usn,
        email: email || `${usn.toLowerCase()}@securequiz.local`,
      };
      state.registrationDraft = { usn, email };
      state.submissionReview = null;
      state.lastReviewToken = null;
      state.instructionsAccepted = false;
      state.quizStarted = false;
      state.submitted = false;
      requestMediaPermissions();
      setupQuestions();
      showScreen(DOM.screenInst);
    } catch (err) {
      console.error("[SecureQuiz] Failed to start quiz:", err);
      showRegError("Unable to start the quiz right now. Please try again.");
    } finally {
      DOM.btnStartText.classList.remove("hidden");
      DOM.btnStartSpinner.classList.add("hidden");
      DOM.btnStart.disabled = false;
    }

    // Camera + mic disabled — values set to 0
  });

  // Instructions screen logic
  if (DOM.chkAgree && DOM.btnProceed) {
    DOM.chkAgree.checked = state.instructionsAccepted;
    DOM.btnProceed.disabled = !state.instructionsAccepted;
    DOM.btnProceed.classList.toggle("locked", !state.instructionsAccepted);
    DOM.chkAgree.addEventListener("change", (e) => {
      state.instructionsAccepted = e.target.checked;
      DOM.btnProceed.disabled = !e.target.checked;
      if (e.target.checked) DOM.btnProceed.classList.remove("locked");
      else DOM.btnProceed.classList.add("locked");
      persistAppState();
    });

    DOM.btnProceed.addEventListener("click", () => {
      // Mark quiz as started
      state.instructionsAccepted = true;
      state.quizStarted = true;
      state.startTime = state.startTime || new Date();

      // Restore state from local storage if it exists
      const restored = restoreStateFromLocalStorage();

      // Transition to quiz screen
      showScreen(DOM.screenQuiz);
      DOM.quizStudentName.textContent = state.student.name;

      // Enter fullscreen
      requestFullscreen();

      // Render first question
      renderQuestion(restored);
      updateProctoringBar();
      saveStateToLocalStorage(true);
    });
  }

  const restoredState = checkAutoSubmit();
  if (!restoredState) {
    fillRegistrationDraft(state.registrationDraft);
    showScreen(getScreenElementByKey(state.currentScreen));
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  await loadQuestions();
  init();
});
