import { getDatabase } from '../db/index.js';
import {
  encryptCredentials,
  decryptCredentials,
  hashEmail,
  type AccountCredentials,
} from './encryption.js';
import type Database from 'better-sqlite3';

/**
 * 账号池记录（数据库）
 */
export interface PoolAccount {
  id: number;
  email: string;
  emailHash: string;
  encryptedData: string;
  country: string;
  deviceIdentifier: string;
  pod: number | null;
  status: 'active' | 'disabled' | 'expired' | 'error';
  lastUsedAt: string | null;
  usageCount: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * 完整账号信息（包含解密的凭据）
 */
export interface FullAccount extends Omit<PoolAccount, 'encryptedData'> {
  credentials: AccountCredentials;
}

/**
 * 添加账号参数
 */
export interface AddAccountParams {
  email: string;
  password: string;
  passwordToken?: string;
  cookies?: Record<string, string>;
  DSID?: string;
  country: string;
  deviceIdentifier: string;
  pod?: number;
}

/**
 * 账号池管理服务
 */
export class AccountPoolService {
  public db: Database.Database;  // 改为 public 以便直接访问

  constructor() {
    this.db = getDatabase();
  }

  /**
   * 添加账号到池
   */
  addAccount(params: AddAccountParams): PoolAccount {
    const emailHash = hashEmail(params.email);

    // 检查是否已存在
    const existing = this.db
      .prepare('SELECT id FROM account_pool WHERE email_hash = ?')
      .get(emailHash);

    if (existing) {
      throw new Error(`Account ${params.email} already exists in pool`);
    }

    // 加密凭据
    const credentials: AccountCredentials = {
      password: params.password,
      passwordToken: params.passwordToken,
      cookies: params.cookies,
      DSID: params.DSID,
    };
    const encryptedData = encryptCredentials(credentials);

    // 插入数据库
    const stmt = this.db.prepare(`
      INSERT INTO account_pool (
        email, email_hash, encrypted_data, country, device_identifier, pod, status
      ) VALUES (?, ?, ?, ?, ?, ?, 'active')
    `);

    const result = stmt.run(
      params.email,
      emailHash,
      encryptedData,
      params.country,
      params.deviceIdentifier,
      params.pod || null
    );

    return this.getAccountById(result.lastInsertRowid as number)!;
  }

  /**
   * 根据 ID 获取账号（不解密）
   */
  getAccountById(id: number): PoolAccount | null {
    const row = this.db
      .prepare(`
        SELECT 
          id, email, email_hash as emailHash, encrypted_data as encryptedData,
          country, device_identifier as deviceIdentifier, pod, status,
          last_used_at as lastUsedAt, usage_count as usageCount,
          created_at as createdAt, updated_at as updatedAt
        FROM account_pool
        WHERE id = ?
      `)
      .get(id) as PoolAccount | undefined;

    return row || null;
  }

  /**
   * 获取账号凭据（解密）
   */
  getAccountCredentials(id: number): AccountCredentials | null {
    const account = this.getAccountById(id);
    if (!account || !account.encryptedData) {
      return null;
    }

    return decryptCredentials(account.encryptedData);
  }

  /**
   * 根据邮箱获取账号（不解密）
   */
  getAccountByEmail(email: string): PoolAccount | null {
    const emailHash = hashEmail(email);
    const row = this.db
      .prepare(`
        SELECT 
          id, email, email_hash as emailHash, encrypted_data as encryptedData,
          country, device_identifier as deviceIdentifier, pod, status,
          last_used_at as lastUsedAt, usage_count as usageCount,
          created_at as createdAt, updated_at as updatedAt
        FROM account_pool
        WHERE email_hash = ?
      `)
      .get(emailHash) as PoolAccount | undefined;

    return row || null;
  }

  /**
   * 获取完整账号信息（包含解密的凭据）
   */
  getFullAccount(id: number): FullAccount | null {
    const account = this.getAccountById(id);
    if (!account) {
      return null;
    }

    const credentials = decryptCredentials(account.encryptedData);

    const { encryptedData, ...rest } = account;
    return {
      ...rest,
      credentials,
    };
  }

  /**
   * 列出所有账号（不包含加密数据）
   */
  listAccounts(filters?: {
    status?: string;
    country?: string;
  }): Omit<PoolAccount, 'encryptedData'>[] {
    let query = `
      SELECT 
        id, email, email_hash as emailHash, country, 
        device_identifier as deviceIdentifier, pod, status,
        last_used_at as lastUsedAt, usage_count as usageCount,
        created_at as createdAt, updated_at as updatedAt
      FROM account_pool
      WHERE 1=1
    `;

    const params: any[] = [];

    if (filters?.status) {
      query += ' AND status = ?';
      params.push(filters.status);
    }

    if (filters?.country) {
      query += ' AND country = ?';
      params.push(filters.country);
    }

    query += ' ORDER BY usage_count ASC, last_used_at ASC NULLS FIRST';

    return this.db.prepare(query).all(...params) as any[];
  }

  /**
   * 更新账号凭据
   */
  updateCredentials(id: number, credentials: Partial<AccountCredentials>): void {
    const account = this.getFullAccount(id);
    if (!account) {
      throw new Error(`Account ${id} not found`);
    }

    // 合并凭据
    const newCredentials: AccountCredentials = {
      ...account.credentials,
      ...credentials,
    };

    const encryptedData = encryptCredentials(newCredentials);

    this.db
      .prepare('UPDATE account_pool SET encrypted_data = ? WHERE id = ?')
      .run(encryptedData, id);
  }

  /**
   * 更新账号状态
   */
  updateStatus(id: number, status: PoolAccount['status']): void {
    this.db
      .prepare('UPDATE account_pool SET status = ? WHERE id = ?')
      .run(status, id);
  }

  /**
   * 更新账号 Pod
   */
  updatePod(id: number, pod: number): void {
    this.db
      .prepare('UPDATE account_pool SET pod = ? WHERE id = ?')
      .run(pod, id);
  }

  /**
   * 记录账号使用
   */
  recordUsage(id: number): void {
    this.db
      .prepare(`
        UPDATE account_pool 
        SET usage_count = usage_count + 1, 
            last_used_at = CURRENT_TIMESTAMP 
        WHERE id = ?
      `)
      .run(id);
  }

  /**
   * 选择最佳可用账号
   */
  selectAccount(country?: string): Omit<PoolAccount, 'encryptedData'> | null {
    let query = `
      SELECT
        id, email, email_hash as emailHash, country,
        device_identifier as deviceIdentifier, pod, status,
        last_used_at as lastUsedAt, usage_count as usageCount,
        created_at as createdAt, updated_at as updatedAt
      FROM account_pool
      WHERE status = 'active'
    `;

    const params: any[] = [];

    if (country) {
      query += ' AND LOWER(country) = LOWER(?)';
      params.push(country);
    }

    // 优先选择：使用次数少 + 最久未使用
    query += ' ORDER BY usage_count ASC, last_used_at ASC NULLS FIRST LIMIT 1';

    return this.db.prepare(query).get(...params) as any || null;
  }

  /**
   * 删除账号
   */
  deleteAccount(id: number): boolean {
    const result = this.db
      .prepare('DELETE FROM account_pool WHERE id = ?')
      .run(id);

    return result.changes > 0;
  }

  /**
   * 获取账号统计信息
   */
  getStats(): {
    total: number;
    active: number;
    disabled: number;
    expired: number;
    byCountry: Record<string, number>;
  } {
    const total = this.db
      .prepare('SELECT COUNT(*) as count FROM account_pool')
      .get() as { count: number };

    const statusCounts = this.db
      .prepare(`
        SELECT status, COUNT(*) as count 
        FROM account_pool 
        GROUP BY status
      `)
      .all() as { status: string; count: number }[];

    const countryCounts = this.db
      .prepare(`
        SELECT country, COUNT(*) as count 
        FROM account_pool 
        GROUP BY country
      `)
      .all() as { country: string; count: number }[];

    const stats = {
      total: total.count,
      active: 0,
      disabled: 0,
      expired: 0,
      byCountry: {} as Record<string, number>,
    };

    statusCounts.forEach((row) => {
      if (row.status in stats) {
        (stats as any)[row.status] = row.count;
      }
    });

    countryCounts.forEach((row) => {
      stats.byCountry[row.country] = row.count;
    });

    return stats;
  }
}
