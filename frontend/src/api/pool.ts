/**
 * 账号池 API 客户端（用户端）
 * 用于获取和释放池账号
 */

export interface PoolAccountCredentials {
  accountId: number;
  email: string;
  password: string;
  deviceIdentifier: string;
  country: string;
  pod: number | null;
  passwordToken?: string;
  DSID?: string;
  cookies?: Record<string, string>;
  verificationCodeApi?: string | null;
}

/**
 * 分配账号（获取池账号凭据）
 */
export async function allocatePoolAccount(country?: string): Promise<PoolAccountCredentials> {
  const response = await fetch('/api/pool/allocate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ country }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || error.error || 'Failed to allocate account');
  }

  return response.json();
}

/**
 * 释放账号
 */
export async function releasePoolAccount(accountId: number): Promise<void> {
  const response = await fetch(`/api/pool/release/${accountId}`, {
    method: 'POST',
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to release account');
  }
}

/**
 * 更新账号凭据（认证成功后回传）
 */
export async function updatePoolAccountCredentials(
  accountId: number,
  credentials: {
    passwordToken?: string;
    DSID?: string;
    cookies?: Record<string, string>;
    pod?: number;
  }
): Promise<void> {
  const response = await fetch(`/api/pool/update-credentials/${accountId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Failed to update credentials');
  }
}
