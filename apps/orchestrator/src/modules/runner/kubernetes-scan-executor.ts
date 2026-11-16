import { trace, SpanStatusCode } from '@opentelemetry/api';
import { K8sClient } from './k8s-client.js';
import type { ScanExecutor } from './scan-executor.js';
import type { V1Job, V1JobSpec, V1PodTemplateSpec } from '@kubernetes/client-node';

const tracer = trace.getTracer('orchestrator.runner');

/**
 * Kubernetes implementation of ScanExecutor. Creates a Job with
 * architecture.md §6.2 invariants, patches ownerReference, and cleans up on failure.
 */
export class KubernetesScanExecutor implements ScanExecutor {
  constructor(private readonly k8s: K8sClient) {}

  async run(
    jobName: string,
    scanId: string,
    orgId: string,
    secretData: Record<string, string>,
  ): Promise<string> {
    return tracer.startActiveSpan('scan.k8s.create', async (span): Promise<string> => {
      span.setAttribute('scan.id', scanId);
      span.setAttribute('scan.org_id', orgId);
      span.setAttribute('k8s.job_name', jobName);
      try {
        // create secret
        await this.k8s.createSecret(jobName, secretData);

        // build job spec per architecture.md §6.2
        const jobSpec: V1Job = {
          metadata: {
            name: jobName,
            labels: {
              'app.kubernetes.io/name': 'scan-runner',
              'dpdpa.io/scan-id': scanId,
              'dpdpa.io/org-id': orgId,
            },
          },
          spec: {
            backoffLimit: 0,
            activeDeadlineSeconds: 900,
            ttlSecondsAfterFinished: 300,
            template: {
              metadata: {
                annotations: {
                  'sidecar.istio.io/inject': 'false',
                },
              },
              spec: {
                runtimeClassName: 'gvisor',
                restartPolicy: 'Never',
                automountServiceAccountToken: false,
                nodeSelector: {
                  workload: 'scanner',
                },
                tolerations: [
                  {
                    key: 'workload',
                    operator: 'Equal',
                    value: 'scanner',
                    effect: 'NoSchedule',
                  },
                ],
                securityContext: {
                  runAsNonRoot: true,
                  runAsUser: 10001,
                  runAsGroup: 10001,
                  fsGroup: 10001,
                  seccompProfile: {
                    type: 'RuntimeDefault',
                  },
                },
                containers: [
                  {
                    name: 'runner',
                    image: this.k8s.runnerImage,
                    imagePullPolicy: 'IfNotPresent',
                    command: ['/usr/local/bin/run-scan'],
                    envFrom: [
                      {
                        secretRef: {
                          name: jobName,
                        },
                      },
                    ],
                    env: [
                      {
                        name: 'SCAN_ID',
                        value: scanId,
                      },
                      {
                        name: 'ORCHESTRATOR_URL',
                        value: 'https://orchestrator.internal',
                      },
                    ],
                    resources: {
                      requests: {
                        cpu: '1',
                        memory: '2Gi',
                        'ephemeral-storage': '2Gi',
                      },
                      limits: {
                        cpu: '2',
                        memory: '4Gi',
                        'ephemeral-storage': '6Gi',
                      },
                    },
                    securityContext: {
                      allowPrivilegeEscalation: false,
                      readOnlyRootFilesystem: true,
                      capabilities: {
                        drop: ['ALL'],
                      },
                    },
                    volumeMounts: [
                      { name: 'workspace', mountPath: '/workspace' },
                      { name: 'tmp', mountPath: '/tmp' },
                      { name: 'cache', mountPath: '/home/scanner/.cache' },
                    ],
                  },
                ],
                volumes: [
                  { name: 'workspace', emptyDir: { sizeLimit: '6Gi' } },
                  { name: 'tmp', emptyDir: { sizeLimit: '512Mi' } },
                  { name: 'cache', emptyDir: { sizeLimit: '512Mi' } },
                ],
              },
            } as V1PodTemplateSpec,
          } as V1JobSpec,
        };

        try {
          // create job
          const jobMeta = await this.k8s.createJob(jobSpec);

          // patch secret with ownerReference to job
          const jobNameFinal = jobMeta.metadata?.name ?? jobName;
          await this.k8s.patchSecret(jobName, {
            metadata: {
              ownerReferences: [
                {
                  apiVersion: 'batch/v1',
                  kind: 'Job',
                  name: jobNameFinal,
                  uid: jobMeta.metadata?.uid ?? '',
                },
              ],
            },
          });

          span.setStatus({ code: SpanStatusCode.OK });
          return String(jobNameFinal);
        } catch (error) {
          // cleanup secret on job creation failure (architecture.md §7.2)
          await this.k8s.deleteSecret(jobName).catch(() => {
            // ignore cleanup errors
          });
          throw error;
        }
      } catch (error) {
        span.recordException(error as Error);
        span.setStatus({ code: SpanStatusCode.ERROR });
        throw error;
      } finally {
        span.end();
      }
    });
  }
}
