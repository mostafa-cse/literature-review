const { runUserCredentialsTestSuite } = require('./user_credentials_rbac.test');
const { runFullAppE2ETesting } = require('./full_app_e2e_testing.test');
const { runCollaborationTests } = require('./collaboration_rbac.test');
const { runDashboardTests } = require('./dashboard_features.test');
const { runSurveySettingsTests } = require('./survey_settings.test');
const { runClusterReorderTests } = require('./cluster_reorder.test');
const runWorkspaceRolesSuite = require('./workspace_roles_rbac.test');

async function main() {
  console.log('======================================================================');
  console.log('🚀 LITSPHERE ACADEMIC PLATFORM - FULL AUTOMATED TEST SUITE RUNNER');
  console.log('======================================================================\n');

  try {
    console.log('▶️ [1/7] Running User Credentials & Multi-Role RBAC Unit Tests...');
    await runUserCredentialsTestSuite();

    console.log('\n▶️ [2/7] Running Dashboard Features & Multi-Role Unit/Integration Tests...');
    await runDashboardTests();

    console.log('\n▶️ [3/7] Running Workspace 4 Roles RBAC & Feature Verification Tests...');
    await runWorkspaceRolesSuite();

    console.log('\n▶️ [4/7] Running Full-App, Modals & API Integration Tests...');
    await runFullAppE2ETesting();

    console.log('\n▶️ [5/7] Running Collaboration Sub-Roles Tests...');
    await runCollaborationTests();

    console.log('\n▶️ [6/7] Running Survey Settings & Ownership Transfer Tests...');
    await runSurveySettingsTests();

    console.log('\n▶️ [7/7] Running Cluster Repositioning & Reorder RBAC Tests...');
    await runClusterReorderTests();

    console.log('\n======================================================================');
    console.log('🏆 ALL 7 TEST SUITES COMPLETED SUCCESSFULLY WITH ZERO ERRORS!');
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
