# 🛡️ SecureQuiz - Advanced SaaS Evaluation Platform

SecureQuiz is a modern, lightweight, and highly secure asynchronous quiz platform designed for educators. It combines a premium dark-glassmorphism UI with rigorous browser-based proctoring features. 

Built as a Universal SaaS platform, educators can instantly create quizzes, generate shareable links, and monitor student performance and integrity logs via a real-time dashboard—all powered by a serverless Firebase backend.

## ✨ Key Features

### 👨‍🏫 For Educators (The Dashboard)
* **Instant Quiz Creation:** Create quizzes with custom time limits and security thresholds (e.g., max tab switches allowed).
* **Universal Shareable Links:** Generate unique `?quizId=XXXX` links to distribute to students. No hardcoded student registries needed!
* **Real-time Analytics:** Monitor submissions live. View scores, timestamps, and a detailed "Integrity Log" for every student.

### 🎓 For Students (The Quiz Engine)
* **Advanced Proctoring:** * 🛑 **Tab-Switch Detection:** Tracks and limits how many times a student leaves the quiz tab.
  * 🖥️ **Fullscreen Enforcement:** Forces the browser into fullscreen mode. Exiting fullscreen triggers a warning.
  * 📸 **Screenshot Blocking:** Detects and blocks common keyboard shortcuts for screenshots/printing.
  * ⚡ **Auto-Submit:** Automatically submits the quiz if violation thresholds are breached or the timer hits zero.
* **Premium UX/UI:** Distraction-free, responsive dark mode with glassmorphism elements and smooth transitions.
* **PDF Report Cards:** Students can download a stunning, high-res PDF certificate of their results using native JavaScript.

---

## 🛠️ Tech Stack

This project is built to be blisteringly fast and easily hostable anywhere, requiring **zero** heavy frontend frameworks.

* **Frontend:** HTML5, CSS3 (Variables, CSS Grid/Flexbox), Vanilla JavaScript (ES6+).
* **Backend / Database:** Firebase Firestore (V9 Modular Web SDK) for scalable, real-time NoSQL data storage.
* **Libraries:** `html2pdf.js` (for generating PDF report cards), FontAwesome (icons), Google Fonts (Orbitron, Outfit).

*(Note: This platform has been upgraded from its legacy version which relied on Google Sheets and Apps Script, making it fully scalable for thousands of concurrent users).*

---

## 📂 Project Structure

```text
/secure-quiz
│
├── index.html           # (Student) Main quiz interface & proctoring engine
├── script.js            # (Student) Handles quiz logic, timer, and anti-cheat
│
├── create.html          # (Teacher) Interface to build and publish quizzes
├── create.js            # (Teacher) Pushes quiz data to Supabase and generates URLs
│
├── dashboard.html       # (Teacher) Analytics table for student submissions
├── dashboard.js         # (Teacher) Fetches and displays real-time Supabase data
│
├── supabase-config.js   # (Shared) Supabase client initialization and keys
├── supabase-schema.sql  # (Setup) SQL schema/policies for quizzes and submissions
├── style.css            # (Shared) Global dark glassmorphism stylesheet
└── README.md            # Project documentation