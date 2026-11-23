/**
 * Shapes the internal orchestrator create-scan result into the public
 * `docs/api.md` §3.1 response. The orchestrator uses `scanId`; the documented
 * web API (and the browser client) use `data.id`.
 */
export interface UpstreamScanCreated {
  scanId: string;
  status: string;
  createdAt: string;
  replayed?: boolean;
}

export interface ScanCreateSource {
  repositoryId?: string;
  githubUrl?: string;
  ref?: string;
  profile?: string;
}

export interface CreatedScanResponse {
  data: {
    id: string;
    replayed?: boolean;
    repositoryId?: string;
    githubUrl?: string;
    status: string;
    ref?: string;
    profile?: string;
    createdAt: string;
    links: {
      self: string;
      findings: string;
      events: string;
    };
  };
}

export function shapeCreatedScan(
  upstream: UpstreamScanCreated,
  source: ScanCreateSource,
): CreatedScanResponse {
  const id = upstream.scanId;
  return {
    data: {
      id,
      ...(upstream.replayed === undefined ? {} : { replayed: upstream.replayed }),
      ...(source.repositoryId ? { repositoryId: source.repositoryId } : {}),
      ...(source.githubUrl ? { githubUrl: source.githubUrl } : {}),
      status: upstream.status,
      ...(source.ref ? { ref: source.ref } : {}),
      ...(source.profile ? { profile: source.profile } : {}),
      createdAt: upstream.createdAt,
      links: {
        self: `/api/v1/scan/${id}`,
        findings: `/api/v1/scan/${id}/findings`,
        events: `/api/v1/scan/${id}/events`,
      },
    },
  };
}
