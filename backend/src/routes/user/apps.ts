import { Router, Request, Response } from 'express';
import { getDatabase } from '../../db/index.js';
import { AccountPoolService } from '../../services/accountPool.js';
import { AccountSelector } from '../../services/accountSelector.js';
import { getDownloadInfo, purchaseApp } from '../../services/appleClient.js';
import { createTask } from '../../services/downloadManager.js';
import type { Sinf } from '../../types/index.js';

const router = Router();

const db = getDatabase();
const poolService = new AccountPoolService();
const accountSelector = new AccountSelector();

/**
 * 获取可下载的应用列表（白名单）
 */
router.get('/apps', (req: Request, res: Response) => {
  try {
    const country = typeof req.query.country === 'string' ? req.query.country : undefined;

    let query = 'SELECT * FROM app_whitelist WHERE enabled = 1';
    const params: any[] = [];

    if (country) {
      query += ' AND country = ?';
      params.push(country);
    }

    query += ' ORDER BY name ASC';

    const apps = db.prepare(query).all(...params);
    res.json(apps);
  } catch (error: any) {
    console.error('List user apps error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 一键下载应用
 * 
 * 流程：
 * 1. 选择合适的账号
 * 2. 购买应用（获取 SINF）
 * 3. 获取下载信息
 * 4. 创建下载任务
 */
router.post('/quick-download', async (req: Request, res: Response) => {
  try {
    const { softwareId, bundleId, country } = req.body;

    if (!softwareId || !bundleId || !country) {
      res.status(400).json({
        error: 'Missing required fields: softwareId, bundleId, country',
      });
      return;
    }

    // 1. 检查应用是否在白名单中
    const app = db
      .prepare(`
        SELECT * FROM app_whitelist 
        WHERE software_id = ? AND country = ? AND enabled = 1
      `)
      .get(softwareId, country);

    if (!app) {
      res.status(403).json({
        error: 'App not available for download',
        hint: 'This app is not in the whitelist or is disabled',
      });
      return;
    }

    // 2. 智能选择账号
    const accountId = await accountSelector.selectAccount(country);
    const account = poolService.getFullAccount(accountId);

    if (!account) {
      res.status(500).json({ error: 'Failed to select account' });
      return;
    }

    // 3. 检查频率限制
    const canDownload = await accountSelector.checkRateLimit(accountId, 'download');
    if (!canDownload) {
      res.status(429).json({
        error: 'Rate limit exceeded',
        hint: 'Too many downloads in the last hour. Please try again later.',
      });
      return;
    }

    // 4. 购买应用（获取 SINF）
    const cookies = account.credentials.cookies
      ? Object.entries(account.credentials.cookies).map(([name, value]) => ({
          name,
          value,
        }))
      : [];

    let sinfs: string[];
    try {
      const purchaseResult = await purchaseApp({
        appId: softwareId,
        deviceId: account.deviceIdentifier,
        passwordToken: account.credentials.passwordToken!,
        DSID: account.credentials.DSID!,
        cookies,
        pod: account.pod || undefined,
      });
      sinfs = purchaseResult.sinfs;
    } catch (error: any) {
      console.error('Purchase failed:', error);
      
      // 如果是 "already purchased" 错误，继续获取下载信息
      if (!error.message.includes('already purchased')) {
        res.status(500).json({
          error: 'Failed to acquire license',
          details: error.message,
        });
        return;
      }
      
      // 已购买，需要再次获取 SINF
      sinfs = [];
    }

    // 5. 获取下载信息
    const downloadInfo = await getDownloadInfo({
      appId: softwareId,
      deviceId: account.deviceIdentifier,
      passwordToken: account.credentials.passwordToken!,
      DSID: account.credentials.DSID!,
      cookies,
      pod: account.pod || undefined,
    });

    // 6. 记录使用
    poolService.recordUsage(accountId);
    await accountSelector.recordRateLimit(accountId, 'download');

    // 7. 创建下载任务
    const sinfArray: Sinf[] = (sinfs.length > 0 ? sinfs : downloadInfo.sinfs).map((sinfData, index) => ({
      id: index,
      sinf: sinfData
    }));
    
    const task = createTask(
      {
        id: softwareId,
        bundleID: bundleId,
        name: (app as any).name,
        version: (app as any).version || 'latest',
        artworkUrl: (app as any).artwork_url || '',
        // 添加 Software 类型的其他必需字段
        artistName: '',
        sellerName: '',
        description: '',
        averageUserRating: 0,
        userRatingCount: 0,
        screenshotUrls: [],
        minimumOsVersion: '',
        fileSizeBytes: '0',
        releaseNotes: '',
        formattedPrice: 'Free',
        primaryGenreName: '',
        price: 0,
        releaseDate: new Date().toISOString(),
      },
      `pool_${accountId}`, // 使用特殊的 accountHash 标识这是账号池下载
      downloadInfo.downloadURL,
      sinfArray,
      downloadInfo.metadata
    );

    // 8. 记录下载历史
    db.prepare(`
      INSERT INTO download_history 
      (account_id, software_id, bundle_id, version, status)
      VALUES (?, ?, ?, ?, 'success')
    `).run(accountId, softwareId, bundleId, String((app as any).version || 'latest'));

    res.status(201).json({
      taskId: task.id,
      status: 'queued',
      message: 'Download started',
      accountUsed: {
        id: accountId,
        email: account.email,
        country: account.country,
      },
    });
  } catch (error: any) {
    console.error('Quick download error:', error);

    // 友好的错误消息
    if (error.message.includes('No available accounts')) {
      res.status(503).json({
        error: 'Service temporarily unavailable',
        details: 'No accounts available for this region',
      });
    } else if (error.message.includes('cooling down')) {
      res.status(429).json({
        error: 'Please wait',
        details: 'All accounts are cooling down. Please try again in a few minutes.',
      });
    } else {
      res.status(500).json({
        error: 'Download failed',
        details: error.message,
      });
    }
  }
});

/**
 * 获取下载历史统计
 */
router.get('/stats', (req: Request, res: Response) => {
  try {
    const stats = db
      .prepare(`
        SELECT 
          COUNT(*) as totalDownloads,
          COUNT(DISTINCT software_id) as uniqueApps,
          SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successfulDownloads,
          SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failedDownloads
        FROM download_history
        WHERE created_at > datetime('now', '-7 days')
      `)
      .get();

    res.json(stats);
  } catch (error: any) {
    console.error('Get stats error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
