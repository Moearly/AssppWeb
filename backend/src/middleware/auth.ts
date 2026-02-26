import { Request, Response, NextFunction } from 'express';

/**
 * 管理员鉴权中间件
 * 
 * 检查请求头中的 x-admin-key 是否匹配环境变量中的 ADMIN_API_KEY
 */
export function requireAdminAuth(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const adminKey = process.env.ADMIN_API_KEY;

  if (!adminKey) {
    res.status(500).json({
      error: 'Admin API key not configured on server',
    });
    return;
  }

  const providedKey = req.headers['x-admin-key'];

  if (!providedKey || providedKey !== adminKey) {
    res.status(401).json({
      error: 'Unauthorized: Invalid or missing admin API key',
    });
    return;
  }

  next();
}

/**
 * 检查加密密钥是否配置
 */
export function checkEncryptionKey(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const key = process.env.ACCOUNT_POOL_KEY;

  if (!key || key.length !== 64) {
    res.status(500).json({
      error: 'Account pool encryption key not configured properly',
      hint: 'Set ACCOUNT_POOL_KEY environment variable (64-char hex)',
    });
    return;
  }

  next();
}
