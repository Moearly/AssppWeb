/**
 * 管理员 API 客户端
 * 需要 x-admin-key 请求头
 */

// ============ 类型定义 ============

export interface PoolAccount {
  id: number;
  email: string;
  email_hash: string;
  country: string;
  device_identifier: string;
  status: 'active' | 'disabled' | 'expired' | 'error';
  usage_count: number;
  last_used_at: string | null;
  pod: string | null;
  created_at: string;
  updated_at: string;
}

export interface PoolStats {
  total: number;
  active: number;
  disabled: number;
  expired: number;
  byCountry: Record<string, number>;
}

export interface WhitelistApp {
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

export interface HealthLog {
  id: number;
  account_id: number;
  status: 'healthy' | 'token_expired' | 'locked' | 'error';
  message: string | null;
  checked_at: string;
}

export interface AddAccountRequest {
  email: string;
  password: string;
  country: string;
  deviceIdentifier: string;
}

export interface AddAppRequest {
  softwareId: number;
  bundleId: string;
  name: string;
  country: string;
  artworkUrl?: string;
  version?: string;
}

export interface UpdateAppRequest {
  name?: string;
  artworkUrl?: string;
  version?: string;
}

// ============ 配置 ============

let adminApiKey: string | null = null;

export function setAdminApiKey(key: string) {
  adminApiKey = key;
}

export function getAdminApiKey(): string | null {
  return adminApiKey;
}

function getHeaders(): Record<string, string> {
  if (!adminApiKey) {
    throw new Error('Admin API key not set. Please configure it in settings.');
  }
  return {
    'Content-Type': 'application/json',
    'x-admin-key': adminApiKey,
  };
}

async function fetchJSON<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, options);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `HTTP ${response.status}`);
  }
  return response.json();
}

// ============ 账号池管理 ============

export async function getPoolAccounts(filters?: {
  status?: string;
  country?: string;
}): Promise<PoolAccount[]> {
  const params = new URLSearchParams();
  if (filters?.status) params.append('status', filters.status);
  if (filters?.country) params.append('country', filters.country);

  const url = `/api/admin/pool/accounts${params.toString() ? `?${params}` : ''}`;
  return fetchJSON(url, { headers: getHeaders() });
}

export async function getPoolAccount(id: number): Promise<PoolAccount> {
  return fetchJSON(`/api/admin/pool/accounts/${id}`, { headers: getHeaders() });
}

export async function addPoolAccount(data: AddAccountRequest): Promise<PoolAccount> {
  return fetchJSON('/api/admin/pool/accounts', {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(data),
  });
}

export async function deletePoolAccount(id: number): Promise<void> {
  await fetch(`/api/admin/pool/accounts/${id}`, {
    method: 'DELETE',
    headers: getHeaders(),
  });
}

export async function updateAccountStatus(
  id: number,
  status: 'active' | 'disabled' | 'expired',
): Promise<void> {
  await fetch(`/api/admin/pool/accounts/${id}/status`, {
    method: 'PATCH',
    headers: getHeaders(),
    body: JSON.stringify({ status }),
  });
}

export async function checkAccountHealth(id: number): Promise<HealthLog> {
  return fetchJSON(`/api/admin/pool/accounts/${id}/health`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({}),
  });
}

export async function checkAllAccountsHealth(): Promise<{ checked: number }> {
  return fetchJSON('/api/admin/pool/health/check-all', {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({}),
  });
}

export async function getAccountHealthHistory(
  id: number,
  limit = 10,
): Promise<HealthLog[]> {
  return fetchJSON(
    `/api/admin/pool/accounts/${id}/health/history?limit=${limit}`,
    { headers: getHeaders() },
  );
}

export async function getPoolStats(): Promise<PoolStats> {
  return fetchJSON('/api/admin/pool/stats', { headers: getHeaders() });
}

// ============ 白名单管理 ============

export async function getWhitelistApps(filters?: {
  country?: string;
  enabled?: boolean;
}): Promise<WhitelistApp[]> {
  const params = new URLSearchParams();
  if (filters?.country) params.append('country', filters.country);
  if (filters?.enabled !== undefined) params.append('enabled', String(filters.enabled));

  const url = `/api/admin/whitelist/apps${params.toString() ? `?${params}` : ''}`;
  return fetchJSON(url, { headers: getHeaders() });
}

export async function addWhitelistApp(data: AddAppRequest): Promise<WhitelistApp> {
  return fetchJSON('/api/admin/whitelist/apps', {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(data),
  });
}

export async function updateWhitelistApp(
  id: number,
  data: UpdateAppRequest,
): Promise<void> {
  await fetch(`/api/admin/whitelist/apps/${id}`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify(data),
  });
}

export async function deleteWhitelistApp(id: number): Promise<void> {
  await fetch(`/api/admin/whitelist/apps/${id}`, {
    method: 'DELETE',
    headers: getHeaders(),
  });
}

export async function toggleWhitelistApp(id: number): Promise<void> {
  await fetch(`/api/admin/whitelist/apps/${id}/toggle`, {
    method: 'PATCH',
    headers: getHeaders(),
    body: JSON.stringify({}),
  });
}
