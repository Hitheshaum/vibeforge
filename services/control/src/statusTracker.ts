/**
 * In-memory status tracking for long-running operations
 */

export interface StatusUpdate {
  step: string;
  message: string;
  timestamp: Date;
  completed: boolean;
}

export interface JobStatus {
  jobId: string;
  status: 'in_progress' | 'completed' | 'failed';
  updates: StatusUpdate[];
  result?: any;
  error?: string;
}

class StatusTracker {
  private jobs: Map<string, JobStatus> = new Map();

  createJob(jobId: string): void {
    this.jobs.set(jobId, {
      jobId,
      status: 'in_progress',
      updates: [],
    });
  }

  addUpdate(jobId: string, step: string, message: string, completed: boolean = false): void {
    const job = this.jobs.get(jobId);
    if (!job) return;

    job.updates.push({
      step,
      message,
      timestamp: new Date(),
      completed,
    });
  }

  completeJob(jobId: string, result: any): void {
    const job = this.jobs.get(jobId);
    if (!job) return;

    job.status = 'completed';
    job.result = result;
  }

  failJob(jobId: string, error: string): void {
    const job = this.jobs.get(jobId);
    if (!job) return;

    job.status = 'failed';
    job.error = error;
  }

  getStatus(jobId: string): JobStatus | undefined {
    return this.jobs.get(jobId);
  }

  cleanup(jobId: string): void {
    // Keep completed/failed jobs for 1 hour
    setTimeout(() => {
      this.jobs.delete(jobId);
    }, 3600000);
  }
}

export const statusTracker = new StatusTracker();
