import { Injectable } from '@nestjs/common';
import { trace, SpanStatusCode } from '@opentelemetry/api';
import { logger } from '../../common/logger.js';
import { K8sClient } from './k8s-client.js';

const tracer = trace.getTracer('orchestrator.runner');

export type JobWatchOutcome =
  | { state: 'succeeded' }
  | {
      state: 'failed';
      reason: 'OOMKilled' | 'DeadlineExceeded' | 'BackoffLimitExceeded' | 'Failed';
      message?: string;
    }
  | { state: 'active' }
  | { state: 'not_found' };

/**
 * P3-16: Job watcher. Inspects Kubernetes Job conditions and container
 * termination reasons to classify outcomes (OOM, deadline exceeded, callback
 * loss handled by the orchestrator when a succeeded job never delivered).
 */
@Injectable()
export class JobWatcherService {
  constructor(private readonly k8s: K8sClient) {}

  async check(jobName: string): Promise<JobWatchOutcome> {
    return tracer.startActiveSpan('scan.k8s.watch', async (span) => {
      span.setAttribute('k8s.job_name', jobName);
      try {
        let status;
        try {
          status = await this.k8s.getJobStatus(jobName);
        } catch (error) {
          const err = error as { code?: number; response?: { statusCode?: number } };
          if (err.code === 404 || err.response?.statusCode === 404) {
            span.setStatus({ code: SpanStatusCode.OK });
            return { state: 'not_found' } as const;
          }
          throw error;
        }

        if (!status) {
          span.setStatus({ code: SpanStatusCode.OK });
          return { state: 'active' } as const;
        }

        if ((status.succeeded ?? 0) > 0) {
          span.setStatus({ code: SpanStatusCode.OK });
          return { state: 'succeeded' } as const;
        }

        if ((status.failed ?? 0) > 0) {
          const reason = normalizeReason(undefined);
          const outcome: JobWatchOutcome = { state: 'failed', reason };
          span.setAttribute('scan.failure_reason', reason);
          span.setStatus({ code: SpanStatusCode.OK });
          return outcome;
        }

        span.setStatus({ code: SpanStatusCode.OK });
        return { state: 'active' } as const;
      } catch (error) {
        logger.error({ err: error, jobName }, 'job watcher check failed');
        span.recordException(error as Error);
        span.setStatus({ code: SpanStatusCode.ERROR });
        throw error;
      } finally {
        span.end();
      }
    });
  }
}

function normalizeReason(
  reason?: string,
): 'OOMKilled' | 'DeadlineExceeded' | 'BackoffLimitExceeded' | 'Failed' {
  if (reason === 'DeadlineExceeded') return 'DeadlineExceeded';
  if (reason === 'BackoffLimitExceeded') return 'BackoffLimitExceeded';
  if (reason === 'OOMKilled') return 'OOMKilled';
  return 'Failed';
}
