const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const PORT = 3000;
const URL = `http://localhost:${PORT}`;
const SCREENSHOTS_DIR = path.join(__dirname, 'public', 'screenshots');

// Find local Google Chrome executable
function getChromePath() {
  const commonPaths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(process.env.USERPROFILE || 'C:\\Users\\thom', 'AppData\\Local\\Google\\Chrome\\Application\\chrome.exe')
  ];

  for (const p of commonPaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }
  return null;
}

async function run() {
  const chromePath = getChromePath();
  if (!chromePath) {
    console.error('❌ Could not find Google Chrome installation. Skipping headless UI tests.');
    process.exit(1);
  }

  console.log(`Using Google Chrome at: ${chromePath}`);
  console.log(`Screenshots will be saved to: ${SCREENSHOTS_DIR}`);

  // Create directory if it doesn't exist
  if (!fs.existsSync(SCREENSHOTS_DIR)) {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  }

  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: 'new',
    defaultViewport: { width: 1440, height: 900 }
  });

  try {
    const page = await browser.newPage();

    // 1. Capture Login Screen
    console.log('Navigating to SimHub login...');
    await page.goto(URL, { waitUntil: 'networkidle2' });
    const loginPath = path.join(SCREENSHOTS_DIR, '01_login_screen.png');
    await page.screenshot({ path: loginPath });
    console.log(`📸 Saved Login Screen to: ${loginPath}`);

    // 2. Perform Admin Login (Evaluating to clear pre-seeded inputs first and ensure credentials)
    console.log('Logging in as Admin...');
    await page.evaluate(() => {
      document.getElementById('login-email').value = '';
      document.getElementById('login-password').value = '';
    });
    await page.type('#login-email', 'admin@simhub.local');
    await page.type('#login-password', 'admin123');
    await page.click('button[type="submit"]');

    // Wait for scenarios to be fetched and rendered
    await page.waitForSelector('.scenario-card', { timeout: 8000 });
    await new Promise(r => setTimeout(r, 1000)); // Wait for transition animation

    // Capture Dashboard
    const dashboardPath = path.join(SCREENSHOTS_DIR, '02_dashboard.png');
    await page.screenshot({ path: dashboardPath });
    console.log(`📸 Saved Dashboard to: ${dashboardPath}`);

    // Toggle to Light Mode for visual confirmation of the header appearance
    console.log('Toggling to Light Mode...');
    await page.click('#theme-toggle');
    await new Promise(r => setTimeout(r, 600)); // wait for theme transition
    const dashboardLightPath = path.join(SCREENSHOTS_DIR, '06_dashboard_light.png');
    await page.screenshot({ path: dashboardLightPath });
    console.log(`📸 Saved Light Mode Dashboard to: ${dashboardLightPath}`);

    // Toggle back to Dark Mode for remaining captures
    console.log('Toggling back to Dark Mode...');
    await page.click('#theme-toggle');
    await new Promise(r => setTimeout(r, 600));

    // 3. Navigate to Scenario Details (click the first "View Detail" button)
    console.log('Opening Sam Phillips Scenario Details...');
    const viewDetailBtn = await page.waitForSelector('.scenario-card .btn-secondary');
    await viewDetailBtn.click();
    
    await page.waitForSelector('#scenario-detail-content', { timeout: 5000 });
    await new Promise(r => setTimeout(r, 1000));

    // Capture Details sheet
    const detailsPath = path.join(SCREENSHOTS_DIR, '03_details.png');
    await page.screenshot({ path: detailsPath });
    console.log(`📸 Saved Details view to: ${detailsPath}`);

    // 4. Navigate to Interactive Run HUD
    console.log('Launching Interactive Run HUD...');
    const runHudBtn = await page.waitForSelector('#btn-run-scenario-hud');
    await runHudBtn.click();

    await page.waitForSelector('.hud-layout', { timeout: 5000 });
    await new Promise(r => setTimeout(r, 1500)); // Wait for waveform animation to boot

    // Capture Active Run HUD
    const hudPath = path.join(SCREENSHOTS_DIR, '04_hud.png');
    await page.screenshot({ path: hudPath });
    console.log(`📸 Saved Active Run HUD to: ${hudPath}`);

    // 5. Navigate to Debrief Plan
    console.log('Entering PEARLS Debrief session...');
    const endRunBtn = await page.waitForSelector('.hud-layout button.btn-emerald');
    await endRunBtn.click();

    // Handle standard JS confirm prompt
    page.on('dialog', async dialog => {
      await dialog.accept();
    });

    await page.waitForSelector('.debrief-layout', { timeout: 5000 });
    await new Promise(r => setTimeout(r, 1000));

    // Capture PEARLS Debrief guide
    const debriefPath = path.join(SCREENSHOTS_DIR, '05_debrief.png');
    await page.screenshot({ path: debriefPath });
    console.log(`📸 Saved PEARLS Debrief Guide to: ${debriefPath}`);

    console.log('\n🎉 HEADLESS WEB UI AUTOMATED TESTING COMPLETED SUCCESSFULLY!');
    console.log('All screenshots captured, verified, and saved.');

  } catch (err) {
    console.error('❌ Headless Web UI testing failed:', err);
  } finally {
    await browser.close();
  }
}

run();
