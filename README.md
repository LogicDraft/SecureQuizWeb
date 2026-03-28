# SecureQuiz — Deployment Guide

A Google Forms-style quiz platform with advanced anti-cheating features.  
Frontend: HTML + CSS + Vanilla JS | Backend: Google Apps Script + Google Sheets

---

## Project Structure

```
secure-quiz/
├── index.html              ← Premium SPA (Login, Instructions, Quiz, Results)
├── style.css               ← Dark glassmorphism & advanced animations
├── script.js               ← Quiz logic, canvas physics + anti-cheat engine
├── questions.json          ← (NEW) Dedicated JSON file for quiz questions
├── google-apps-script.js   ← Paste this into Google Apps Script editor
└── README.md               ← This file
```

---

## Step 1 — Create the Google Sheet

1. Go to [Google Sheets](https://sheets.google.com) and create a **new blank spreadsheet**.
2. Name it: `SecureQuiz Responses` (or any name you prefer).
3. Create or confirm these tabs exist:
   - `QuizResponses`
   - `Students`
   - `AnswerKey`
4. Populate the `Students` sheet with `USN` and `Name`.
5. Populate the `AnswerKey` sheet with `Question ID` and `Correct Answer`.
6. Copy the **Sheet ID** from the URL:
   ```
   https://docs.google.com/spreadsheets/d/  <<<SHEET_ID>>>  /edit
   ```

---

## Step 2 — Set Up Google Apps Script Backend

1. In your Google Sheet, go to **Extensions → Apps Script**.
2. Delete all existing code in the editor.
3. Copy and paste the **entire contents** of `google-apps-script.js` into the editor.
4. Replace the `SHEET_ID` constant with your actual Sheet ID (from Step 1).
5. Click **Save** (💾 icon).

---

## Step 3 — Deploy the Apps Script as a Web App

1. Click **Deploy → New Deployment**.
2. Click the gear icon ⚙️ next to "Select type" → choose **Web app**.
3. Configure:
   | Setting | Value |
   |---|---|
   | Description | SecureQuiz Backend v1 |
   | Execute as | **Me** |
   | Who has access | **Anyone** |
4. Click **Deploy**.
5. **Authorize** the app when prompted (allow access to Sheets).
6. Copy the **Web App URL** — it looks like:
   ```
   https://script.google.com/macros/s/AKfy.../exec
   ```

> [!IMPORTANT]
> Every time you modify the Apps Script code, you must create a **New Deployment** to apply changes. Redeploying the same version will NOT update it.

---

## Step 4 — Connect Frontend to Backend

1. Open `script.js` in a text editor.
2. Find this line near the top:
   ```js
   APPS_SCRIPT_URL: "https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec",
   ```
3. Replace the URL with the Web App URL you copied in Step 3.
4. Save the file.

---

## Step 5 — Customize Your Quiz Questions

Instead of editing JavaScript directly, all questions are now managed through a dedicated `questions.json` file. 

Open **`questions.json`** and craft your questions in this format:

```json
[
  {
    "id": "q001",
    "q": "What is the capital of France?",
    "options": ["Paris", "London", "Berlin", "Madrid"]
  },
  {
    "id": "q002",
    "q": "Which neural network architecture is primarily used for image recognition?",
    "options": ["RNN", "CNN", "LSTM", "GAN"]
  }
]
```
Correct answers should be stored only in the Google Sheet `AnswerKey` tab using the same `id` values.

You can also adjust these settings in `CONFIG`:

| Setting | Description | Default |
|---|---|---|
| `SECONDS_PER_QUESTION` | Time limit per question (0 = off) | `60` |
| `MAX_QUESTIONS` | How many questions to pick from bank | `10` |
| `SHUFFLE_QUESTIONS` | Randomize question order | `true` |
| `SHUFFLE_OPTIONS` | Randomize option order | `true` |


## Anti-Cheat Features Summary (Neural Engine)

| Feature | How It Works |
|---|---|
| ⚡ **5-Violation Lockdown** | (NEW) If a student hits 5 security violations (tabs or fullscreen exits), the exam immediately triggers a forced auto-submission. |
| 👁️ **Tab Switch Detection** | Monitors OS-level visibility changes. Logs the switch and displays a severe visual warning overlay. |
| 📺 **Fullscreen Enforcement** | `requestFullscreen()` enforces standard exam view; exiting creates a hard violation block. |
| 📸 **PrintScreen Blurring** | Hitting PrintScreen instantly blurs the test question to prevent capture. |
| 🛡️ **Copy/Paste Block** | Keyboard shortcuts and right-click menus are disabled system-wide. |
| 🔀 **Option/Question Shuffle** | Uses Fisher-Yates shuffle to randomize questions so no two tests are identical. |

---

## Premium UI Mechanics
- **Dynamic Physics Canvas:** A cinematic, interactive node-mesh background tracks the user's cursor dynamically through rendering physics.
- **Glassmorphism Overlays:** Exam cards are styled with true backdrop-blur rendering, custom minimal scrollbars, and premium Google fonts (`Orbitron` & `Syne`).
- **Trailing Focus Cursor:** A physics-based trailing cursor fluidly animates to encapsulate buttons and inputs with a blue responsive halo.
- **Pre-Quiz Instructions:** An elegant, unskippable "How It Works" protocol checklist requires an explicit student agreement before launching.

---

## Google Sheets Column Reference

| Column | Data |
|---|---|
| Timestamp | ISO date-time of submission |
| Name | Student's full name |
| Student ID | USN / roll number |
| Email | Student's email |
| Answers (JSON) | Each question ID, question text, student answer, correct answer, pass/fail |
| Score | e.g., `8/10` |
| Question Count | Number of graded questions in that attempt |
| Tab Switches | Number of tab-switch violations |
| Fullscreen Exits | Number of times fullscreen was exited |
| Screenshot Attempts | PrintScreen / mobile screenshot count |
| Camera | Stored permission state |
| Mic | Stored permission state |
| Device | `mobile` / `desktop` |
| Auto Submitted | `true` if submission was forced |
| Suspicious Log | Full timestamped log of all security events |

---

## Teacher View

Open the Google Sheet after students attempt the quiz.  
Each row is one student's attempt — you can see:
- Real-time score breakdown based on dynamic JSON question limits
- Every suspicious activity logged with exact timestamps
- Force-submitted papers due to security strikes (>= 5 violations). 
- **Auto-Highlighting**: Any student force-submitted by the Anti-Cheat algorithm will have their row automatically highlighted in the master Google Sheet!

Use **Data → Filter** to sort by score or flag students with high violation counts.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| CORS error on submission | Re-deploy Apps Script → **New Deployment** |
| Fullscreen not working | Must be triggered by user gesture (click). Works on modern browsers. |
| Camera permission always denied | HTTPS required for `getUserMedia` — host on GitHub Pages or HTTPS server |
| Quiz can be re-taken | `localStorage` cleared by user — combine with server-side duplicate check |
| Questions not randomizing | Check `CONFIG.SHUFFLE_QUESTIONS = true` in `script.js` |

---

## Browser Compatibility

| Feature | Chrome | Firefox | Safari | Edge | Mobile Chrome |
|---|---|---|---|---|---|
| Fullscreen | ✅ | ✅ | ⚠️ Partial | ✅ | ✅ |
| Tab detection | ✅ | ✅ | ✅ | ✅ | ✅ |
| PrintScreen detect | ✅ | ✅ | ✅ | ✅ | N/A |

> [!NOTE]
> For best results, ask students to use **Google Chrome on a desktop or laptop**.  
> All features work on mobile but fullscreen behavior may vary by device.
