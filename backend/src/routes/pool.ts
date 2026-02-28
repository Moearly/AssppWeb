/**
 * 用户端账号池 API
 * 用户从这里获取临时账号凭据，在浏览器端使用
 */
import { Router, Request, Response } from 'express';
import { AccountPoolService } from '../services/accountPool.js';

const router = Router();
const poolService = new AccountPoolService();

/**
 * 分配账号给用户
 * 返回解密后的账号凭据（包括验证码API）供浏览器使用
 */
router.post('/allocate', async (req: Request, res: Response) => {
  try {
    const { country } = req.body;

    // 选择最佳账号
    const account = poolService.selectAccount(country);
    
    if (!account) {
      res.status(404).json({
        error: 'NO_AVAILABLE_ACCOUNT',
        message: 'No available accounts in the pool',
      });
      return;
    }

    // 获取解密后的凭据
    const credentials = poolService.getAccountCredentials(account.id);
    
    if (!credentials) {
      res.status(500).json({ error: 'Failed to decrypt account credentials' });
      return;
    }

    // 获取验证码API
    const verificationCodeApi = poolService.db
      .prepare('SELECT verification_code_api FROM account_pool WHERE id = ?')
      .get(account.id) as any;

    // 标记账号正在使用（增加使用次数）
    poolService.recordUsage(account.id);

    res.json({
      accountId: account.id,
      email: account.email,
      password: credentials.password,
      deviceIdentifier: account.deviceIdentifier,
      country: account.country,
      pod: account.pod,
      passwordToken: credentials.passwordToken,
      DSID: credentials.DSID,
      cookies: credentials.cookies,
      verificationCodeApi: verificationCodeApi?.verification_code_api || null,
    });
  } catch (error: any) {
    console.error('Allocate account error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 释放账号（用户使用完毕后调用）
 */
router.post('/release/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string, 10);

    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid account ID' });
      return;
    }

    // 只需要记录释放时间，不需要特殊处理
    // 账号自然进入冷却期（基于 last_used_at）
    
    res.json({ success: true });
  } catch (error: any) {
    console.error('Release account error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 获取验证码（代理外部验证码API，避免CORS）
 */
router.get('/verification-code', async (req: Request, res: Response) => {
  try {
    const { url } = req.query;

    if (!url || typeof url !== 'string') {
      res.status(400).json({ error: 'Missing url parameter' });
      return;
    }

    // 验证URL格式
    try {
      new URL(url);
    } catch {
      res.status(400).json({ error: 'Invalid url format' });
      return;
    }

    // 代理请求
    const response = await fetch(url);
    const text = await response.text();

    // 解析验证码格式：AppleID 登录验证码:123456
    const match = text.match(/验证码[：:]\s*(\d{6})/);
    
    if (match) {
      res.json({ code: match[1] });
    } else {
      // 返回原始文本，让前端处理
      res.json({ text });
    }
  } catch (error: any) {
    console.error('Fetch verification code error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 更新账号凭据（浏览器认证成功后回传新的token）
 */
router.post('/update-credentials/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    const { passwordToken, DSID, cookies, pod } = req.body;

    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid account ID' });
      return;
    }

    // 更新凭据
    const account = poolService.getAccountById(id);
    if (!account) {
      res.status(404).json({ error: 'Account not found' });
      return;
    }

    const existingCredentials = poolService.getAccountCredentials(id);
    if (!existingCredentials) {
      res.status(500).json({ error: 'Failed to decrypt account credentials' });
      return;
    }
    
    poolService.updateCredentials(id, {
      password: existingCredentials.password,
      passwordToken,
      DSID,
      cookies,
    });

    if (pod) {
      poolService.updatePod(id, pod);
    }

    // 标记为active
    poolService.updateStatus(id, 'active');

    res.json({ success: true });
  } catch (error: any) {
    console.error('Update credentials error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
