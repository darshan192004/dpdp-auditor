import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { KubeConfig } from '@kubernetes/client-node';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { K8sClient } from '../src/modules/runner/k8s-client.js';
import type { Env } from '../src/config/env.js';

let server: Server;
let client: K8sClient;
const requests: Array<{ method: string; url: string; contentType: string; body: string }> = [];

beforeAll(async () => {
  server = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += String(chunk);
    requests.push({
      method: req.method ?? '',
      url: req.url ?? '',
      contentType: req.headers['content-type'] ?? '',
      body,
    });
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        apiVersion: 'batch/v1',
        kind: 'Job',
        metadata: { name: 'scan-1' },
        status: { succeeded: 1 },
      }),
    );
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing test server port');
  const url = `http://127.0.0.1:${address.port}`;
  vi.spyOn(KubeConfig.prototype, 'loadFromDefault').mockImplementation(function (this: KubeConfig) {
    this.loadFromOptions({
      clusters: [{ name: 'test', server: url, skipTLSVerify: true }],
      users: [{ name: 'test' }],
      contexts: [{ name: 'test', cluster: 'test', user: 'test' }],
      currentContext: 'test',
    });
  });
  client = new K8sClient({ SCANNERS_NAMESPACE: 'scanners', RUNNER_IMAGE: 'test' } as Env);
});

afterAll(async () => {
  vi.restoreAllMocks();
  await new Promise<void>((resolve, reject) =>
    server.close((err) => (err ? reject(err) : resolve())),
  );
});

it('uses the installed SDK request/response contract across the runner lifecycle', async () => {
  await client.createSecret('scan-1', { TOKEN: 'YWJj' });
  const job = await client.createJob({ metadata: { name: 'scan-1' } });
  expect(job.metadata?.name).toBe('scan-1');
  await client.patchSecret('scan-1', { metadata: { labels: { scan: 'scan-1' } } });
  expect(await client.getJobStatus('scan-1')).toMatchObject({ succeeded: 1 });
  await client.deleteJob('scan-1');
  await client.deleteSecret('scan-1');
  expect(requests.map(({ method, url }) => [method, url])).toEqual([
    ['POST', '/api/v1/namespaces/scanners/secrets'],
    ['POST', '/apis/batch/v1/namespaces/scanners/jobs'],
    ['PATCH', '/api/v1/namespaces/scanners/secrets/scan-1'],
    ['GET', '/apis/batch/v1/namespaces/scanners/jobs/scan-1/status'],
    ['DELETE', '/apis/batch/v1/namespaces/scanners/jobs/scan-1'],
    ['DELETE', '/api/v1/namespaces/scanners/secrets/scan-1'],
  ]);
  // stringData lets the API server base64-encode arbitrary scan values (plain
  // refs, URLs and tokens), so no caller-controlled value is treated as base64.
  expect(JSON.parse(requests[0]!.body)).toMatchObject({ stringData: { TOKEN: 'YWJj' } });
  expect(requests[2]!.contentType).toBe('application/merge-patch+json');
  expect(JSON.parse(requests[2]!.body)).toEqual({ metadata: { labels: { scan: 'scan-1' } } });
});
