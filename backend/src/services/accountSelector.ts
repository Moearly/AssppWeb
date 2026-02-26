import { getDatabase } from '../db/index.js';
import type { PoolAccount } from './accountPool.js';

/**
 * 智能账号选择器
 * 
 * 功能：
 * - 负载均衡（选择使用次数最少的账号）
 * - 冷却机制（避免单个账号频繁使用）
 * - 健康状态过滤（只选择 active 状态的账号）
 */
export class AccountSelector {
  private db = getDatabase();
  
  /**
   * 为下载任务选择最佳账号
   */
  async selectAccount(country: string): Promise<number> {
    // 1. 获取候选账号（状态正常 + 地区匹配）
    const candidates = this.db
      .prepare(`
        SELECT id, usage_count as usageCount, last_used_at as lastUsedAt
        FROM account_pool
        WHERE status = 'active' AND country = ?
        ORDER BY usage_count ASC, last_used_at ASC NULLS FIRST
        LIMIT 10
      `)
      .all(country) as Array<{
        id: number;
        usageCount: number;
        lastUsedAt: string | null;
      }>;

    if (candidates.length === 0) {
      throw new Error(`No available accounts for country: ${country}`);
    }

    // 2. 检查冷却时间
    const cooldownMinutes = this.getCooldownMinutes();
    const cooldownMs = cooldownMinutes * 60 * 1000;
    const now = Date.now();

    for (const candidate of candidates) {
      // 如果从未使用过，直接选择
      if (!candidate.lastUsedAt) {
        return candidate.id;
      }

      // 检查是否已过冷却时间
      const lastUsed = new Date(candidate.lastUsedAt).getTime();
      if (now - lastUsed >= cooldownMs) {
        return candidate.id;
      }
    }

    // 3. 所有账号都在冷却中，选择冷却最久的
    const leastRecent = candidates.reduce((prev, current) => {
      if (!prev.lastUsedAt) return current;
      if (!current.lastUsedAt) return current;
      return new Date(current.lastUsedAt) < new Date(prev.lastUsedAt)
        ? current
        : prev;
    });

    console.warn(
      `All accounts for ${country} are in cooldown. ` +
      `Using least recently used account: ${leastRecent.id}`
    );

    return leastRecent.id;
  }

  /**
   * 检查账号是否可用
   */
  async isAccountAvailable(accountId: number): Promise<boolean> {
    const account = this.db
      .prepare(`
        SELECT status, last_used_at as lastUsedAt
        FROM account_pool
        WHERE id = ?
      `)
      .get(accountId) as Pick<PoolAccount, 'status' | 'lastUsedAt'> | undefined;

    if (!account || account.status !== 'active') {
      return false;
    }

    // 检查冷却时间
    if (!account.lastUsedAt) {
      return true;
    }

    const cooldownMinutes = this.getCooldownMinutes();
    const cooldownMs = cooldownMinutes * 60 * 1000;
    const lastUsed = new Date(account.lastUsedAt).getTime();
    const now = Date.now();

    return now - lastUsed >= cooldownMs;
  }

  /**
   * 获取冷却时间配置（分钟）
   */
  private getCooldownMinutes(): number {
    const config = this.db
      .prepare('SELECT value FROM system_config WHERE key = ?')
      .get('cooldown_minutes') as { value: string } | undefined;

    return config ? parseInt(config.value, 10) : 5; // 默认 5 分钟
  }

  /**
   * 检查频率限制
   */
  async checkRateLimit(accountId: number, action: string): Promise<boolean> {
    const limitPerHour = this.getRateLimitPerHour();
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    const count = this.db
      .prepare(`
        SELECT COUNT(*) as count
        FROM rate_limit
        WHERE account_id = ? AND action = ? AND timestamp > ?
      `)
      .get(accountId, action, oneHourAgo) as { count: number };

    return count.count < limitPerHour;
  }

  /**
   * 记录频率限制
   */
  async recordRateLimit(accountId: number, action: string): Promise<void> {
    this.db
      .prepare(`
        INSERT INTO rate_limit (account_id, action, timestamp)
        VALUES (?, ?, CURRENT_TIMESTAMP)
      `)
      .run(accountId, action);
  }

  /**
   * 清理旧的频率限制记录（超过24小时）
   */
  async cleanupRateLimit(): Promise<void> {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    
    this.db
      .prepare('DELETE FROM rate_limit WHERE timestamp < ?')
      .run(oneDayAgo);
  }

  /**
   * 获取频率限制配置（每小时）
   */
  private getRateLimitPerHour(): number {
    const config = this.db
      .prepare('SELECT value FROM system_config WHERE key = ?')
      .get('rate_limit_per_hour') as { value: string } | undefined;

    return config ? parseInt(config.value, 10) : 10; // 默认每小时 10 次
  }

  /**
   * 获取账号统计信息（调试用）
   */
  getAccountStats(country?: string): Array<{
    id: number;
    email: string;
    usageCount: number;
    lastUsedAt: string | null;
    status: string;
  }> {
    let query = `
      SELECT 
        id, email, usage_count as usageCount, 
        last_used_at as lastUsedAt, status
      FROM account_pool
    `;

    const params: any[] = [];

    if (country) {
      query += ' WHERE country = ?';
      params.push(country);
    }

    query += ' ORDER BY usage_count ASC, last_used_at ASC NULLS FIRST';

    return this.db.prepare(query).all(...params) as any[];
  }
}
