import { Router, Request, Response } from 'express';
import { getDatabase } from '../../db/index.js';
import { requireAdminAuth } from '../../middleware/auth.js';

const router = Router();

// 应用管理员鉴权
router.use(requireAdminAuth);

const db = getDatabase();

/**
 * 获取应用白名单
 */
router.get('/apps', (req: Request, res: Response) => {
  try {
    const { country, enabled } = req.query;

    let query = 'SELECT * FROM app_whitelist WHERE 1=1';
    const params: any[] = [];

    if (country) {
      query += ' AND country = ?';
      params.push(country);
    }

    if (enabled !== undefined) {
      query += ' AND enabled = ?';
      params.push(enabled === 'true' ? 1 : 0);
    }

    query += ' ORDER BY name ASC';

    const apps = db.prepare(query).all(...params);
    res.json(apps);
  } catch (error: any) {
    console.error('List whitelist apps error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 添加应用到白名单
 */
router.post('/apps', (req: Request, res: Response) => {
  try {
    const { softwareId, bundleId, name, country, artworkUrl, version } = req.body;

    if (!softwareId || !bundleId || !name || !country) {
      res.status(400).json({
        error: 'Missing required fields: softwareId, bundleId, name, country',
      });
      return;
    }

    // 检查是否已存在
    const existing = db
      .prepare('SELECT id FROM app_whitelist WHERE software_id = ? AND country = ?')
      .get(softwareId, country);

    if (existing) {
      res.status(409).json({
        error: `App ${bundleId} already exists in whitelist for ${country}`,
      });
      return;
    }

    const result = db
      .prepare(`
        INSERT INTO app_whitelist 
        (software_id, bundle_id, name, country, artwork_url, version, enabled)
        VALUES (?, ?, ?, ?, ?, ?, 1)
      `)
      .run(softwareId, bundleId, name, country, artworkUrl || null, version || null);

    res.status(201).json({
      id: result.lastInsertRowid,
      softwareId,
      bundleId,
      name,
      country,
      enabled: true,
    });
  } catch (error: any) {
    console.error('Add whitelist app error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 更新应用
 */
router.put('/apps/:id', (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { name, artworkUrl, version, enabled } = req.body;

    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid app ID' });
      return;
    }

    const updates: string[] = [];
    const params: any[] = [];

    if (name !== undefined) {
      updates.push('name = ?');
      params.push(name);
    }
    if (artworkUrl !== undefined) {
      updates.push('artwork_url = ?');
      params.push(artworkUrl);
    }
    if (version !== undefined) {
      updates.push('version = ?');
      params.push(version);
    }
    if (enabled !== undefined) {
      updates.push('enabled = ?');
      params.push(enabled ? 1 : 0);
    }

    if (updates.length === 0) {
      res.status(400).json({ error: 'No fields to update' });
      return;
    }

    params.push(id);

    const result = db
      .prepare(`UPDATE app_whitelist SET ${updates.join(', ')} WHERE id = ?`)
      .run(...params);

    if (result.changes === 0) {
      res.status(404).json({ error: 'App not found' });
      return;
    }

    res.json({ success: true, message: 'App updated' });
  } catch (error: any) {
    console.error('Update whitelist app error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 删除应用
 */
router.delete('/apps/:id', (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);

    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid app ID' });
      return;
    }

    const result = db.prepare('DELETE FROM app_whitelist WHERE id = ?').run(id);

    if (result.changes === 0) {
      res.status(404).json({ error: 'App not found' });
      return;
    }

    res.json({ success: true, message: 'App deleted' });
  } catch (error: any) {
    console.error('Delete whitelist app error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * 启用/禁用应用
 */
router.patch('/apps/:id/toggle', (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);

    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid app ID' });
      return;
    }

    // 获取当前状态
    const app = db
      .prepare('SELECT enabled FROM app_whitelist WHERE id = ?')
      .get(id) as { enabled: number } | undefined;

    if (!app) {
      res.status(404).json({ error: 'App not found' });
      return;
    }

    // 切换状态
    const newEnabled = app.enabled === 1 ? 0 : 1;
    db.prepare('UPDATE app_whitelist SET enabled = ? WHERE id = ?').run(newEnabled, id);

    res.json({
      success: true,
      enabled: newEnabled === 1,
      message: `App ${newEnabled === 1 ? 'enabled' : 'disabled'}`,
    });
  } catch (error: any) {
    console.error('Toggle app error:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
