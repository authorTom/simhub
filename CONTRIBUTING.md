# Contributing to SimHub 🤝

First off, thank you for taking the time to contribute! SimHub is a community-driven project, and we value your clinical, educational, and technical insights.

Here is a set of guidelines to help you contribute effectively and smoothly.

---

## 📋 Code of Conduct

We are committed to providing a welcoming, inclusive, and professional environment. We expect all contributors to:
*   Be respectful and collaborative.
*   Focus on constructive feedback.
*   Prioritise patient safety, clinical accuracy, and educational utility.

---

## 💡 How Can I Contribute?

### 1. Reporting Bugs
*   Check the [Issues](https://github.com/yourusername/simhub/issues) tab to see if the bug has already been reported.
*   If not, open a new issue using our **Bug Report** template.
*   Provide a clear summary, step-by-step reproduction instructions, expected vs. actual behaviour, and relevant console log snippets or screenshots.

### 2. Suggesting Enhancements
*   Open an issue using our **Feature Request** template.
*   Explain the *why*—what problem does this solve? How does this improve the user experience for clinical facilitators or learners?
*   Provide diagrams or mockups if applicable.

### 3. Submitting Pull Requests (PRs)
*   Fork the repository and create your branch from `main`.
*   Ensure your code is clean, well-commented, and adheres to our coding standards.
*   Add/update test coverage for your changes.
*   Verify all tests pass before submitting.
*   Link your PR to the related issue it resolves.

---

## 🛠️ Local Development & Branching Workflow

### 1. Setup Your Environment
Clone the repository and install development dependencies:
```bash
git clone https://github.com/yourusername/simhub.git
cd simhub
npm install
npm run seed
```

### 2. Branch Naming Conventions
Use clear prefixes for your branch names:
*   `feature/` for new features (e.g., `feature/custom-vitals-waveforms`)
*   `bugfix/` for bug fixes (e.g., `bugfix/fix-auth-header-caching`)
*   `docs/` for documentation updates (e.g., `docs/add-pearls-citations`)
*   `refactor/` for non-functional code improvements (e.g., `refactor/modularise-express-routes`)

### 3. Frontend & Styling Rules
*   **Keep it Vanilla**: Do not add frontend frameworks (React, Vue, etc.) or Tailwind CSS unless explicitly agreed upon in a design issue. SimHub's premium feel relies on clean, high-performance vanilla HTML, CSS variables, and modern JavaScript.
*   **Maintain Themes**: Ensure any new UI components look beautiful and remain readable in *both* Light and Dark modes. Test your CSS in both modes.

### 4. Running Verification Tests
Before pushing your changes, run our built-in test suites to make sure nothing is broken:

*   **API Tests**:
    ```bash
    npm run test
    ```
*   **UI Form Tests**:
    ```bash
    npm run test:ui
    ```

---

## 📝 Pull Request Checklist

Before submitting your PR, double-check that you have:
1. [ ] Forked the repository and created a branch from `main`.
2. [ ] Run `npm run test` and confirmed all integration tests pass.
3. [ ] Run `npm run test:ui` to ensure no regressions in scenario creation workflows.
4. [ ] Checked that your styling renders perfectly in both Light and Dark modes.
5. [ ] Added clear comments explaining non-trivial logic.
6. [ ] Linked the PR to the relevant issue (e.g. `Closes #12`).
