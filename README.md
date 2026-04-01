# 🛡️ SecureQuiz - Advanced SaaS Evaluation Platform

SecureQuiz is a modern, lightweight, and highly secure asynchronous quiz platform designed for educators. It combines a premium minimalist UI, interactive canvas backgrounds, and rigorous browser-based proctoring features. 

Built as a Universal SaaS platform, educators can instantly create quizzes, generate shareable links, and monitor student performance and integrity logs via a real-time dashboard—all powered by a fast, serverless Supabase backend.

## ✨ Key Features

### 👨‍🏫 For Educators (The Dashboard)
* **Instant Quiz Creation:** Create custom quizzes with specific time limits and strict security thresholds.
* **Universal Shareable Links:** Generate unique `?quizId=XXXX` links to distribute to students instantly.
* **Real-time Analytics:** Monitor submissions live across multiple quizzes. View scores, timestamps, and a detailed "Integrity Log" for every student.
* **Export to Excel:** Export detailed student submissions and proctoring logs directly to XLSX format for record-keeping.
* **Secure Login:** Access dashboard analytics safely via authenticated sessions.

### 🎓 For Students (The Quiz Engine)
* **Advanced Proctoring:** 
  * 🛑 **Tab-Switch Detection:** Tracks and limits how many times a student leaves the quiz tab or opens other apps.
  * 🖥️ **Fullscreen Enforcement:** Forces the browser into fullscreen mode. Exiting fullscreen triggers a warning.
  * 📸 **Screenshot Blocking:** Detects and blocks common keyboard shortcuts for screenshots and copying.
  * ⚡ **Auto-Submit:** Automatically submits the quiz if violation thresholds (e.g., 5 tab switches) are breached or the timer hits zero.
* **Premium UX/UI:** Distraction-free, responsive dark mode and minimalist themes with interactive backgrounds and smooth transitions. Includes a Light/Dark theme switcher.
* **Performance Report Cards:** Students receive an instant, beautifully formatted digital report card upon submission.
* **Post-Submission Review:** Students can review their graded answers immediately after completing the quiz.

---

## 🛠️ Tech Stack

This project is built to be blisteringly fast and easily hostable anywhere, requiring **zero** heavy frontend frameworks.

* **Frontend:** HTML5, CSS3 (Variables, CSS Grid/Flexbox), Vanilla JavaScript (ES6+).
* **Backend / Database:** Supabase (PostgreSQL & Real-time Subscriptions) for scalable, secure data storage.
* **Deployment:** Pre-configured for seamless serverless deployment on Vercel (`vercel.json`).
* **Libraries:** `xlsx.full.min.js` (for exporting dashboard data), FontAwesome (icons), Google Fonts (Orbitron, Syne).

*(Note: This platform has been upgraded from a legacy Firebase version to leverage Supabase for enhanced relational data structuring and performance).*

---

## 📂 Project Structure

```text
/SecureQuizApp
│
├── pages/
│   ├── index.html       # (Student) Main quiz interface & proctoring engine
│   ├── create.html      # (Teacher) Interface to build and publish quizzes
│   ├── dashboard.html   # (Teacher) Multi-quiz analytics table for submissions
│   ├── home.html        # (Public) Marketing and onboarding page
│   └── setup.html       # (Public) Setup and usage guide
│
├── assets/
│   ├── css/
│   │   ├── style.css            # (Shared) Global styling and layouts
│   │   └── minimal.css          # (Shared) Minimalist UI overrides
│   └── js/
│       ├── script.js            # (Student) Quiz logic, timer, anti-cheat
│       ├── create.js            # (Teacher) Quiz builder and publish flow
│       ├── dashboard.js         # (Teacher) Dashboard data rendering
│       ├── supabase-config.js   # (Shared) Supabase client initialization
│       ├── theme.js             # (Shared) Light/dark theme toggling
│       └── background.js        # (Shared) Canvas background animations
│
├── db/
│   └── supabase-schema.sql      # (Setup) SQL schema and RLS policies
│
├── vercel.json          # (Deploy) Vercel routing configuration
│
└── README.md            # Project documentation
```