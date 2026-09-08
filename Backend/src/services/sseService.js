const EventEmitter = require('events');
const crypto = require('crypto');

/**
 * In-process event bus for real-time telemetry streaming
 */
class SseEventEmitter extends EventEmitter {}
const sseEventBus = new SseEventEmitter();
// Increase listener cap for concurrent SSE client subscribers
sseEventBus.setMaxListeners(200);

/**
 * Server-Sent Events (SSE) Stream Manager
 * Manages active HTTP connections, streams real-time BullMQ job progress,
 * and handles keepalive heartbeats and client disconnects.
 */
class SseStreamManager {
  constructor() {
    // Map of jobId -> Set of client response objects
    this.jobSubscribers = new Map();
    // Map of batchId -> Set of client response objects
    this.batchSubscribers = new Map();

    // Setup 15-second keep-alive heartbeat
    this.heartbeatTimer = setInterval(() => {
      this.sendHeartbeat();
    }, 15000);
    if (this.heartbeatTimer.unref) {
      this.heartbeatTimer.unref();
    }

    // Subscribe to internal event bus
    sseEventBus.on('job:progress', ({ queueName, jobId, progress }) => {
      this.broadcastToJob(jobId, 'progress', progress);
    });

    sseEventBus.on('job:completed', ({ queueName, jobId, result }) => {
      this.broadcastToJob(jobId, 'completed', result);
      this.closeJobSubscribers(jobId);
    });

    sseEventBus.on('job:failed', ({ queueName, jobId, error }) => {
      this.broadcastToJob(jobId, 'failed', { error: error?.message || error || 'Job processing failed' });
      this.closeJobSubscribers(jobId);
    });

    sseEventBus.on('batch:progress', ({ batchId, progress }) => {
      this.broadcastToBatch(batchId, 'batch_progress', progress);
    });

    sseEventBus.on('batch:completed', ({ batchId, summary }) => {
      this.broadcastToBatch(batchId, 'batch_completed', summary);
      this.closeBatchSubscribers(batchId);
    });
  }

  /**
   * Set standard SSE response headers
   */
  initSseHeaders(res) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disables Nginx buffering for instant push
      'Access-Control-Allow-Origin': '*'
    });
    // Flush headers immediately if compression or buffering is active
    if (typeof res.flushHeaders === 'function') {
      res.flushHeaders();
    }
  }

  /**
   * Send a formatted SSE frame
   */
  sendEvent(res, eventName, data, id = null) {
    if (res.writableEnded || res.destroyed) return;
    try {
      if (id) res.write(`id: ${id}\n`);
      if (eventName) res.write(`event: ${eventName}\n`);
      const payload = typeof data === 'string' ? data : JSON.stringify(data);
      res.write(`data: ${payload}\n\n`);
    } catch (_) {}
  }

  /**
   * Send periodic heartbeat ping
   */
  sendHeartbeat() {
    const ping = ': keepalive\n\n';
    for (const clients of this.jobSubscribers.values()) {
      for (const res of clients) {
        if (!res.writableEnded && !res.destroyed) {
          try { res.write(ping); } catch (_) {}
        }
      }
    }
    for (const clients of this.batchSubscribers.values()) {
      for (const res of clients) {
        if (!res.writableEnded && !res.destroyed) {
          try { res.write(ping); } catch (_) {}
        }
      }
    }
  }

  /**
   * Register a subscriber for a specific job
   */
  addJobSubscriber(jobId, res) {
    const key = String(jobId);
    if (!this.jobSubscribers.has(key)) {
      this.jobSubscribers.set(key, new Set());
    }
    this.jobSubscribers.get(key).add(res);

    res.on('close', () => {
      const clients = this.jobSubscribers.get(key);
      if (clients) {
        clients.delete(res);
        if (clients.size === 0) {
          this.jobSubscribers.delete(key);
        }
      }
    });
  }

  /**
   * Register a subscriber for a batch of jobs
   */
  addBatchSubscriber(batchId, res) {
    const key = String(batchId);
    if (!this.batchSubscribers.has(key)) {
      this.batchSubscribers.set(key, new Set());
    }
    this.batchSubscribers.get(key).add(res);

    res.on('close', () => {
      const clients = this.batchSubscribers.get(key);
      if (clients) {
        clients.delete(res);
        if (clients.size === 0) {
          this.batchSubscribers.delete(key);
        }
      }
    });
  }

  /**
   * Broadcast an event to all subscribers of a job
   */
  broadcastToJob(jobId, eventName, data) {
    const key = String(jobId);
    const clients = this.jobSubscribers.get(key);
    if (!clients || clients.size === 0) return;

    for (const res of clients) {
      this.sendEvent(res, eventName, data);
    }
  }

  /**
   * Broadcast an event to all subscribers of a batch
   */
  broadcastToBatch(batchId, eventName, data) {
    const key = String(batchId);
    const clients = this.batchSubscribers.get(key);
    if (!clients || clients.size === 0) return;

    for (const res of clients) {
      this.sendEvent(res, eventName, data);
    }
  }

  /**
   * Gracefully close subscribers of a job once terminal state is reached
   */
  closeJobSubscribers(jobId) {
    const key = String(jobId);
    const clients = this.jobSubscribers.get(key);
    if (!clients) return;

    // Allow 100ms for final frames to flush before closing socket
    setTimeout(() => {
      for (const res of clients) {
        if (!res.writableEnded && !res.destroyed) {
          try { res.end(); } catch (_) {}
        }
      }
      this.jobSubscribers.delete(key);
    }, 100);
  }

  /**
   * Gracefully close subscribers of a batch
   */
  closeBatchSubscribers(batchId) {
    const key = String(batchId);
    const clients = this.batchSubscribers.get(key);
    if (!clients) return;

    setTimeout(() => {
      for (const res of clients) {
        if (!res.writableEnded && !res.destroyed) {
          try { res.end(); } catch (_) {}
        }
      }
      this.batchSubscribers.delete(key);
    }, 100);
  }

  /**
   * Emit progress from anywhere in backend services
   */
  emitJobProgress(queueName, jobId, progressData) {
    sseEventBus.emit('job:progress', { queueName, jobId, progress: progressData });
  }

  emitJobCompleted(queueName, jobId, resultData) {
    sseEventBus.emit('job:completed', { queueName, jobId, result: resultData });
  }

  emitJobFailed(queueName, jobId, errorData) {
    sseEventBus.emit('job:failed', { queueName, jobId, error: errorData });
  }

  emitBatchProgress(batchId, progressData) {
    sseEventBus.emit('batch:progress', { batchId, progress: progressData });
  }

  emitBatchCompleted(batchId, summaryData) {
    sseEventBus.emit('batch:completed', { batchId, summary: summaryData });
  }
}

const sseManager = new SseStreamManager();

module.exports = {
  sseManager,
  sseEventBus
};
