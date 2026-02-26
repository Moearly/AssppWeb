import { getDatabase } from '../db/index.js';
import { AccountPoolService } from './accountPool.js';
import { authenticateAccount } from './appleClient.js';

/**
 * 健康状态
 */
export type HealthStatus = 'healthy' | 'token_expired' | 'locked' | 'error';

/**
 * 健康检查结果
 */
export interface HealthCheckResult {
  accountId: number;
  status: HealthStatus;
  errorCode?: string;
  errorMessage?: string;
  responseTime?: number;
}

/**
 * 账号健康检查服务
 */
export class HealthCheckService {
  private db = getDatabase();
  private poolService = new AccountPoolService();

  /**
   * 检查单个账号健康状态
   */
  async checkAccount(accountId: number): Promise<HealthCheckResult> {
    const startTime = Date.now();
    
    try {
      const account = this.poolService.getFullAccount(accountId);
      if (!account) {
        throw new Error(`Account ${accountId} not found`);
      }

      // 尝试认证
      await authenticateAccount({
        email: account.email,
        password: account.credentials.password,
        deviceId: account.deviceIdentifier,
        existingCookies: account.credentials.cookies
          ? Object.entries(account.credentials.cookies).map(([name, value]) => ({
              name,
              value,
            }))
          : undefined,
      });

      const responseTime = Date.now() - startTime;

      // 记录健康状态
      this.logHealth(accountId, 'healthy', undefined, undefined, responseTime);

      // 更新账号状态为 active
      this.poolService.updateStatus(accountId, 'active');

      return {
        accountId,
        status: 'healthy',
        responseTime,
      };
    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      let status: HealthStatus = 'error';
      let errorCode: string | undefined;
      let errorMessage = error.message;

      // 解析错误类型
      if (errorMessage.includes('2034') || errorMessage.includes('2042')) {
        status = 'token_expired';
        errorCode = errorMessage.includes('2034') ? '2034' : '2042';
      } else if (errorMessage.includes('locked') || errorMessage.includes('disabled')) {
        status = 'locked';
      }

      // 记录健康状态
      this.logHealth(accountId, status, errorCode, errorMessage, responseTime);

      // 更新账号状态
      if (status === 'token_expired') {
        this.poolService.updateStatus(accountId, 'expired');
      } else if (status === 'locked') {
        this.poolService.updateStatus(accountId, 'disabled');
      } else {
        this.poolService.updateStatus(accountId, 'error');
      }

      return {
        accountId,
        status,
        errorCode,
        errorMessage,
        responseTime,
      };
    }
  }

  /**
   * 批量检查所有账号
   */
  async checkAllAccounts(): Promise<HealthCheckResult[]> {
    const accounts = this.poolService.listAccounts();
    const results: HealthCheckResult[] = [];

    for (const account of accounts) {
      const result = await this.checkAccount(account.id);
      results.push(result);

      // 避免频繁请求，间隔 10 秒
      await this.sleep(10000);
    }

    return results;
  }

  /**
   * 记录健康日志
   */
  private logHealth(
    accountId: number,
    status: HealthStatus,
    errorCode?: string,
    errorMessage?: string,
    responseTime?: number
  ): void {
    this.db
      .prepare(`
        INSERT INTO health_log 
        (account_id, status, error_code, error_message, response_time, checked_at)
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `)
      .run(accountId, status, errorCode || null, errorMessage || null, responseTime || null);
  }

  /**
   * 获取账号的健康历史
   */
  getHealthHistory(accountId: number, limit: number = 10): any[] {
    return this.db
      .prepare(`
        SELECT 
          id, status, error_code as errorCode, 
          error_message as errorMessage, response_time as responseTime,
          checked_at as checkedAt
        FROM health_log
        WHERE account_id = ?
        ORDER BY checked_at DESC
        LIMIT ?
      `)
      .all(accountId, limit) as any[];
  }

  /**
   * 辅助函数：延迟
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
