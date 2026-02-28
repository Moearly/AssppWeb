import { Router, Request, Response } from 'express';
import { AccountPoolService } from '../../services/accountPool.js';
import { HealthCheckService } from '../../services/healthCheck.js';
import { requireAdminAuth, checkEncryptionKey } from '../../middleware/auth.js';
import { authenticateAccount } from '../../services/appleClient.js';

const router = Router();

// 应用管理员鉴权中间件到所有路由
router.use(requireAdminAuth);
router.use(checkEncryptionKey);

const poolService = new AccountPoolService();
const healthService = new HealthCheckService();

/**
 * 获取所有账号（不包含敏感数据）
 */
router.get('/accounts', (req: Request, res: Response) => {
  try {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const country = typeof req.query.country === 'string' ? req.query.country : undefined;

    const filters: any = {};
    if (status) filters.status = status;
    if (country) filters.country = country;

    const accounts = poolService.listAccounts(filters);
    res.json(accounts);
  } catch (error: any) {
    console.error('List accounts error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 获取单个账号详情（不包含密码）
 */
router.get('/accounts/:id', (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid account ID' });
      return;
    }

    const account = poolService.getAccountById(id);
    if (!account) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }

    // 返回账号信息（不含加密数据）
    const { encryptedData, ...accountInfo } = account;
    res.json(accountInfo);
  } catch (error: any) {
    console.error('Get account error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 添加账号到池
 */
router.post('/accounts', async (req: Request, res: Response) => {
  try {
    const { email, password, country, deviceIdentifier, pod, verificationCode } = req.body;

    // 验证必需字段
    if (!email || !password || !country || !deviceIdentifier) {
      res.status(400).json({
        error: 'Missing required fields: email, password, country, deviceIdentifier',
      });
      return;
    }

    // 验证 deviceIdentifier 格式（12位十六进制）
    if (!/^[0-9a-fA-F]{12}$/.test(deviceIdentifier)) {
      res.status(400).json({
        error: 'deviceIdentifier must be 12 hexadecimal characters',
      });
      return;
    }

    // 添加账号（会自动加密）
    let account;
    try {
      account = poolService.addAccount({
        email,
        password,
        country,
        deviceIdentifier,
        pod,
      });
    } catch (addError: any) {
      // 账号已存在
      if (addError.message.includes('already exists')) {
        res.status(400).json({
          error: addError.message,
        });
        return;
      }
      throw addError; // 其他错误继续抛出
    }

    // 立即进行首次认证以获取 passwordToken
    // 如果账号有2FA，verificationCode 应该已经提供
    try {
      const authResult = await authenticateAccount({
        email,
        password,
        deviceId: deviceIdentifier,
        verificationCode, // 可选的2FA验证码
      });

      // 更新账号凭据（存储 passwordToken）
      poolService.updateCredentials(account.id, {
        password,
        passwordToken: authResult.passwordToken,
        DSID: authResult.DSID,
        cookies: authResult.cookies.reduce((acc: Record<string, string>, c: { name: string; value: string }) => {
          acc[c.name] = c.value;
          return acc;
        }, {} as Record<string, string>),
      });

      // 更新pod
      if (authResult.pod) {
        poolService.updatePod(account.id, authResult.pod);
      }

      // 标记为active
      poolService.updateStatus(account.id, 'active');

      // 返回账号信息（不含加密数据）
      const updatedAccount = poolService.getAccountById(account.id)!;
      const { encryptedData, ...accountInfo } = updatedAccount;
      res.status(201).json(accountInfo);
    } catch (authError: any) {
      // 如果是2FA错误，返回特殊状态码（保留账号，等待验证码）
      if (authError.message === 'REQUIRES_2FA_VERIFICATION') {
        res.status(428).json({
          error: 'REQUIRES_2FA',
          message: 'This account requires two-factor authentication',
          accountId: account.id,
        });
        return;
      }

      // 其他认证错误，删除账号并返回错误
      poolService.deleteAccount(account.id);
      res.status(400).json({
        error: 'Authentication failed',
        message: authError.message,
      });
    }
  } catch (error: any) {
    console.error('Add account error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 提交2FA验证码以完成账号认证
 */
router.patch('/accounts/:id/verify-2fa', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    const { verificationCode } = req.body;

    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid account ID' });
      return;
    }

    if (!verificationCode) {
      res.status(400).json({ error: 'Verification code is required' });
      return;
    }

    // 获取账号信息
    const account = poolService.getAccountById(id);
    if (!account) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }

    // 解密凭据
    const credentials = poolService.getAccountCredentials(id);
    if (!credentials || !credentials.password) {
      res.status(400).json({ error: 'Account password not found' });
      return;
    }

    console.log('[2FA] Verification code received:', verificationCode);
    console.log('[2FA] Verification code type:', typeof verificationCode);
    console.log('[2FA] Verification code length:', verificationCode?.length);

    // 使用验证码进行认证
    const authResult = await authenticateAccount({
      email: account.email,
      password: credentials.password,
      deviceId: account.deviceIdentifier,
      verificationCode,
    });

    console.log('[2FA] authResult keys:', Object.keys(authResult));
    console.log('[2FA] passwordToken:', authResult.passwordToken);
    console.log('[2FA] DSID:', authResult.DSID);
    console.log('[2FA] cookies count:', authResult.cookies?.length || 0);
    console.log('[2FA] pod:', authResult.pod);

    // 更新账号凭据（存储 passwordToken）
    poolService.updateCredentials(id, {
      password: credentials.password,
      passwordToken: authResult.passwordToken,
      DSID: authResult.DSID,
      cookies: authResult.cookies.reduce((acc: Record<string, string>, c: { name: string; value: string }) => {
        acc[c.name] = c.value;
        return acc;
      }, {} as Record<string, string>),
    });

    // 更新pod
    if (authResult.pod) {
      poolService.updatePod(id, authResult.pod);
    }

    // 标记为active
    poolService.updateStatus(id, 'active');

    // 返回更新后的账号信息（不含加密数据）
    const updatedAccount = poolService.getAccountById(id)!;
    const { encryptedData, ...accountInfo } = updatedAccount;
    res.json(accountInfo);
  } catch (error: any) {
    console.error('Verify 2FA error:', error);
    res.status(400).json({
      error: 'Authentication failed',
      message: error.message,
    });
  }
});

/**
 * 删除账号
 */
router.delete('/accounts/:id', (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid account ID' });
      return;
    }

    const deleted = poolService.deleteAccount(id);
    if (!deleted) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }

    res.json({ success: true, message: 'Account deleted' });
  } catch (error: any) {
    console.error('Delete account error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 更新账号状态
 */
router.patch('/accounts/:id/status', (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    const { status } = req.body;

    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid account ID' });
      return;
    }

    if (!['active', 'disabled', 'expired', 'error'].includes(status)) {
      res.status(400).json({
        error: 'Invalid status. Must be: active, disabled, expired, or error',
      });
      return;
    }

    poolService.updateStatus(id, status);
    res.json({ success: true, message: 'Status updated' });
  } catch (error: any) {
    console.error('Update status error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 健康检查单个账号
 */
router.post('/accounts/:id/health', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid account ID' });
      return;
    }

    const result = await healthService.checkAccount(id);
    res.json(result);
  } catch (error: any) {
    console.error('Health check error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 批量健康检查（所有账号）
 */
router.post('/health/check-all', async (req: Request, res: Response) => {
  try {
    // 这是一个长时间运行的操作，建议异步处理
    res.json({
      message: 'Health check started in background',
      status: 'running',
    });

    // 在后台执行健康检查
    healthService.checkAllAccounts().catch((error) => {
      console.error('Background health check failed:', error);
    });
  } catch (error: any) {
    console.error('Start health check error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 获取账号健康历史
 */
router.get('/accounts/:id/health/history', (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    const limitParam = typeof req.query.limit === 'string' ? req.query.limit : '10';
    const limit = parseInt(limitParam, 10) || 10;

    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid account ID' });
      return;
    }

    const history = healthService.getHealthHistory(id, limit);
    res.json(history);
  } catch (error: any) {
    console.error('Get health history error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 获取账号池统计信息
 */
router.get('/stats', (req: Request, res: Response) => {
  try {
    const stats = poolService.getStats();
    res.json(stats);
  } catch (error: any) {
    console.error('Get stats error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 批量导入账号
 * 格式：email----password verification_code_api
 */
router.post('/accounts/batch', async (req: Request, res: Response) => {
  try {
    const { accountsText, country } = req.body;

    if (!accountsText) {
      res.status(400).json({ error: 'Missing accountsText' });
      return;
    }

    const lines = accountsText.trim().split('\n').filter((l: string) => l.trim());
    const results: any[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      // 解析格式：email----password verification_code_api
      const match = trimmed.match(/^(.+?)----(.+?)\s+(https?:\/\/.+)$/);
      
      if (!match) {
        results.push({
          line: trimmed.substring(0, 50),
          success: false,
          error: 'Invalid format. Expected: email----password verification_code_api',
        });
        continue;
      }

      const [, email, password, verificationCodeApi] = match;
      const deviceId = generateDeviceId();
      const accountCountry = country || 'US';

      try {
        // 检查账号是否已存在
        const existing = poolService.db.prepare('SELECT id FROM account_pool WHERE email = ?').get(email) as any;
        if (existing) {
          results.push({
            email,
            success: false,
            error: 'Account already exists',
          });
          continue;
        }

        // 添加账号（不立即认证，保持未激活状态）
        const account = poolService.addAccount({
          email,
          password,
          country: accountCountry,
          deviceIdentifier: deviceId,
        });

        // 保存验证码 API
        poolService.db.prepare('UPDATE account_pool SET verification_code_api = ? WHERE id = ?')
          .run(verificationCodeApi, account.id);

        results.push({
          email,
          success: true,
          accountId: account.id,
          deviceId,
        });
      } catch (error: any) {
        results.push({
          email,
          success: false,
          error: error.message,
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    res.json({
      total: results.length,
      success: successCount,
      failed: results.length - successCount,
      results,
    });
  } catch (error: any) {
    console.error('Batch import error:', error);
    res.status(500).json({ error: error.message });
  }
});

function generateDeviceId(): string {
  return Array.from({ length: 12 }, () =>
    Math.floor(Math.random() * 16).toString(16).toUpperCase()
  ).join('');
}

export default router;
