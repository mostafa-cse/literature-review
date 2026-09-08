const express = require('express');
const router = express.Router();
const queueService = require('../services/queueService');
const { sseManager } = require('../services/sseService');
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
 * GET /api/jobs/stream/batch
 * Multi-job SSE streaming channel for bulk uploads
 * Query params: ?job_ids=1,2,3&queue=pdf-processing-queue
 */
router.get('/jobs/stream/batch', async (req, res) => {
  try {
    const rawIds = req.query.job_ids || req.query.jobs || '';
    const queueName = req.query.queue || queueService.QUEUES.PDF_PROCESSING;
    const jobIds = String(rawIds).split(',').map(s => s.trim()).filter(Boolean);

    if (jobIds.length === 0) {
      return res.status(400).json({ error: 'job_ids query parameter required' });
    }

    sseManager.initSseHeaders(res);

    // Send initial status for all requested jobs
    const initialStatuses = [];
    for (const jid of jobIds) {
      const j = await queueService.getJob(queueName, jid);
      if (j) {
        initialStatuses.push({
          jobId: jid,
          state: j.state,
          progress: j.progress
        });
        if (j.state !== 'completed' && j.state !== 'failed') {
          sseManager.addJobSubscriber(jid, res);
        }
      }
    }

    sseManager.sendEvent(res, 'batch_init', {
      count: jobIds.length,
      jobs: initialStatuses,
      timestamp: new Date().toISOString()
    });

    // If all jobs are already terminated, end stream
    const allDone = initialStatuses.length === jobIds.length && initialStatuses.every(s => s.state === 'completed' || s.state === 'failed');
    if (allDone) {
      return res.end();
    }
  } catch (err) {
    console.error('Batch SSE stream error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    } else {
      res.end();
    }
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
 * GET /api/jobs/:queueName/:jobId/stream
 * Real-time Server-Sent Events (SSE) stream for step-by-step job progress
 */
router.get('/jobs/:queueName/:jobId/stream', validateRequest({ params: jobParamSchema }), async (req, res) => {
  try {
    const { queueName, jobId } = req.params;
    const job = await queueService.getJob(queueName, jobId);

    if (!job) {
      return res.status(404).json({
        error: `Job #${jobId} not found in queue '${queueName}'`,
      });
    }

    // Initialize SSE headers
    sseManager.initSseHeaders(res);

    // Send initial snapshot frame
    sseManager.sendEvent(res, 'status', {
      jobId,
      queueName,
      state: job.state,
      progress: job.progress,
      failedReason: job.failedReason,
      returnValue: job.returnValue || job.returnvalue || null,
      timestamp: new Date().toISOString()
    });

    // If job has already completed or failed, close stream immediately
    if (job.state === 'completed') {
      sseManager.sendEvent(res, 'completed', job.returnValue || job.returnvalue || job);
      return res.end();
    } else if (job.state === 'failed') {
      sseManager.sendEvent(res, 'failed', { error: job.failedReason || 'Job failed' });
      return res.end();
    }

    // Register active client for real-time push
    sseManager.addJobSubscriber(jobId, res);
  } catch (err) {
    console.error('Job SSE stream error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    } else {
      res.end();
    }
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
