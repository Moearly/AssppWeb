import { Router, Request, Response } from 'express';
import { AccountPoolService } from '../../services/accountPool.js';
import { HealthCheckService } from '../../services/healthCheck.js';
import { requireAdminAuth, checkEncryptionKey } from '../../middleware/auth.js';

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
    const { email, password, country, deviceIdentifier, pod } = req.body;

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
    const account = poolService.addAccount({
      email,
      password,
      country,
      deviceIdentifier,
      pod,
    });

    // 返回账号信息（不含加密数据）
    const { encryptedData, ...accountInfo } = account;
    res.status(201).json(accountInfo);
  } catch (error: any) {
    console.error('Add account error:', error);
    
    if (error.message.includes('already exists')) {
      res.status(409).json({ error: error.message });
    } else {
      res.status(500).json({ error: error.message });
    }
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

export default router;
