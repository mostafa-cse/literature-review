const { runUserCredentialsTestSuite } = require('./user_credentials_rbac.test');
const { runFullAppE2ETesting } = require('./full_app_e2e_testing.test');
const { runCollaborationTests } = require('./collaboration_rbac.test');
const { runDashboardTests } = require('./dashboard_features.test');
const { runSurveySettingsTests } = require('./survey_settings.test');
const runWorkspaceRolesSuite = require('./workspace_roles_rbac.test');

async function main() {
  console.log('======================================================================');
  console.log('🚀 LITNEXIS ACADEMIC PLATFORM - FULL AUTOMATED TEST SUITE RUNNER');
  console.log('======================================================================\n');

  try {
    console.log('▶️ [1/6] Running User Credentials & Multi-Role RBAC Unit Tests...');
    await runUserCredentialsTestSuite();

    console.log('\n▶️ [2/6] Running Dashboard Features & Multi-Role Unit/Integration Tests...');
    await runDashboardTests();

    console.log('\n▶️ [3/6] Running Workspace 4 Roles RBAC & Feature Verification Tests...');
    await runWorkspaceRolesSuite();

    console.log('\n▶️ [4/6] Running Full-App, Modals & API Integration Tests...');
    await runFullAppE2ETesting();

    console.log('\n▶️ [5/6] Running Collaboration Sub-Roles Tests...');
    await runCollaborationTests();

    console.log('\n▶️ [6/6] Running Survey Settings & Ownership Transfer Tests...');
    await runSurveySettingsTests();

    console.log('\n======================================================================');
    console.log('🏆 ALL 6 TEST SUITES COMPLETED SUCCESSFULLY WITH ZERO ERRORS!');
    console.log('======================================================================\n');
  } catch (err) {
    console.error('❌ Test suite runner encountered an error:', err);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { main };
