-- AssppWeb 账号池数据库设计
-- SQLite Schema

-- 1. 账号池表
CREATE TABLE IF NOT EXISTS account_pool (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  email_hash TEXT NOT NULL UNIQUE,           -- SHA-256(email)，用于快速查找
  encrypted_data TEXT NOT NULL,              -- AES-256-GCM 加密的凭据 JSON
  country TEXT NOT NULL,                     -- 账号所属地区 (US, JP, CN, etc.)
  device_identifier TEXT NOT NULL,           -- 设备标识符（12位十六进制）
  pod INTEGER,                               -- Apple Pod 编号
  status TEXT NOT NULL DEFAULT 'active',     -- active | disabled | expired | error
  last_used_at DATETIME,                     -- 最后使用时间
  usage_count INTEGER NOT NULL DEFAULT 0,    -- 使用次数
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_account_pool_status ON account_pool(status);
CREATE INDEX IF NOT EXISTS idx_account_pool_country ON account_pool(country);
CREATE INDEX IF NOT EXISTS idx_account_pool_email_hash ON account_pool(email_hash);

-- 2. 应用白名单表
CREATE TABLE IF NOT EXISTS app_whitelist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  software_id INTEGER NOT NULL,             -- iTunes App ID
  bundle_id TEXT NOT NULL,                  -- Bundle ID
  name TEXT NOT NULL,                       -- 应用名称
  country TEXT NOT NULL,                    -- 应用所属地区
  artwork_url TEXT,                         -- 应用图标 URL
  version TEXT,                             -- 版本号
  enabled BOOLEAN NOT NULL DEFAULT 1,       -- 是否启用
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_app_whitelist_enabled ON app_whitelist(enabled);
CREATE INDEX IF NOT EXISTS idx_app_whitelist_country ON app_whitelist(country);
CREATE UNIQUE INDEX IF NOT EXISTS idx_app_whitelist_unique ON app_whitelist(software_id, country);

-- 3. 下载历史表
CREATE TABLE IF NOT EXISTS download_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL,              -- 使用的账号 ID
  software_id INTEGER NOT NULL,             -- 应用 ID
  bundle_id TEXT NOT NULL,                  -- Bundle ID
  version TEXT,                             -- 版本号
  status TEXT NOT NULL,                     -- success | failed | cancelled
  error_message TEXT,                       -- 错误信息
  user_identifier TEXT,                     -- 用户标识（可选）
  download_size INTEGER,                    -- 下载大小（字节）
  duration INTEGER,                         -- 下载耗时（秒）
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (account_id) REFERENCES account_pool(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_download_history_account ON download_history(account_id);
CREATE INDEX IF NOT EXISTS idx_download_history_created ON download_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_download_history_status ON download_history(status);

-- 4. 账号健康日志表
CREATE TABLE IF NOT EXISTS health_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL,              -- 账号 ID
  status TEXT NOT NULL,                     -- healthy | token_expired | locked | error
  error_code TEXT,                          -- 错误码（如 2034, 2042）
  error_message TEXT,                       -- 错误信息
  response_time INTEGER,                    -- 响应时间（毫秒）
  checked_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (account_id) REFERENCES account_pool(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_health_log_account_checked ON health_log(account_id, checked_at DESC);

-- 5. 频率限制表
CREATE TABLE IF NOT EXISTS rate_limit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL,              -- 账号 ID
  action TEXT NOT NULL,                     -- 操作类型：auth | purchase | download
  timestamp DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (account_id) REFERENCES account_pool(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_account_action ON rate_limit(account_id, action, timestamp DESC);

-- 6. 系统配置表
CREATE TABLE IF NOT EXISTS system_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  description TEXT,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 插入默认配置
INSERT OR IGNORE INTO system_config (key, value, description) VALUES
  ('mode', 'dual', '运行模式：zero_trust | pool | dual'),
  ('pool_enabled', 'true', '是否启用账号池模式'),
  ('rate_limit_per_hour', '10', '每小时每账号最大下载次数'),
  ('cooldown_minutes', '5', '账号冷却时间（分钟）'),
  ('health_check_interval', '360', '健康检查间隔（分钟）');

-- 创建触发器：自动更新 updated_at
CREATE TRIGGER IF NOT EXISTS update_account_pool_timestamp 
AFTER UPDATE ON account_pool
BEGIN
  UPDATE account_pool SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_app_whitelist_timestamp 
AFTER UPDATE ON app_whitelist
BEGIN
  UPDATE app_whitelist SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_system_config_timestamp 
AFTER UPDATE ON system_config
BEGIN
  UPDATE system_config SET updated_at = CURRENT_TIMESTAMP WHERE key = NEW.key;
END;
