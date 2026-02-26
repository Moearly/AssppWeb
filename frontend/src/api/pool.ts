/**
 * 账号池模式用户端 API
 * 普通用户使用，无需认证
 */

export interface PoolApp {
  id: number;
  software_id: number;
  bundle_id: string;
  name: string;
  country: string;
  artwork_url: string | null;
  version: string | null;
  enabled: number;
  created_at: string;
  updated_at: string;
}

export interface QuickDownloadRequest {
  softwareId: number;
  bundleId: string;
  country: string;
}

export interface QuickDownloadResponse {
  taskId: string;
  message: string;
}

async function fetchJSON<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, options);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `HTTP ${response.status}`);
  }
  return response.json();
}

/**
 * 获取可下载的应用列表（白名单）
 */
export async function getPoolApps(country?: string): Promise<PoolApp[]> {
  const url = country ? `/api/user/apps?country=${country}` : '/api/user/apps';
  return fetchJSON(url);
}

/**
 * 一键下载应用（使用账号池）
 */
export async function quickDownload(
  data: QuickDownloadRequest,
): Promise<QuickDownloadResponse> {
  return fetchJSON('/api/user/quick-download', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}
