const express = require('express');
const router = express.Router();
const { optionalAuth } = require('../utils/auth');

// Apply optional authentication context across all API routes
router.use(optionalAuth);

// Modular Purpose-Driven Sub-Routers
const projectRoutes = require('./projectRoutes');
const clusterRoutes = require('./clusterRoutes');
const columnRoutes = require('./columnRoutes');
const paperRoutes = require('./paperRoutes');
const synthesisRoutes = require('./synthesisRoutes');
const exportRoutes = require('./exportRoutes');
const uploadRoutes = require('./uploadRoutes');
const doiRoutes = require('./doiRoutes');
const templateRoutes = require('./templateRoutes');
const jobRoutes = require('./jobRoutes');

// Mount sub-routers
router.use(projectRoutes);
router.use(clusterRoutes);
router.use(columnRoutes);
router.use(paperRoutes);
router.use(synthesisRoutes);
router.use(exportRoutes);
router.use(uploadRoutes);
router.use(doiRoutes);
router.use(templateRoutes);
router.use(jobRoutes);

module.exports = router;
