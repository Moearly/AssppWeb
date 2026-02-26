import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'data', 'asspp.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

let db: Database.Database | null = null;

/**
 * 初始化数据库
 */
export function initDatabase(): Database.Database {
  if (db) {
    return db;
  }

  // 确保数据目录存在
  const dataDir = path.dirname(DB_PATH);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // 打开数据库
  db = new Database(DB_PATH);
  
  // 启用外键约束
  db.pragma('foreign_keys = ON');
  
  // 设置 WAL 模式（更好的并发性能）
  db.pragma('journal_mode = WAL');

  // 执行 schema
  const schema = fs.readFileSync(SCHEMA_PATH, 'utf-8');
  db.exec(schema);

  console.log(`✅ Database initialized at: ${DB_PATH}`);

  return db;
}

/**
 * 获取数据库实例
 */
export function getDatabase(): Database.Database {
  if (!db) {
    return initDatabase();
  }
  return db;
}

/**
 * 关闭数据库连接
 */
export function closeDatabase(): void {
  if (db) {
    db.close();
    db = null;
    console.log('✅ Database connection closed');
  }
}

/**
 * 数据库健康检查
 */
export function healthCheck(): boolean {
  try {
    const db = getDatabase();
    const result = db.prepare('SELECT 1').get();
    return result !== undefined;
  } catch (error) {
    console.error('❌ Database health check failed:', error);
    return false;
  }
}

// 进程退出时关闭数据库
process.on('exit', closeDatabase);
process.on('SIGINT', () => {
  closeDatabase();
  process.exit(0);
});
process.on('SIGTERM', () => {
  closeDatabase();
  process.exit(0);
});
