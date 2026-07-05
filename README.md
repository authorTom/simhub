# SimHub 🩺

[![Licence: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D16.0.0-blue.svg)](https://nodejs.org/)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-lightgrey.svg)]()

**SimHub is a free, open-source scenario management and run-time system for clinical simulation teams.** Write your scenarios once in a structured, ASPiH-aligned format, organise them into course programmes, run them live with an on-screen patient monitor, and debrief with a built-in PEARLS guide — all from one web app that runs entirely on your own hardware.

It is built for simulation centres, clinical skills departments, and education teams who want the structure of a commercial simulation platform without the licence fees, per-seat pricing, or handing their scenario library to a third-party cloud.

---

## 💷 Why a free, open-source platform?

If you are currently managing scenarios in Word documents and shared drives — or paying for a commercial platform — here is what SimHub offers:

| | SimHub | Typical paid platform | Word docs + shared drive |
| :--- | :--- | :--- | :--- |
| **Cost** | £0, forever (MIT licence) | Annual licence, often per-seat | "Free", but unstructured |
| **Your data** | Stays on your own machine/server | Vendor's cloud | Scattered, versioning by filename |
| **Users & scenarios** | Unlimited | Often tiered | Unlimited |
| **Structure & governance** | Enforced ASPiH-aligned template, version history, review dates | Varies | Manual, inconsistent |
| **Run-time support** | Live vitals HUD, phase progression, timers, cue prompts | Usually yes | Printed sheets |
| **If the vendor disappears** | Nothing changes — you have the code and the data | Migration project | — |

Because your entire scenario library lives in plain, human-readable JSON files on your own hardware, there is **no vendor lock-in and nothing leaves your building** — which also makes conversations with your information governance team considerably shorter.

### What SimHub is *not* (yet)

Honesty helps you evaluate. SimHub does not currently do: manikin/hardware control, audiovisual capture or video-assisted debriefing, learner-facing accounts or assessment scoring, or LMS integration. It manages, runs, and debriefs your *scenarios* — it does not replace your AV system or your manikin software.

---

## 🌟 What can it do?

**📝 Plan & write** — A guided seven-step scenario builder covering everything the [ASPiH](https://aspih.org.uk/) standards expect: governance and sign-off, learning outcomes (technical and non-technical), patient demographics and clinical background, SBAR handovers, faculty and simulated-participant roles with scripts, equipment and medication checklists, environment setup, and multi-phase clinical progression with target vitals.

**🗂️ Organise** — Group scenarios into curriculum programmes (e.g. *Year 5 Undergraduate Medicine*, *FY1 Induction*), search the whole library instantly, and track review-due dates so nothing quietly goes out of date.

**▶️ Run** — A real-time facilitator HUD with a simulated bedside monitor (live ECG trace paced by the scripted heart rate), phase-by-phase progression that updates target vitals at a click, a run timer, expected-action checklists, rescue-cue prompts, and confederate scripts to hand.

**🗣️ Debrief** — A built-in guide based on the [PEARLS](https://debrief2learn.org/pearls-debriefing-tool/) framework, pre-filled with the questions and analysis points you wrote into the scenario, with its own timer for each debrief phase.

**🔐 Govern** — Role-based access (Admin / programme-scoped Editor / Read-Only), full user administration with bulk operations, forced password rotation for provisioned accounts, scenario version history, a recycle bin for accidental deletions, one-click JSON backup and restore, and PDF export of any scenario for printing or sharing.

---

## 📸 SimHub in action

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

## 🚀 Getting started (about 10 minutes)

You do not need to be a developer. If you can install a program and copy a few commands into a terminal, you can run SimHub. There is no database server to set up and no build step — one small dependency and it runs.

### 1. Install Node.js

Download and install [Node.js](https://nodejs.org/) (the free LTS version) for Windows, macOS, or Linux. This is the only prerequisite.

### 2. Download and start SimHub

Open a terminal (Command Prompt / PowerShell on Windows, Terminal on macOS) and run:

```bash
git clone https://github.com/authorTom/simhub.git
cd simhub
npm install
npm run seed     # loads a complete worked example scenario
npm start
```

> No `git`? You can also download the project as a ZIP from GitHub (green **Code** button → *Download ZIP*), unzip it, and run the last three commands inside the folder.

### 3. Open it in your browser

Go to **http://localhost:3000** and sign in (see below). The seeded example — a full Acute Pulmonary Embolism scenario ("Sam Phillips") mapped to an undergraduate curriculum — is a good way to explore every feature before writing your own.

### First sign-in

SimHub seeds two accounts so you can get in:

| Role | Email | Initial password |
| :--- | :--- | :--- |
| **Admin** | `admin@simhub.local` | `admin123` |
| **Read-Only faculty** | `faculty@simhub.local` | `faculty123` |

These initial passwords are **provisional**: each account must set its own password at first sign-in before anything else works. The same applies to any account an Admin later creates or resets — so a default or temporary password can never quietly linger.

### User roles

| Role | What they can do |
| :--- | :--- |
| **Admin** | Everything: scenarios, programmes, users, backups, recycle bin. |
| **Editor** | Create and edit scenarios, but **only within programmes an Admin has allocated to them**. Read-only everywhere else. Ideal for course leads who own their own content. |
| **Read-Only** | Browse the library, view scenario detail sheets, run the HUD and debrief guide. Cannot change anything. |

---

## 🗄️ Your data, backups, and recovery

*   **Where it lives**: everything is plain JSON in the `data/` folder — one file per scenario, one per programme. You can read them, diff them, and back them up like any other files.
*   **Backups**: Admins get one-click **Export** (downloads your whole scenario library as a single JSON file) and **Import** (restores or merges it) from the dashboard sidebar. Scheduling a copy of the `data/` folder into your existing backup routine covers everything else (users, sessions).
*   **Deletions are recoverable**: deleted scenarios go to a recycle bin, where an Admin can restore them or erase them permanently.
*   **Printing / sharing**: any scenario can be exported as a print-styled PDF.

---

## 🏥 Running SimHub for a department

For a single sim suite, `npm start` on any spare machine (Windows, macOS, Linux — modest hardware is fine) and browsing to its address is genuinely enough. For a shared departmental installation:

*   **Put it behind HTTPS**: run a reverse proxy (nginx, Caddy, IIS) in front of SimHub and terminate TLS there. Sign-in uses bearer tokens and assumes an encrypted transport.
*   **Set `TRUST_PROXY=1`** when behind a proxy so login rate-limiting sees real client addresses. Leave it unset when clients connect directly.
*   **Protect the `data/` folder**: it holds password hashes and session tokens. It is never served over the web, but restrict filesystem permissions to the service account and include it in backups.
*   **Restarts are painless**: active sign-ins persist across restarts and redeploys, so updating SimHub does not log your faculty out mid-session.
*   **Port**: set the `PORT` environment variable to change from the default `3000`.

Security features already built in: salted scrypt password hashing, brute-force login throttling, 8-hour sliding sessions with revocation on password change or account removal, server-side role enforcement, path-traversal and stored-XSS protections, and last-admin lockout guards.

---

## 🧑‍💻 For developers

**Stack**: Node.js + Express backend, flat-file JSON persistence, vanilla HTML/CSS/JS frontend (no build step, no framework). The only runtime dependency is Express.

### Tests

```bash
npm run test          # API integration suite (auth, roles, CRUD, backups)
npm run test:ui       # Puppeteer end-to-end: full scenario wizard save flow
npm run screenshots   # regenerate the README screenshots
```

The UI tests and screenshots need Google Chrome installed in a standard location.

### Project layout

```text
simhub/
├── .github/                   # Issue templates
├── data/                      # Flat-file JSON database (git-ignored)
│   ├── scenarios/             # One file per scenario
│   ├── programmes/            # Programme tracks
│   ├── recycle_bin/           # Soft-deleted scenarios
│   ├── users.json             # Faculty accounts (hashed credentials)
│   └── sessions.json          # Persisted sign-in sessions
├── public/                    # Frontend static files
│   ├── css/style.css          # Themes and styles
│   ├── js/                    # SPA logic (api / components / app)
│   └── index.html             # Application shell
├── CHANGELOG.md               # Full change history
├── CONTRIBUTING.md            # Contribution guide
├── LICENSE                    # MIT licence
├── scenario_template.md       # ASPiH scenario blueprint (reference)
├── seed.js                    # Example dataset generator
├── server.js                  # Express application server
├── test-qa.js                 # API integration tests
└── test-ui-save.js            # Puppeteer UI tests
```

---

## 🤝 Contributing

Contributions from the simulation community are very welcome — clinical educators reporting what a real sim programme needs are just as valuable as code. Please read the [Contributing Guide](CONTRIBUTING.md), then:

1.  Fork the project.
2.  Create your feature branch (`git checkout -b feature/AmazingFeature`).
3.  Commit your changes (`git commit -m 'Add some AmazingFeature'`).
4.  Push to the branch (`git push origin feature/AmazingFeature`).
5.  Open a Pull Request.

---

## 📝 Change log

The full version history — features, security hardening, and fixes — lives in [CHANGELOG.md](CHANGELOG.md).

---

## 📄 Licence

MIT — free for any use, including commercial. See [LICENSE](LICENSE) for details.
