import crypto from 'crypto';

/**
 * 账号凭据接口（未加密）
 */
export interface AccountCredentials {
  password: string;
  passwordToken?: string;
  cookies?: Record<string, string>;
  DSID?: string;
}

/**
 * 加密数据格式
 */
interface EncryptedData {
  iv: string;        // 初始化向量（Base64）
  data: string;      // 加密数据（Base64）
  authTag: string;   // 认证标签（Base64）
}

/**
 * 获取加密密钥（从环境变量）
 */
function getEncryptionKey(): Buffer {
  const keyHex = process.env.ACCOUNT_POOL_KEY;
  
  if (!keyHex) {
    throw new Error(
      'ACCOUNT_POOL_KEY environment variable is required. ' +
      'Generate one with: node -e "console.log(crypto.randomBytes(32).toString(\'hex\'))"'
    );
  }
  
  if (keyHex.length !== 64) {
    throw new Error('ACCOUNT_POOL_KEY must be a 64-character hex string (256 bits)');
  }
  
  return Buffer.from(keyHex, 'hex');
}

/**
 * 加密账号凭据
 */
export function encryptCredentials(credentials: AccountCredentials): string {
  const key = getEncryptionKey();
  
  // 生成随机 IV（12 字节用于 GCM）
  const iv = crypto.randomBytes(12);
  
  // 创建加密器
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  
  // 加密数据
  const plaintext = JSON.stringify(credentials);
  let encrypted = cipher.update(plaintext, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  
  // 获取认证标签
  const authTag = cipher.getAuthTag();
  
  // 组合结果
  const result: EncryptedData = {
    iv: iv.toString('base64'),
    data: encrypted,
    authTag: authTag.toString('base64')
  };
  
  return JSON.stringify(result);
}

/**
 * 解密账号凭据
 */
export function decryptCredentials(encryptedString: string): AccountCredentials {
  const key = getEncryptionKey();
  
  // 解析加密数据
  const encrypted: EncryptedData = JSON.parse(encryptedString);
  
  // 创建解密器
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(encrypted.iv, 'base64')
  );
  
  // 设置认证标签
  decipher.setAuthTag(Buffer.from(encrypted.authTag, 'base64'));
  
  // 解密数据
  let decrypted = decipher.update(encrypted.data, 'base64', 'utf8');
  decrypted += decipher.final('utf8');
  
  return JSON.parse(decrypted);
}

/**
 * 生成邮箱哈希（SHA-256）
 */
export function hashEmail(email: string): string {
  return crypto
    .createHash('sha256')
    .update(email.toLowerCase())
    .digest('hex');
}

/**
 * 生成随机设备标识符（12位十六进制）
 */
export function generateDeviceId(): string {
  return crypto.randomBytes(6).toString('hex');
}

/**
 * 验证加密密钥是否已配置
 */
export function isEncryptionKeyConfigured(): boolean {
  try {
    getEncryptionKey();
    return true;
  } catch {
    return false;
  }
}
