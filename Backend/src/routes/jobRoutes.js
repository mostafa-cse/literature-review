const express = require('express');
const router = express.Router();
const queueService = require('../services/queueService');
const { validateRequest, jobParamSchema, exportTokenParamSchema } = require('../validation');

// ======================================================================
// BULLMQ JOB STATUS TRACKING, RETRY & DEAD-LETTER QUEUE (DLQ) APIS
// ======================================================================

/**
 * GET /api/jobs/stats
 * Telemetry and aggregated metrics across all background worker queues
 */
router.get('/jobs/stats', async (req, res) => {
  try {
    const stats = await queueService.getQueueStats();
    res.json({
      success: true,
      queues: stats,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/jobs/:queueName/failed
 * Dead-Letter Queue (DLQ) Inspector - retrieves list of failed jobs
 */
router.get('/jobs/:queueName/failed', async (req, res) => {
  try {
    const { queueName } = req.params;
    const start = parseInt(req.query.start || '0', 10);
    const end = parseInt(req.query.end || '50', 10);

    const failedJobs = await queueService.getFailedJobs(queueName, start, end);
    res.json({
      success: true,
      queue: queueName,
      count: failedJobs.length,
      failedJobs,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/jobs/:queueName/:jobId
 * Real-time job status tracking, state, progress percentage, and results
 */
router.get('/jobs/:queueName/:jobId', validateRequest({ params: jobParamSchema }), async (req, res) => {
  try {
    const { queueName, jobId } = req.params;
    const job = await queueService.getJob(queueName, jobId);

    if (!job) {
      return res.status(404).json({
        error: `Job #${jobId} not found in queue '${queueName}'`,
      });
    }

    res.json({
      success: true,
      job,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/jobs/:queueName/:jobId/retry
 * Re-enqueues / retries a failed job in the Dead-Letter Queue
 */
router.post('/jobs/:queueName/:jobId/retry', validateRequest({ params: jobParamSchema }), async (req, res) => {
  try {
    const { queueName, jobId } = req.params;
    const result = await queueService.retryFailedJob(queueName, jobId);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * DELETE /api/jobs/:queueName/:jobId
 * Cancels and removes a job from the queue
 */
router.delete('/jobs/:queueName/:jobId', validateRequest({ params: jobParamSchema }), async (req, res) => {
  try {
    const { queueName, jobId } = req.params;
    const result = await queueService.removeJob(queueName, jobId);
    if (!result.success) {
      return res.status(result.reason === 'Job not found' ? 404 : 400).json(result);
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/export/download/:exportToken
 * Secure download endpoint for asynchronous citation exports
 */
router.get('/export/download/:exportToken', validateRequest({ params: exportTokenParamSchema }), async (req, res) => {
  try {
    const { exportToken } = req.params;
    const artifact = await queueService.getExportArtifact(exportToken);

    if (!artifact) {
      return res.status(404).json({
        error: 'Export file not found or has expired (exports expire after 1 hour).',
      });
    }

    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(artifact.filename)}"`);
    res.setHeader('Content-Type', artifact.mimetype || 'application/octet-stream');
    res.setHeader('Content-Length', artifact.buffer.length);
    res.send(artifact.buffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
