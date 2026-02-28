import { getDatabase } from '../db/index.js';
import { AccountPoolService } from './accountPool.js';
import { authenticateAccount } from './appleClient.js';
import fs from 'fs';

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

const logFile = '/data/health-debug.log';

function log(msg: string) {
  try {
    fs.appendFileSync(logFile, `${new Date().toISOString()} ${msg}\n`);
  } catch (e) {
    try {
      fs.appendFileSync('/tmp/health-debug.log', `${new Date().toISOString()} ${msg} (fallback)\n`);
    } catch (e2) {
      // Give up
    }
  }
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
    log(`=== Health Check Start for Account ${accountId} ===`);

    const startTime = Date.now();
    
    try {
      log('Getting full account...');
      const account = this.poolService.getFullAccount(accountId);
      if (!account) {
        log('ERROR: Account not found');
        throw new Error(`Account ${accountId} not found`);
      }

      log(`Account found: ${account.email}`);
      log(`Has passwordToken: ${!!account.credentials.passwordToken}`);

      //如果账号没有passwordToken，说明从未认证成功过，需要完整认证
      if (!account.credentials.passwordToken) {
        log('First-time authentication (no token)');
        // 首次认证
        const authResult = await authenticateAccount({
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

        log('First auth successful, saving credentials...');

        // 更新凭据
        this.poolService.updateCredentials(accountId, {
          password: account.credentials.password,
          passwordToken: authResult.passwordToken,
          DSID: authResult.DSID,
          cookies: authResult.cookies.reduce((acc, c) => {
            acc[c.name] = c.value;
            return acc;
          }, {} as Record<string, string>),
        });

        // 更新pod
        if (authResult.pod) {
          this.poolService.updatePod(accountId, authResult.pod);
        }

        const responseTime = Date.now() - startTime;
        this.logHealth(accountId, 'healthy', undefined, undefined, responseTime);
        this.poolService.updateStatus(accountId, 'active');

        log(`=== Health Check Success (${responseTime}ms) ===`);

        return {
          accountId,
          status: 'healthy',
          responseTime,
        };
      } else {
        log('Re-authentication (has token)');
        // 已有token，使用 passwordToken 进行认证
        await authenticateAccount({
          email: account.email,
          password: account.credentials.password,
          deviceId: account.deviceIdentifier,
          passwordToken: account.credentials.passwordToken, // 使用保存的 token
          existingCookies: account.credentials.cookies
            ? Object.entries(account.credentials.cookies).map(([name, value]) => ({
                name,
                value,
              }))
            : undefined,
        });

        const responseTime = Date.now() - startTime;
        this.logHealth(accountId, 'healthy', undefined, undefined, responseTime);
        this.poolService.updateStatus(accountId, 'active');

        log(`=== Health Check Success (${responseTime}ms) ===`);

        return {
          accountId,
          status: 'healthy',
          responseTime,
        };
      }
    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      let status: HealthStatus = 'error';
      let errorCode: string | undefined;
      let errorMessage = error.message;

      log(`ERROR: ${errorMessage}`);
      log(`Stack: ${error.stack?.substring(0, 500) || 'No stack'}`);

      // 解析错误类型
      if (errorMessage.includes('2034') || errorMessage.includes('2042')) {
        status = 'token_expired';
        errorCode = errorMessage.includes('2034') ? '2034' : '2042';
      } else if (errorMessage.includes('locked') || errorMessage.includes('disabled')) {
        status = 'locked';
      } else if (errorMessage === 'REQUIRES_2FA_VERIFICATION') {
        // 2FA 账号需要重新认证（手动输入验证码）
        status = 'error';
        errorMessage = 'REQUIRES_2FA_VERIFICATION';
      }

      // 记录健康状态
      this.logHealth(accountId, status, errorCode, errorMessage, responseTime);

      // 更新账号状态
      if (status === 'token_expired') {
        this.poolService.updateStatus(accountId, 'expired');
      } else if (status === 'locked') {
        this.poolService.updateStatus(accountId, 'disabled');
      } else if (errorMessage === 'REQUIRES_2FA_VERIFICATION') {
        // 保持 active 状态，但在前端显示需要重新认证
        // 不改变状态，避免账号被标记为 error
        log('Account requires 2FA re-authentication (keeping active status)');
      } else {
        this.poolService.updateStatus(accountId, 'error');
      }

      log(`=== Health Check Failed (${responseTime}ms) ===`);

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
