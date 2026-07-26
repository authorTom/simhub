# SimHub

**A free, open-source scenario management and run-time system for clinical
simulation teams.**

Write your scenarios once in a structured, ASPiH-aligned format, organise them
into course programmes, run them live with an on-screen patient monitor, and
debrief with a built-in PEARLS guide — all from one web app that runs entirely
on your own hardware.

It is built for simulation centres, clinical skills departments and education
teams who want the structure of a commercial simulation platform without the
licence fees, per-seat pricing, or handing their scenario library to a
third-party cloud.

| Login gateway | Faculty dashboard |
| --- | --- |
| ![The SimHub sign-in screen](public/screenshots/01_login_screen.png) | ![A dashboard listing scenarios grouped into curriculum programmes](public/screenshots/02_dashboard.png) |
| **Scenario details** | **Interactive run HUD** |
| ![A scenario detail sheet showing learning outcomes, SBAR handover and phases](public/screenshots/03_details.png) | ![The facilitator HUD with a live ECG trace, target vitals, run timer and expected actions](public/screenshots/04_hud.png) |
| **PEARLS debrief guide** | **High-contrast light mode** |
| ![The debrief guide with PEARLS phases, pre-filled questions and a phase timer](public/screenshots/05_debrief.png) | ![The same dashboard in high-contrast light mode](public/screenshots/06_dashboard_light.png) |

## Why it exists

If you are currently managing scenarios in Word documents and shared drives — or
paying for a commercial platform — here is what SimHub offers:

| | SimHub | Typical paid platform | Word docs + shared drive |
| :--- | :--- | :--- | :--- |
| **Cost** | £0, forever (MIT licence) | Annual licence, often per-seat | "Free", but unstructured |
| **Your data** | Stays on your own machine or server | Vendor's cloud | Scattered, versioning by filename |
| **Users and scenarios** | Unlimited | Often tiered | Unlimited |
| **Structure and governance** | Enforced ASPiH-aligned template, version history, review dates | Varies | Manual, inconsistent |
| **Run-time support** | Live vitals HUD, phase progression, timers, cue prompts | Usually yes | Printed sheets |
| **If the vendor disappears** | Nothing changes — you have the code and the data | Migration project | — |

Because your entire scenario library lives in plain, human-readable JSON files
on your own hardware, there is **no vendor lock-in and nothing leaves your
building** — which also makes conversations with your information governance
team considerably shorter.

### What SimHub is not (yet)

Honesty helps you evaluate. SimHub does not currently do manikin or hardware
control, audiovisual capture or video-assisted debriefing, learner-facing
accounts or assessment scoring, or LMS integration. It manages, runs and
debriefs your *scenarios* — it does not replace your AV system or your manikin
software.

## What it does

**Plan and write** — A guided seven-step scenario builder covering everything
the [ASPiH](https://aspih.org.uk/) standards expect: governance and sign-off,
learning outcomes (technical and non-technical), patient demographics and
clinical background, SBAR handovers, faculty and simulated-participant roles
with scripts, equipment and medication checklists, environment setup, and
multi-phase clinical progression with target vitals.

**Organise** — Group scenarios into curriculum programmes (for example *Year 5
Undergraduate Medicine*, *FY1 Induction*), search the whole library instantly,
and track review-due dates so nothing quietly goes out of date.

**Run** — A real-time facilitator HUD with a simulated bedside monitor (live ECG
trace paced by the scripted heart rate), phase-by-phase progression that updates
target vitals at a click, a run timer, expected-action checklists, rescue-cue
prompts, and confederate scripts to hand.

**Debrief** — A built-in guide based on the
[PEARLS](https://debrief2learn.org/pearls-debriefing-tool/) framework,
pre-filled with the questions and analysis points you wrote into the scenario,
with its own timer for each debrief phase.

**Govern** — Role-based access (Admin / programme-scoped Editor / Read-Only),
full user administration with bulk operations, forced password rotation for
provisioned accounts, scenario version history, a recycle bin for accidental
deletions, one-click JSON backup and restore, and PDF export of any scenario for
printing or sharing.

## Run it

You do not need to be a developer for either route. If you can install a program
and copy a few commands into a terminal, you can run SimHub. There is no
database server to set up and no build step.

### With Docker (recommended)

The published image is the easiest way to run SimHub reliably on a departmental
server, a NAS, or even a Raspberry Pi — it is built for both x86 and ARM. It is
small (~60 MB), runs as an unprivileged user, reports its own health, and shuts
down gracefully so no data is lost on restarts.

```bash
curl -fsSL -o compose.yaml \
  https://raw.githubusercontent.com/authorTom/simhub/main/compose.yaml
curl -fsSL -o .env.example \
  https://raw.githubusercontent.com/authorTom/simhub/main/.env.example
cp .env.example .env    # then edit if you need TRUST_PROXY, a different port, etc.

docker compose up -d                     # start (pulls the image)
docker compose ps                        # confirm STATUS shows "(healthy)"
docker compose exec simhub node seed.js  # optional: load the example scenario
```

Open **`http://<server>:3000`** and sign in — see
[First sign-in](#first-sign-in) below. You do not need the source checked out on
the server.

Or without compose, in one command:

```bash
docker run -d --name simhub \
  -p 3000:3000 \
  -v simhub-data:/app/data \
  --restart unless-stopped \
  ghcr.io/authortom/simhub:latest
```

Updating:

```bash
docker compose pull && docker compose up -d
```

The new container starts against the same data volume, and persisted sessions
mean your faculty are not even signed out. To be able to roll back, deploy a
pinned tag instead of `latest`.

| Tag | Meaning |
| :--- | :--- |
| `ghcr.io/authortom/simhub:latest` | Current state of `main` |
| `ghcr.io/authortom/simhub:sha-<commit>` | Immutable build of a specific commit (best for pinning and rollback) |
| `ghcr.io/authortom/simhub:<version>` | Published when a `v*` release tag is pushed |

To build the image yourself instead — on an air-gapped network, for instance:

```bash
git clone https://github.com/authorTom/simhub.git
cd simhub
docker build -t simhub .
docker run -d --name simhub -p 3000:3000 -v simhub-data:/app/data --restart unless-stopped simhub
```

### From source

The quickest way to try it on your own machine. The only prerequisite is
[Node.js](https://nodejs.org/) (the free LTS version).

```bash
git clone https://github.com/authorTom/simhub.git
cd simhub
npm install
npm run seed     # loads a complete worked example scenario
npm start
```

Open **<http://localhost:3000>**. The seeded example — a full Acute Pulmonary
Embolism scenario ("Sam Phillips") mapped to an undergraduate curriculum — is a
good way to explore every feature before writing your own.

> No `git`? Download the project as a ZIP from GitHub (green **Code** button →
> *Download ZIP*), unzip it, and run the last three commands inside the folder.

### First sign-in

SimHub seeds two accounts so you can get in:

| Role | Email | Initial password |
| :--- | :--- | :--- |
| **Admin** | `admin@simhub.local` | `admin123` |
| **Read-Only faculty** | `faculty@simhub.local` | `faculty123` |

These initial passwords are **provisional**: each account must set its own
password at first sign-in before anything else works. The same applies to any
account an Admin later creates or resets — so a default or temporary password
can never quietly linger.

### User roles

| Role | What they can do |
| :--- | :--- |
| **Admin** | Everything: scenarios, programmes, users, backups, recycle bin. |
| **Editor** | Create and edit scenarios, but **only within programmes an Admin has allocated to them**. Read-only everywhere else. Ideal for course leads who own their own content. |
| **Read-Only** | Browse the library, view scenario detail sheets, run the HUD and debrief guide. Cannot change anything. |

## Configuration

| Variable | Default | What it does |
| --- | --- | --- |
| `PORT` | `3000` | Port the server listens on |
| `TRUST_PROXY` | *(unset)* | Set to `1` behind a reverse proxy, so login rate-limiting sees real client addresses |

Copy [`.env.example`](.env.example) to `.env` and adjust. Everything else —
scenarios, programmes, users, roles — is managed inside the app.

## Running SimHub for a department

For a single sim suite, the Docker quick start above (or `npm start` on any
spare machine — modest hardware is fine) is genuinely enough. For a shared
departmental installation:

- **Put it behind HTTPS.** Run a reverse proxy (nginx, Caddy, IIS) in front of
  SimHub and terminate TLS there. Sign-in uses bearer tokens and assumes an
  encrypted transport.
- **Set `TRUST_PROXY=1`** when behind a proxy. Leave it unset when clients
  connect directly.
- **Protect the `data/` folder.** It holds password hashes and session tokens.
  It is never served over the web, but restrict filesystem permissions to the
  service account and include it in backups.
- **Restarts are painless.** Active sign-ins persist across restarts and
  redeploys, so updating SimHub does not sign your faculty out mid-session.
- **Monitoring.** `GET /api/health` is an unauthenticated liveness endpoint for
  uptime checks and container orchestrators.

## How it's built

Node.js + Express backend, flat-file JSON persistence, vanilla HTML/CSS/JS
frontend — no build step, no framework. The only runtime dependency is Express.

```text
simhub/
├── .github/workflows/         # CI: builds and publishes the Docker image
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
├── Dockerfile                 # Production container image
├── compose.yaml               # Departmental deployment recipe (pull-based)
├── scenario_template.md       # ASPiH scenario blueprint (reference)
├── seed.js                    # Example dataset generator
├── server.js                  # Express application server
├── test-qa.js                 # API integration tests
└── test-ui-save.js            # Puppeteer UI tests
```

Everything is plain JSON in `data/` — one file per scenario, one per programme.
You can read them, diff them, and back them up like any other files.

### Tests

```bash
npm run test          # API integration suite (auth, roles, CRUD, backups)
npm run test:ui       # Puppeteer end-to-end: full scenario wizard save flow
npm run screenshots   # regenerate the README screenshots
```

The UI tests and screenshots need Google Chrome installed in a standard
location.

## Security

Built in already: salted scrypt password hashing, brute-force login throttling,
8-hour sliding sessions with revocation on password change or account removal,
server-side role enforcement, path-traversal and stored-XSS protections, and
last-admin lockout guards.

## Backing up

All scenarios, programmes, users and sessions are stored in the `simhub-data`
named volume — **the container itself is disposable**. You can delete and
recreate it, or update the image, without losing anything.

- **From the app**: Admins get one-click **Export** (downloads the whole
  scenario library as a single JSON file) and **Import** from the dashboard
  sidebar.
- **At the infrastructure level**:

  ```bash
  docker run --rm -v simhub-data:/data -v "$PWD":/backup alpine \
    tar czf /backup/simhub-data-backup.tar.gz -C /data .
  ```

Deleted scenarios go to a recycle bin, where an Admin can restore them or erase
them permanently. Any scenario can also be exported as a print-styled PDF.

## Contributing

Contributions from the simulation community are very welcome — clinical
educators reporting what a real sim programme needs are just as valuable as
code. Please read the [Contributing Guide](CONTRIBUTING.md).

The full version history lives in [CHANGELOG.md](CHANGELOG.md).

## Licence

MIT — free for any use, including commercial. See [LICENSE](LICENSE).
