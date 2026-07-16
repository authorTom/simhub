const http = require('http');
const { ensureRotatedLogin } = require('./dev-helpers');

const PORT = process.env.PORT || 3000;
const BASE_URL = `http://localhost:${PORT}`;

// Helper to make HTTP requests in Node.js without external dependencies
function request(path, method = 'GET', body = null, token = null) {
  return new Promise((resolve, reject) => {
    const url = `${BASE_URL}${path}`;
    const headers = {
      'Content-Type': 'application/json'
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const options = {
      method,
      headers
    };

    const req = http.request(url, options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : {};
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: parsed
          });
        } catch (err) {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: data
          });
        }
      });
    });

    req.on('error', (err) => {
      reject(err);
    });

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runTests() {
  console.log('=== STARTING SIMHUB COMPREHENSIVE QA TEST ===\n');
  let testCount = 0;
  let passCount = 0;

  function assert(condition, message) {
    testCount++;
    if (condition) {
      passCount++;
      console.log(`✅ PASS: ${message}`);
    } else {
      console.error(`❌ FAIL: ${message}`);
    }
  }

  try {
    // -------------------------------------------------------------
    // TEST 1: Login as Admin
    // -------------------------------------------------------------
    // On a fresh install the seeded accounts are on a provisional password
    // that blocks all other endpoints; ensureRotatedLogin completes the
    // forced rotation (ending on the same documented password) so the rest
    // of the suite can exercise the API.
    console.log('Testing Admin Authentication...');
    const adminLoginRes = await ensureRotatedLogin(BASE_URL, 'admin@simhub.local', 'admin123');
    
    assert(adminLoginRes.status === 200, 'Admin login returns 200 OK');
    assert(adminLoginRes.body.token !== undefined, 'Admin login returns a session token');
    assert(adminLoginRes.body.user.role === 'Admin', 'Admin user profile has "Admin" role');
    
    const adminToken = adminLoginRes.body.token;

    // -------------------------------------------------------------
    // TEST 2: Login as Read-Only Faculty
    // -------------------------------------------------------------
    console.log('\nTesting Faculty Authentication...');
    const facultyLoginRes = await ensureRotatedLogin(BASE_URL, 'faculty@simhub.local', 'faculty123');
    
    assert(facultyLoginRes.status === 200, 'Faculty login returns 200 OK');
    assert(facultyLoginRes.body.token !== undefined, 'Faculty login returns a session token');
    assert(facultyLoginRes.body.user.role === 'Read-Only', 'Faculty user profile has "Read-Only" role');
    
    const facultyToken = facultyLoginRes.body.token;

    // -------------------------------------------------------------
    // TEST 3: Login with Invalid Credentials
    // -------------------------------------------------------------
    console.log('\nTesting Invalid Authentication...');
    const invalidLoginRes = await request('/api/login', 'POST', {
      email: 'admin@simhub.local',
      password: 'wrongpassword'
    });
    assert(invalidLoginRes.status === 401, 'Invalid login is rejected with 401 Unauthorized');

    // -------------------------------------------------------------
    // TEST 4: Fetch Scenarios (Admin)
    // -------------------------------------------------------------
    console.log('\nTesting Scenario Retrieval (Admin)...');
    const getScenariosRes = await request('/api/scenarios', 'GET', null, adminToken);
    assert(getScenariosRes.status === 200, 'Retrieving scenarios returns 200 OK');
    assert(Array.isArray(getScenariosRes.body), 'Scenarios list is an array');
    assert(getScenariosRes.body.length > 0, 'Scenarios array is pre-seeded with Sam Phillips scenario');
    assert(getScenariosRes.body.some(s => s.code === 'UHB-UG-PE-01'), 'Sam Phillips scenario code exists in lists');

    // -------------------------------------------------------------
    // TEST 5: Create Scenario (Admin - Full CRUD)
    // -------------------------------------------------------------
    console.log('\nTesting Scenario Creation (Admin)...');
    const newScenario = {
      id: 'scenario_qa_test',
      code: 'QA-TEST-01',
      title: 'QA Test Emergency Scenario',
      version: '1.0',
      lastReviewed: '27/05/2026',
      nextReviewDue: '27/05/2029',
      overview: {
        summary: 'A test case designed for programmatic verification.',
        targetLearners: 'QA Engineers',
        modality: 'Virtual Simulation',
        duration: 10,
        debriefDuration: 15,
        totalSessionTime: 30
      }
    };

    const createRes = await request('/api/scenarios', 'POST', newScenario, adminToken);
    assert(createRes.status === 201 || createRes.status === 200, 'Creating scenario returns successful status (201 Created)');
    assert(createRes.body.code === 'QA-TEST-01', 'Created scenario code matches payload');

    // -------------------------------------------------------------
    // TEST 6: Fetch Newly Created Scenario Detail
    // -------------------------------------------------------------
    console.log('\nTesting Scenario Fetch Details...');
    const detailRes = await request('/api/scenarios/scenario_qa_test', 'GET', null, adminToken);
    assert(detailRes.status === 200, 'Fetching specific scenario returns 200 OK');
    assert(detailRes.body.title === 'QA Test Emergency Scenario', 'Fetched scenario title matches');

    // -------------------------------------------------------------
    // TEST 7: Edit Scenario (Admin - Update)
    // -------------------------------------------------------------
    console.log('\nTesting Scenario Update (Admin)...');
    const updatedScenario = {
      ...detailRes.body,
      title: 'QA Test Emergency Scenario (UPDATED)',
      overview: {
        ...detailRes.body.overview,
        duration: 20 // Change duration
      }
    };

    const updateRes = await request('/api/scenarios/scenario_qa_test', 'PUT', updatedScenario, adminToken);
    assert(updateRes.status === 200, 'Updating scenario returns 200 OK');
    assert(updateRes.body.title === 'QA Test Emergency Scenario (UPDATED)', 'Updated title matches');
    assert(updateRes.body.overview.duration === 20, 'Updated duration matches');

    // Verify it is persistent
    const verifyUpdateRes = await request('/api/scenarios/scenario_qa_test', 'GET', null, adminToken);
    assert(verifyUpdateRes.body.title === 'QA Test Emergency Scenario (UPDATED)', 'Persistence check: Updated title matches');

    // -------------------------------------------------------------
    // TEST 8: Role Protection (Faculty attempting CRUD edits)
    // -------------------------------------------------------------
    console.log('\nTesting Role Restrictions (Faculty)...');
    // Attempt Create
    const facultyCreateRes = await request('/api/scenarios', 'POST', {
      id: 'scenario_faculty_hack',
      code: 'HACK-01',
      title: 'Should fail'
    }, facultyToken);
    assert(facultyCreateRes.status === 403, 'Faculty scenario creation is blocked with 403 Forbidden');

    // Attempt Update
    const facultyUpdateRes = await request('/api/scenarios/scenario_qa_test', 'PUT', {
      ...updatedScenario,
      title: 'Hacked title'
    }, facultyToken);
    assert(facultyUpdateRes.status === 403, 'Faculty scenario update is blocked with 403 Forbidden');

    // Attempt Delete
    const facultyDeleteRes = await request('/api/scenarios/scenario_qa_test', 'DELETE', null, facultyToken);
    assert(facultyDeleteRes.status === 403, 'Faculty scenario deletion is blocked with 403 Forbidden');

    // -------------------------------------------------------------
    // TEST 9: Delete Scenario (Admin)
    // -------------------------------------------------------------
    console.log('\nTesting Scenario Deletion (Admin)...');
    const deleteRes = await request('/api/scenarios/scenario_qa_test', 'DELETE', null, adminToken);
    assert(deleteRes.status === 200, 'Deleting scenario returns 200 OK');
    assert(deleteRes.body.success === true, 'Delete response body reports success');

    // Verify deletion
    const verifyDeleteRes = await request('/api/scenarios/scenario_qa_test', 'GET', null, adminToken);
    assert(verifyDeleteRes.status === 404, 'Persistence check: Deleted scenario returns 404 Not Found');

    // -------------------------------------------------------------
    // TEST 10: Export Backups (Admin)
    // -------------------------------------------------------------
    console.log('\nTesting Backup Export (Admin)...');
    const exportAdminRes = await request('/api/backup/export', 'GET', null, adminToken);
    assert(exportAdminRes.status === 200, 'Exporting backups returns 200 OK');
    assert(exportAdminRes.body.source === 'SimHub', 'Exported backup reports correct source');
    assert(Array.isArray(exportAdminRes.body.scenarios), 'Exported backup contains a scenarios array');
    assert(exportAdminRes.body.scenarios.length > 0, 'Exported backup contains at least one scenario');
    assert(exportAdminRes.body.scenarios.some(s => s.id === 'scenario_sam_phillips'), 'Exported backup has Sam Phillips scenario');

    // Save the backup for the import test
    const backupPayload = exportAdminRes.body;

    // -------------------------------------------------------------
    // TEST 11: Export Backups (Faculty - Blocked)
    // -------------------------------------------------------------
    console.log('\nTesting Backup Export Role Restrictions (Faculty)...');
    const exportFacultyRes = await request('/api/backup/export', 'GET', null, facultyToken);
    assert(exportFacultyRes.status === 403, 'Faculty backup export is blocked with 403 Forbidden');

    // -------------------------------------------------------------
    // TEST 12: Import Backups (Faculty - Blocked)
    // -------------------------------------------------------------
    console.log('\nTesting Backup Import Role Restrictions (Faculty)...');
    const importFacultyRes = await request('/api/backup/import', 'POST', backupPayload, facultyToken);
    assert(importFacultyRes.status === 403, 'Faculty backup import is blocked with 403 Forbidden');

    // -------------------------------------------------------------
    // TEST 13: Import Backups (Admin)
    // -------------------------------------------------------------
    console.log('\nTesting Backup Import (Admin)...');
    
    // Add a unique scenario to the backup payload to test import persistence
    const testImportScenario = {
      id: 'scenario_imported_test',
      code: 'IMPORT-TEST-01',
      title: 'Imported Test Scenario',
      version: '1.2',
      lastReviewed: '29/05/2026',
      nextReviewDue: '29/05/2029',
      overview: {
        summary: 'A programmatic scenario to verify backup imports.',
        targetLearners: 'System Admins',
        modality: 'Unit Test',
        duration: 5,
        debriefDuration: 10,
        totalSessionTime: 15
      }
    };
    
    const modifiedBackupPayload = {
      ...backupPayload,
      scenarios: [...backupPayload.scenarios, testImportScenario]
    };

    const importAdminRes = await request('/api/backup/import', 'POST', modifiedBackupPayload, adminToken);
    assert(importAdminRes.status === 200, 'Importing backup returns 200 OK');
    assert(importAdminRes.body.success === true, 'Import reports success');
    assert(importAdminRes.body.count > 1, 'Import reports that multiple scenarios were imported');

    // Verify imported scenario is readable from endpoints
    const verifyImportRes = await request('/api/scenarios/scenario_imported_test', 'GET', null, adminToken);
    assert(verifyImportRes.status === 200, 'Fetching newly imported scenario returns 200 OK');
    assert(verifyImportRes.body.title === 'Imported Test Scenario', 'Imported scenario details match database exactly');

    // Clean up: delete imported test scenario
    await request('/api/scenarios/scenario_imported_test', 'DELETE', null, adminToken);
    await request('/api/recycle-bin/scenario_imported_test', 'DELETE', null, adminToken);

    // -------------------------------------------------------------
    // SUMMARY OF INTEGRATION TEST
    // -------------------------------------------------------------
    console.log('\n=== QA INTEGRATION TEST COMPLETE ===');
    console.log(`Total tests run: ${testCount}`);
    console.log(`Passed: ${passCount} / ${testCount}`);
    
    if (passCount === testCount) {
      console.log('\n🎉 ALL TESTS PASSED SUCCESSFULLY!');
      process.exit(0);
    } else {
      console.error('\n⚠️ SOME TESTS FAILED! PLEASE CHECK BUGS.');
      process.exit(1);
    }

  } catch (err) {
    console.error('QA Test execution crashed:', err);
    process.exit(1);
  }
}

runTests();
