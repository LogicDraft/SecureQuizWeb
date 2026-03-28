/**
 * google-apps-script.js (Code.gs)
 * SecureQuiz Google Apps Script backend
 *
 * Setup:
 * 1. Create or open the target Google Sheet referenced by SHEET_ID.
 * 2. Populate the "Students" sheet with headers: USN | Name
 * 3. Populate the "AnswerKey" sheet with headers: Question ID | Correct Answer
 * 4. Deploy this script as a Web App:
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 5. Paste the Web App URL into script.js -> CONFIG.APPS_SCRIPT_URL
 */

const SHEET_ID = "1rkpbMg9zZhf_vQRMGjW7H8-1k5tiZa0W15xuNODn-9A";

const SHEETS = {
  RESPONSES: "QuizResponses",
  STUDENTS: "Students",
  ANSWER_KEY: "AnswerKey",
};

const RESPONSE_HEADERS = [
  "Timestamp",
  "Name",
  "USN",
  "Email",
  "Answers",
  "Score",
  "QuestionCount",
  "TabSwitch",
  "FullscreenExit",
  "Screenshot",
  "Device",
  "AutoSubmit",
  "ReviewToken",
  "SuspiciousLog",
];

const STUDENT_HEADERS = ["USN", "Name"];
const ANSWER_KEY_HEADERS = ["Question ID", "Correct Answer"];
const RETAKE_COOLDOWN_MS = 60 * 60 * 1000;

function doGet(e) {
  const action = (e && e.parameter && e.parameter.action) || "";

  if (action === "validateStudent") {
    const usn = normalizeUsn(e.parameter.usn);
    if (!usn) {
      return jsonResponse({
        status: "error",
        valid: false,
        message: "Missing USN.",
      });
    }

    const student = findStudentByUsn(usn);
    return jsonResponse({
      status: "ok",
      valid: !!student,
      student: student,
      message: student ? "Student validated." : "USN is not registered for this quiz.",
    });
  }

  if (action === "getRegistry") {
    return jsonResponse({
      status: "error",
      message: "Registry export is disabled. Use action=validateStudent.",
    });
  }

  if (action === "getLatestSubmission") {
    const usn = normalizeUsn(e.parameter.usn);
    const reviewToken = String((e.parameter.reviewToken || "")).trim();

    if (!usn || !reviewToken) {
      return jsonResponse({
        status: "error",
        message: "Missing USN or reviewToken.",
      });
    }

    const responsesSheet = getOrCreateSheet(SHEETS.RESPONSES, RESPONSE_HEADERS);
    const submission = findSubmissionByReviewToken(responsesSheet, usn, reviewToken);

    if (!submission) {
      return jsonResponse({
        status: "not_found",
        message: "No submission was found for this review token.",
      });
    }

    return jsonResponse(submission);
  }

  if (action === "submitQuiz") {
    return handleSubmission(e.parameter || {});
  }

  return jsonResponse({
    status: "ok",
    message: "SecureQuiz API is live.",
  });
}

function doPost(e) {
  Logger.log("[SecureQuiz] doPost received. Content length: %s", (e && e.postData && e.postData.length) || 0);
  return handleSubmission(parsePayload(e));
}

function handleSubmission(payload) {
  const lock = LockService.getScriptLock();

  try {
    lock.waitLock(30000);
    Logger.log("[SecureQuiz] Submission payload keys: %s", Object.keys(payload || {}).join(", "));

    const usn = normalizeUsn(payload.studentId);

    if (!usn) {
      Logger.log("[SecureQuiz] Missing studentId in payload: %s", JSON.stringify(payload || {}));
      return jsonResponse({
        status: "error",
        message: "Missing studentId in request payload.",
      });
    }

    const student = findStudentByUsn(usn);
    if (!student) {
      Logger.log("[SecureQuiz] Invalid student for submission: %s", usn);
      return jsonResponse({
        status: "invalid_student",
        message: "Student is not registered for this quiz.",
      });
    }

    const responsesSheet = getOrCreateSheet(SHEETS.RESPONSES, RESPONSE_HEADERS);
    if (hasRecentSubmission(responsesSheet, usn)) {
      Logger.log("[SecureQuiz] Duplicate submission blocked for %s", usn);
      return jsonResponse({
        status: "duplicate",
        message: "You must wait 1 hour before retaking the quiz.",
      });
    }

    const answerKey = getAnswerKeyMap();
    const submittedAnswers = parseAnswers(payload.answers);
    const scoredAnswers = scoreAnswers(submittedAnswers, answerKey);
    const timestamp = payload.timestamp || new Date().toISOString();
    const autoSubmit = String(payload.autoSubmit) === "true" || payload.autoSubmit === true;

    responsesSheet.appendRow([
      timestamp,
      payload.name || student.name || "",
      usn,
      payload.email || "",
      JSON.stringify(scoredAnswers.answers),
      `${scoredAnswers.correct}/${scoredAnswers.total}`,
      scoredAnswers.total,
      numberOrZero(payload.tabSwitch),
      numberOrZero(payload.fullscreenExit),
      numberOrZero(payload.screenshot),
      payload.device || "unknown",
      autoSubmit,
      payload.reviewToken || "",
      payload.suspiciousLog || "[]",
    ]);
    const storedRow = responsesSheet.getLastRow();
    Logger.log(
      "[SecureQuiz] Stored submission for %s at row %s with token %s",
      usn,
      storedRow,
      payload.reviewToken || ""
    );

    highlightSubmissionRow(responsesSheet, scoredAnswers, autoSubmit);
    formatResponseSheet(responsesSheet);

    return jsonResponse({
      status: "success",
      message: "Quiz submitted successfully.",
      storedRow: storedRow,
      score: `${scoredAnswers.correct}/${scoredAnswers.total}`,
      scoreCorrect: scoredAnswers.correct,
      scoreTotal: scoredAnswers.total,
      reviewAnswers: scoredAnswers.answers,
    });
  } catch (err) {
    Logger.log("[SecureQuiz] Submission error: %s", err && err.stack ? err.stack : String(err));
    return jsonResponse({
      status: "error",
      message: err && err.message ? err.message : String(err),
    });
  } finally {
    try {
      lock.releaseLock();
    } catch (_) {}
  }
}

function parsePayload(e) {
  if (e && e.parameter && Object.keys(e.parameter).length) {
    Logger.log("[SecureQuiz] Parsing payload from request parameters.");
    return e.parameter;
  }

  const rawBody = String((e && e.postData && e.postData.contents) || "").trim();
  if (!rawBody) return {};

  try {
    Logger.log("[SecureQuiz] Parsing payload as JSON.");
    return JSON.parse(rawBody);
  } catch (_) {
    Logger.log("[SecureQuiz] JSON parse failed. Falling back to form-encoded parser.");
    return parseFormEncodedPayload(rawBody);
  }
}

function parseFormEncodedPayload(rawBody) {
  const payload = {};
  if (!rawBody) return payload;

  const pairs = String(rawBody).split("&");

  for (var i = 0; i < pairs.length; i++) {
    const pair = pairs[i];
    if (!pair) continue;

    const separatorIndex = pair.indexOf("=");
    const rawKey = separatorIndex >= 0 ? pair.slice(0, separatorIndex) : pair;
    const rawValue = separatorIndex >= 0 ? pair.slice(separatorIndex + 1) : "";
    const key = decodeFormValue(rawKey);

    if (!key) continue;
    payload[key] = decodeFormValue(rawValue);
  }

  return payload;
}

function decodeFormValue(value) {
  return decodeURIComponent(String(value || "").replace(/\+/g, " "));
}

function parseAnswers(rawAnswers) {
  const parsed = rawAnswers ? JSON.parse(rawAnswers) : [];
  return Array.isArray(parsed) ? parsed : [];
}

function scoreAnswers(submittedAnswers, answerKey) {
  let correct = 0;
  let total = 0;

  const answers = submittedAnswers.map(function(answer) {
    const questionId = String(answer.questionId || "").trim();
    const expectedAnswer = answerKey[questionId];
    const hasKey = Object.prototype.hasOwnProperty.call(answerKey, questionId);
    const studentAnswer = answer.studentAnswer || "NOT ANSWERED";
    const isCorrect = hasKey && String(studentAnswer).trim() === expectedAnswer;

    if (hasKey) {
      total += 1;
      if (isCorrect) correct += 1;
    }

    return {
      questionId: questionId,
      question: answer.question || "",
      studentAnswer: studentAnswer,
      correctAnswer: hasKey ? expectedAnswer : "NOT CONFIGURED",
      isCorrect: isCorrect,
    };
  });

  return {
    correct: correct,
    total: total || submittedAnswers.length,
    answers: answers,
  };
}

function findStudentByUsn(usn) {
  const studentsSheet = getOrCreateSheet(SHEETS.STUDENTS, STUDENT_HEADERS);
  const rows = getDataRows(studentsSheet);

  for (var i = 0; i < rows.length; i++) {
    const rowUsn = normalizeUsn(rows[i][0]);
    if (rowUsn === usn) {
      return {
        usn: rowUsn,
        name: String(rows[i][1] || "").trim(),
      };
    }
  }

  return null;
}

function getAnswerKeyMap() {
  const answerKeySheet = getOrCreateSheet(SHEETS.ANSWER_KEY, ANSWER_KEY_HEADERS);
  const rows = getDataRows(answerKeySheet);
  const answerKey = {};

  for (var i = 0; i < rows.length; i++) {
    const questionId = String(rows[i][0] || "").trim();
    const correctAnswer = String(rows[i][1] || "").trim();

    if (questionId && correctAnswer) {
      answerKey[questionId] = correctAnswer;
    }
  }

  return answerKey;
}

function hasRecentSubmission(sheet, usn) {
  const rows = getDataRows(sheet);
  const now = Date.now();

  for (var i = rows.length - 1; i >= 0; i--) {
    const rowUsn = normalizeUsn(rows[i][2]);
    if (rowUsn !== usn) continue;

    const submittedAt = new Date(rows[i][0]).getTime();
    if (!submittedAt) continue;

    return now - submittedAt < RETAKE_COOLDOWN_MS;
  }

  return false;
}

function findSubmissionByReviewToken(sheet, usn, reviewToken) {
  const rows = getDataRows(sheet);

  for (var i = rows.length - 1; i >= 0; i--) {
    const rowUsn = normalizeUsn(rows[i][2]);
    const rowToken = String(rows[i][12] || "").trim();

    if (rowUsn !== usn || rowToken !== reviewToken) continue;

    const scoreText = String(rows[i][5] || "0/0");
    const scoreParts = scoreText.split("/");
    const scoreCorrect = Number(scoreParts[0]) || 0;
    const scoreTotal = Number(scoreParts[1]) || Number(rows[i][6]) || 0;

    return {
      status: "success",
      message: "Latest submission loaded.",
      timestamp: rows[i][0] || "",
      score: scoreText,
      scoreCorrect: scoreCorrect,
      scoreTotal: scoreTotal,
      reviewAnswers: safeJsonParse(rows[i][4], []),
    };
  }

  return null;
}

function highlightSubmissionRow(sheet, scoredAnswers, autoSubmit) {
  const lastRow = sheet.getLastRow();
  const nameCell = sheet.getRange(lastRow, 2);

  if (autoSubmit) {
    nameCell
      .setBackground("#5a1020")
      .setFontColor("#fff1f2")
      .setFontWeight("bold");
    return;
  }

  if (scoredAnswers.total > 0 && scoredAnswers.correct === scoredAnswers.total) {
    nameCell
      .setBackground("#0d3b2a")
      .setFontColor("#dcfce7")
      .setFontWeight("bold");
  }
}

function getOrCreateSheet(sheetName, headers) {
  const spreadsheet = SpreadsheetApp.openById(SHEET_ID);
  let sheet = spreadsheet.getSheetByName(sheetName);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(sheetName);
  }

  ensureHeaders(sheet, headers);
  return sheet;
}

function ensureHeaders(sheet, headers) {
  const headerRange = sheet.getRange(1, 1, 1, headers.length);
  const existing = sheet.getLastRow() > 0
    ? headerRange.getValues()[0]
    : [];

  let needsUpdate = sheet.getLastRow() === 0;
  if (!needsUpdate) {
    for (var i = 0; i < headers.length; i++) {
      if (String(existing[i] || "").trim() !== headers[i]) {
        needsUpdate = true;
        break;
      }
    }
  }

  if (!needsUpdate) return;

  headerRange.setValues([headers]);
  headerRange
    .setBackground("#122034")
    .setFontColor("#ffffff")
    .setFontWeight("bold");
  sheet.setFrozenRows(1);
}

function formatResponseSheet(sheet) {
  if (sheet.getLastRow() < 1) return;

  sheet.autoResizeColumns(1, RESPONSE_HEADERS.length);
  sheet.setColumnWidth(1, 180);
  sheet.setColumnWidth(2, 220);
  sheet.setColumnWidth(3, 140);
  sheet.setColumnWidth(4, 220);
  sheet.setColumnWidth(5, 420);
  sheet.setColumnWidth(13, 220);
  sheet.setColumnWidth(14, 320);
}

function getDataRows(sheet) {
  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();
  if (lastRow <= 1 || lastColumn === 0) return [];

  return sheet.getRange(2, 1, lastRow - 1, lastColumn).getValues();
}

function normalizeUsn(value) {
  return String(value || "").trim().toUpperCase();
}

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function safeJsonParse(value, fallbackValue) {
  try {
    return JSON.parse(value);
  } catch (_) {
    return fallbackValue;
  }
}

function jsonResponse(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
