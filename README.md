# SimHub 🩺

[![Licence: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D16.0.0-blue.svg)](https://nodejs.org/)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg)]()

> A beautiful, premium, and fully featured Clinical Simulation Scenario Management and Run-time System designed to align directly with ASPiH (Association for Simulated Practice in Healthcare) standards.

SimHub enables healthcare educators to draft, organise, run, and debrief high-fidelity clinical simulation scenarios from a single, unified, modern web interface.

---

## 🌟 Key Features

*   **ASPiH-Aligned Scenario Builder**: Standardised schemas covering clinical governance, learning outcomes, environmental setups, equipment/medication checklists, structured prebriefs, and multi-phase progression states.
*   **Interactive Simulation HUD**: A premium, real-time control interface for simulation facilitators. It includes:
    *   Dynamic vitals monitor simulation with active waveform styles.
    *   Phase-by-phase clinical progression tracking.
    *   Built-in timer, event logger, and quick-action triggers.
    *   Bedside nurse confederate script cues.
*   **PEARLS Debriefing Guide**: Integrated debrief template using the PEARLS (Promoting Excellence and Reflective Learning in Simulation) framework, featuring structural prompts for *Reactions*, *Description*, *Analysis* (Advocacy-Inquiry, Directive Feedback, Plus-Delta), and *Summary*.
*   **Curriculum Programme Mapping**: Group scenarios into specific academic or clinical development tracks (e.g., Year 5 Undergraduate Medicine, Foundation Year 1 Induction).
*   **Role-Based Security**: Built-in simple token authentication with distinct access rules for **Admin** (Full CRUD) and **Clinical Faculty** (Read-Only catalog exploration and interactive runs).
*   **User Administration Area**: A premium, secure control panel for Admin users to add, edit, and delete faculty access accounts, configure permissions, and manage passwords, equipped with self-lockout guards.
*   **Premium Visuals & Dual Themes**: Modern, high-contrast dark mode and premium light mode layouts built with clean, zero-dependency responsive styles.
*   **Robust QA & UI Test Suites**: Bundled integration tests verifying REST endpoints and Puppeteer end-to-end headless browser workflows for scenario compilation.

---

## 📸 SimHub in Action

Here is a visual overview of SimHub's premium interface and high-fidelity simulation features:

| 🔐 Login Gateway | 📊 Faculty Dashboard |
| :---: | :---: |
| ![Login Gateway](public/screenshots/01_login_screen.png) | ![Faculty Dashboard](public/screenshots/02_dashboard.png) |

| 🩺 Scenario Details | 💻 Interactive Run HUD |
| :---: | :---: |
| ![Scenario Details](public/screenshots/03_details.png) | ![Interactive Run HUD](public/screenshots/04_hud.png) |

| 🗣️ PEARLS Debrief Guide | ☀️ High-Contrast Light Mode |
| :---: | :---: |
| ![PEARLS Debrief](public/screenshots/05_debrief.png) | ![Dashboard Light Mode](public/screenshots/06_dashboard_light.png) |

---

## 🛠️ Technology Stack

*   **Backend**: Node.js + Express.js (REST API, lightweight middleware, and static asset serving).
*   **Database**: Flat-file JSON database (highly portable, zero external DB configuration required).
*   **Frontend**: Vanilla HTML5, CSS3 CSS Variables (no Tailwind/build frameworks, ensuring instant load times and complete customisation).
*   **Automation & Testing**: Puppeteer-core + local Google Chrome execution for visual screenshot generation and form validation.

---

## 🚀 Getting Started

### Prerequisites

*   [Node.js](https://nodejs.org/) (v16.0.0 or higher recommended).
*   Google Chrome (installed in standard system paths if you want to run headless UI tests/screenshots).

### Installation

1.  **Clone the Repository**:
    ```bash
    git clone https://github.com/yourusername/simhub.git
    cd simhub
    ```

2.  **Install NPM Dependencies**:
    ```bash
    npm install
    ```

3.  **Seed the Database**:
    SimHub includes an extensive pre-seeded clinical scenario for **Acute Pulmonary Embolism (Sam Phillips)** mapped to Year 5 Undergraduate curriculum. Seed the local JSON storage by running:
    ```bash
    npm run seed
    ```

4.  **Launch SimHub**:
    ```bash
    npm start
    ```

5.  **Access the Application**:
    Open your web browser and navigate to `http://localhost:3000`.

---

## 🔐 Predefined User Roles

SimHub comes with two pre-configured faculty accounts for clinical training teams:

| User Role | Preconfigured Email | Password | Allowed Operations |
| :--- | :--- | :--- | :--- |
| **Admin** | `admin@simhub.local` | `admin123` | Full access. Create, edit, delete, view, run scenarios & programmes. |
| **Clinical Faculty** | `faculty@simhub.local` | `faculty123` | Read-only. Catalog browse, detail sheet view, launch active HUD, view debriefs. Cannot save/delete. |

---

## 🧪 Development, Testing & Visual Validation

SimHub comes equipped with automated tests to verify API endpoints, validate complex UI forms, and capture high-resolution screenshots.

### 1. Backend Integration Tests
Execute the local integration test suite to verify Express endpoints, authorisation middleware, and flat-file CRUD persistence:
```bash
npm run test
```

### 2. End-to-End Headless UI Form Tests
Launches a headless browser instance to open SimHub, authenticate as Admin, complete the multi-tab scenario creation wizard, submit the new scenario, and verify persistent entry on the dashboard before cleaning up:
```bash
npm run test:ui
```

### 3. Automated Screenshot Capture
Run the Puppeteer-driven screenshot script to automatically capture high-resolution images of your SimHub installation (Login, Dashboard, Light Mode, Scenario Details, Active HUD, PEARLS Debrief):
```bash
npm run screenshots
```

---

## 📁 Project Directory Structure

```text
simhub/
├── .github/                   # GitHub Community Templates
│   └── ISSUE_TEMPLATE/        # Standard Bug & Feature Requests
├── data/                      # Local JSON Flat-File Database (git ignored)
│   ├── scenarios/             # Mapped Scenario Files
│   ├── programmes/            # Structured Programme Tracks
│   └── users.json             # Persistent Faculty Access Profiles
├── public/                    # Frontend Static Files
│   ├── css/                   # Premium styles and themes
│   ├── js/                    # SPA logic & state controller
│   └── index.html             # Main Application Shell
├── .gitignore                 # Standard Node.js & local storage exclusion
├── LICENSE                    # MIT Licence Terms
├── README.md                  # Comprehensive Documentation
├── capture-screenshots.js     # Puppeteer visual asset generator
├── package.json               # Node dependencies and runtime commands
├── scenario_template.md       # ASPiH Markdown blueprint for reference
├── seed.js                    # Core clinical dataset generator
├── server.js                  # Main Express Application Server
├── test-qa.js                 # API testing module
└── test-ui-save.js            # Automated UI browser wizard tests
```

---

## 🤝 Contributing

We welcome contributions to make clinical simulation more structured and accessible! Please read our [Contributing Guide](CONTRIBUTING.md) to understand how you can help.

1.  Fork the Project.
2.  Create your Feature Branch (`git checkout -b feature/AmazingFeature`).
3.  Commit your Changes (`git commit -m 'Add some AmazingFeature'`).
4.  Push to the Branch (`git push origin feature/AmazingFeature`).
5.  Open a Pull Request.

---

## 📝 Change Log

### [2026-06-09] - Critical Security Hardening
*   **Password Hashing**: Migrated credentials from plaintext to salted **scrypt** hashes with constant-time verification. Passwords are no longer returned by the user-administration API, user updates accept a blank password to retain the current one, and existing `users.json` records are automatically re-hashed on startup.
*   **Path-Traversal Protection**: Client-supplied identifiers for scenarios, programmes, recycle-bin items, and backup imports are now validated against a safe character set before any filesystem path is built, blocking directory-escape writes. Scenario creation also now returns a correct `201 Created` status.
*   **Stored XSS Prevention**: All user-authored content is HTML-escaped before rendering across the catalog, programmes, admin users, recycle bin, scenario detail sheet, run HUD, PEARLS debrief, toasts, and every scenario wizard field (form values round-trip safely on save). Verified against the full QA (37/37) and Puppeteer UI suites.

### [2026-05-29] - Feature & Security Expansion
*   **Scenario Backup & Restore (Export/Import)**: Added secure, Admin-only JSON scenario database export and import endpoints protected by Bearer token auth, integrated a premium sidebar control widget, and expanded Puppeteer/QA test suites to 37 successful checkpoints.
*   **Clinical Code Base Fixes**: Resolved a leftover conflict marker (`<<<<<<< HEAD`) in `components.js` to restore flawless, instant catalog loading.
*   **User Administration**: Migrated credentials to JSON flat-file storage (`data/users.json`) and added Admin-only CRUD routes protected with lockout guards.
*   **Scenario PDF Export**: Integrated client-side vector PDF downloading using `html2pdf.js` styled with print-contrast clinical layouts.
*   **Scenario Recycle Bin**: Re-routed deletions to a recovery folder (`data/recycle_bin/`) enabling Admin-only file restoration or hard erasure.

---

## 📄 Licence

This project is licensed under the MIT Licence - see the [LICENSE](LICENSE) file for details.
