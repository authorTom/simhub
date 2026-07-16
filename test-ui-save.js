const puppeteer = require('puppeteer-core');
const { getChromePath, ensureRotatedLogin } = require('./dev-helpers');

const PORT = process.env.PORT || 3000;
const URL = `http://localhost:${PORT}`;

async function run() {
  const chromePath = getChromePath();
  if (!chromePath) {
    console.error('❌ Google Chrome not found. Set CHROME_PATH to your Chrome/Chromium binary.');
    process.exit(1);
  }

  // Fresh installs seed the admin account with a provisional password that
  // forces a rotation modal on first login; complete the rotation over the
  // API first so the UI flow below goes straight to the dashboard.
  await ensureRotatedLogin(URL, 'admin@simhub.local', 'admin123');

  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: 'new',
    defaultViewport: { width: 1440, height: 900 }
  });

  try {
    const page = await browser.newPage();
    
    // Bind console log to see page errors
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', err => console.error('PAGE EXCEPTION:', err.toString()));

    console.log('Navigating to SimHub...');
    await page.goto(URL, { waitUntil: 'networkidle2' });

    console.log('Logging in as Admin...');
    await page.evaluate(() => {
      document.getElementById('login-email').value = '';
      document.getElementById('login-password').value = '';
    });
    await page.type('#login-email', 'admin@simhub.local');
    await page.type('#login-password', 'admin123');
    await page.click('button[type="submit"]');

    // Wait for scenarios to load
    await page.waitForSelector('.scenario-card', { timeout: 8000 });
    console.log('Logged in successfully!');

    // Click "New Scenario" button in header
    console.log('Navigating to Scenario Creation Wizard...');
    const newScenarioNavBtn = await page.waitForSelector('#nav-btn-new-scenario');
    await newScenarioNavBtn.click();

    // Wait for the form view to be active
    await page.waitForSelector('#view-scenario-form.active', { timeout: 5000 });
    console.log('Wizard loaded successfully!');

    // Fill out General fields
    console.log('Filling out basic metadata...');
    await page.type('#form-code', 'UI-CRUD-100');
    await page.type('#form-title', 'Automated UI Test Scenario');
    await page.type('#form-lastReviewed', '27/05/2026');
    await page.type('#form-nextReviewDue', '27/05/2029');
    await page.type('#form-authors', 'Automated QA Test Script');
    await page.type('#form-clinicalReviewer', 'QA Clinical Lead');
    await page.type('#form-educationalReviewer', 'QA Educational Lead');
    await page.type('#form-summary', 'A scenario created programmatically by headless Chrome to verify forms.');
    await page.type('#form-targetLearners', 'Final Year Students');
    await page.type('#form-location', 'Mock Ward Room A');

    // Fill out Patient Demographics
    console.log('Switching to Patient Tab and entering demographics...');
    await page.click('button[onclick="components.switchEditorTab(\'tab-patient\')"]');
    await page.waitForSelector('#form-patName', { timeout: 2000 });
    await page.type('#form-patName', 'Test Patient Sam');
    await page.type('#form-patAge', '50 yrs');
    await page.type('#form-patSex', 'Male');
    await page.type('#form-patWeight', '80 kg');
    await page.type('#form-patPC', 'Shortness of breath');
    await page.type('#form-patHistory', 'Developed dyspnea 2 hours ago.');
    await page.type('#form-patAllergies', 'None known');

    // Submit scenario (click "Save Scenario" button)
    console.log('Submitting the scenario...');
    // We can click the Save button in the header
    const saveBtn = await page.waitForSelector('#view-scenario-form button.btn-emerald');
    await saveBtn.click();

    // Verify it transitioned back to the detail view of the new scenario
    console.log('Waiting for detail view to load...');
    await page.waitForSelector('#view-scenario-detail.active', { timeout: 8000 });
    console.log('Transitioned back to Scenario Detail Sheet successfully!');

    // Fetch the title from the details view to check it loaded our scenario
    const detailsTitle = await page.$eval('#scenario-detail-content h1', el => el.innerText);
    console.log(`Loaded scenario title in details view: "${detailsTitle}"`);

    if (detailsTitle.includes('Automated UI Test Scenario')) {
      console.log('\n✅ UI TEST SUCCESS: New scenarios are successfully created, compiled, and saved through the web form!');
      
      // Clean up the created test scenario
      console.log('Cleaning up: Deleting UI test scenario...');
      const deleteBtn = await page.waitForSelector('#btn-delete-scenario');
      await deleteBtn.click();

      // Accept the styled in-app confirmation dialog
      const confirmBtn = await page.waitForSelector('#confirm-accept-btn', { timeout: 5000 });
      await confirmBtn.click();

      await page.waitForSelector('#view-dashboard.active', { timeout: 5000 });
      console.log('Cleanup finished successfully.');
      
      await browser.close();
      process.exit(0);
    } else {
      console.error('\n❌ UI TEST FAILURE: Details view title does not match!');
      await browser.close();
      process.exit(1);
    }

  } catch (err) {
    console.error('\n❌ UI TEST CRASHED:', err);
    await browser.close();
    process.exit(1);
  }
}

run();
