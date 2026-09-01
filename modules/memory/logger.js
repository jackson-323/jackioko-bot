/**
 * MEMORY LOGGER - Specialized logging for the memory system
 */

const path = require('path');
const fs = require('fs-extra');

class MemoryLogger {
  constructor(memoryDir = null) {
    this.memoryDir = memoryDir || path.join(process.cwd(), 'database', 'memory', 'logs');
    this.logs = {
      memory: [],
      indexing: [],
      uploads: [],
      errors: [],
      performance: []
    };
    this.initialized = false;
  }

  /**
   * Initialize logger
   */
  async init() {
    try {
      await fs.ensureDir(this.memoryDir);
      this.initialized = true;
    } catch (error) {
      console.error('Memory logger initialization failed:', error);
    }
  }

  /**
   * Log memory event
   */
  log(category, message, metadata = {}) {
    if (!this.initialized) {
      fs.ensureDirSync(this.memoryDir);
      this.initialized = true;
    }

    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      category,
      message,
      ...metadata
    };

    // Keep in memory
    if (this.logs[category]) {
      this.logs[category].push(logEntry);
      // Keep only last 1000 entries per category
      if (this.logs[category].length > 1000) {
        this.logs[category].shift();
      }
    }

    // Write to file
    this._writeLog(category, logEntry);
  }

  /**
   * Log error
   */
  error(context, error, metadata = {}) {
    const errorEntry = {
      timestamp: new Date().toISOString(),
      context,
      message: error.message || String(error),
      stack: error.stack,
      ...metadata
    };

    this.logs.errors.push(errorEntry);
    if (this.logs.errors.length > 1000) {
      this.logs.errors.shift();
    }

    this._writeLog('errors', errorEntry);
  }

  /**
   * Log performance metrics
   */
  logPerformance(operation, durationMs, metadata = {}) {
    const perfEntry = {
      timestamp: new Date().toISOString(),
      operation,
      durationMs,
      ...metadata
    };

    this.logs.performance.push(perfEntry);
    if (this.logs.performance.length > 1000) {
      this.logs.performance.shift();
    }

    this._writeLog('performance', perfEntry);
  }

  /**
   * Log upload event
   */
  logUpload(file, status, metadata = {}) {
    const uploadEntry = {
      timestamp: new Date().toISOString(),
      file,
      status,
      ...metadata
    };

    this.logs.uploads.push(uploadEntry);
    if (this.logs.uploads.length > 1000) {
      this.logs.uploads.shift();
    }

    this._writeLog('uploads', uploadEntry);
  }

  /**
   * Get logs
   */
  getLogs(category = null, limit = 100) {
    if (category && this.logs[category]) {
      return this.logs[category].slice(-limit);
    }

    if (!category) {
      return {
        memory: this.logs.memory.slice(-limit),
        indexing: this.logs.indexing.slice(-limit),
        uploads: this.logs.uploads.slice(-limit),
        errors: this.logs.errors.slice(-limit),
        performance: this.logs.performance.slice(-limit)
      };
    }

    return [];
  }

  /**
   * Get recent errors
   */
  getRecentErrors(limit = 50) {
    return this.logs.errors.slice(-limit);
  }

  /**
   * Get performance summary
   */
  getPerformanceSummary() {
    if (this.logs.performance.length === 0) {
      return null;
    }

    const durations = this.logs.performance.map(p => p.durationMs);
    const sum = durations.reduce((a, b) => a + b, 0);
    const avg = sum / durations.length;
    const max = Math.max(...durations);
    const min = Math.min(...durations);

    return {
      totalOperations: durations.length,
      avgDurationMs: avg.toFixed(2),
      minDurationMs: min,
      maxDurationMs: max,
      totalDurationMs: sum
    };
  }

  /**
   * Clear logs
   */
  clearLogs(category = null) {
    if (category && this.logs[category]) {
      this.logs[category] = [];
    } else if (!category) {
      for (const key of Object.keys(this.logs)) {
        this.logs[key] = [];
      }
    }
  }

  /**
   * Helper: Write log to file
   */
  _writeLog(category, entry) {
    try {
      const today = new Date().toISOString().split('T')[0];
      const logFile = path.join(this.memoryDir, `${category}_${today}.json`);

      // This is async but we don't wait for it
      fs.ensureDir(this.memoryDir)
        .then(() => {
          let logs = [];
          if (fs.pathExistsSync(logFile)) {
            logs = fs.readJsonSync(logFile, { throws: false }) || [];
          }
          logs.push(entry);
          // Keep only last 10000 entries per file
          if (logs.length > 10000) {
            logs = logs.slice(-10000);
          }
          fs.writeJsonSync(logFile, logs, { spaces: 2 });
        })
        .catch(() => {
          // Fail silently
        });
    } catch (error) {
      // Fail silently
    }
  }

  /**
   * Export all logs
   */
  async exportLogs() {
    try {
      const exportData = {
        exportDate: new Date().toISOString(),
        logs: this.logs,
        summary: {
          totalMemoryEvents: this.logs.memory.length,
          totalIndexingEvents: this.logs.indexing.length,
          totalUploadEvents: this.logs.uploads.length,
          totalErrors: this.logs.errors.length,
          totalPerformanceMetrics: this.logs.performance.length,
          performanceSummary: this.getPerformanceSummary()
        }
      };

      return exportData;
    } catch (error) {
      return null;
    }
  }
}

module.exports = MemoryLogger;
