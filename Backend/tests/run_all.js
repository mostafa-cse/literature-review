const { runUserCredentialsTestSuite } = require('./user_credentials_rbac.test');
const { runFullAppE2ETesting } = require('./full_app_e2e_testing.test');
const { runCollaborationTests } = require('./collaboration_rbac.test');
const { runDashboardTests } = require('./dashboard_features.test');
const { runSurveySettingsTests } = require('./survey_settings.test');
const { runClusterReorderTests } = require('./cluster_reorder.test');
const runWorkspaceRolesSuite = require('./workspace_roles_rbac.test');
const { runCachePhase6Tests } = require('./cache_phase6.test');
const { runQueuePhase7Tests } = require('./queue_phase7.test');
const { runValidationPhase8Tests } = require('./validation_phase8.test');
const { runMigrationPhase9Tests } = require('./migration_phase9.test');
const { runIntegrationPhase10Tests } = require('./integration_phase10.test');

async function main() {
  console.log('======================================================================');
  console.log('🚀 LITSPHERE ACADEMIC PLATFORM - FULL AUTOMATED TEST SUITE RUNNER');
  console.log('======================================================================\n');

  try {
    console.log('▶️ [1/12] Running User Credentials & Multi-Role RBAC Unit Tests...');
    await runUserCredentialsTestSuite();

    console.log('\n▶️ [2/12] Running Dashboard Features & Multi-Role Unit/Integration Tests...');
    await runDashboardTests();

    console.log('\n▶️ [3/12] Running Workspace 4 Roles RBAC & Feature Verification Tests...');
    await runWorkspaceRolesSuite();

    console.log('\n▶️ [4/12] Running Full-App, Modals & API Integration Tests...');
    await runFullAppE2ETesting();

    console.log('\n▶️ [5/12] Running Collaboration Sub-Roles Tests...');
    await runCollaborationTests();

    console.log('\n▶️ [6/12] Running Survey Settings & Ownership Transfer Tests...');
    await runSurveySettingsTests();

    console.log('\n▶️ [7/12] Running Cluster Repositioning & Reorder RBAC Tests...');
    await runClusterReorderTests();

    console.log('\n▶️ [8/12] Running High-Performance Redis Caching & Distributed Lock Tests...');
    await runCachePhase6Tests();

    console.log('\n▶️ [9/12] Running BullMQ Background Job Processing & Queue Architecture Tests...');
    await runQueuePhase7Tests();

    console.log('\n▶️ [10/12] Running Request Validation Layer (Zod + class-validator) Tests...');
    await runValidationPhase8Tests();

    console.log('\n▶️ [11/12] Running SQLite to PostgreSQL Migration & Seeding Tests...');
    await runMigrationPhase9Tests();

    console.log('\n▶️ [12/12] Running Enterprise Integration & Performance Benchmarks...');
    await runIntegrationPhase10Tests();

    console.log('\n======================================================================');
    console.log('🏆 ALL 12 TEST SUITES COMPLETED SUCCESSFULLY WITH ZERO ERRORS!');
    console.log('======================================================================\n');
  } catch (err) {
    console.error('❌ Test suite runner encountered an error:', err);
    process.exit(1);
  }
}

if (require.main === module) {
  main().then(() => {
    process.exit(0);
  });
}

module.exports = { main };
