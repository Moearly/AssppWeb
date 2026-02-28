import axios, { AxiosRequestConfig } from 'axios';
import { buildPlist, parsePlist } from './plist.js';
import fs from 'fs';

const appleLogFile = '/data/apple-debug.log';

function appleLog(msg: string) {
  try {
    fs.appendFileSync(appleLogFile, `${new Date().toISOString()} ${msg}\n`);
  } catch (e) {
    try {
      fs.appendFileSync('/tmp/apple-debug.log', `${new Date().toISOString()} ${msg} (fallback)\n`);
    } catch (e2) {
      // Give up
    }
  }
}

/**
 * Cookie 接口
 */
interface Cookie {
  name: string;
  value: string;
}

/**
 * Apple 请求配置
 */
interface AppleRequestConfig {
  method: 'GET' | 'POST';
  url: string;
  headers?: Record<string, string>;
  body?: string;
  cookies?: Cookie[];
}

/**
 * Apple 请求响应
 */
interface AppleResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
  cookies: Cookie[];
}

/**
 * 服务器端 Apple API 客户端
 * 
 * 注意：这是服务器端实现，不使用 libcurl.js
 */
export class AppleClient {
  // 使用与前端相同的 User-Agent
  private static readonly USER_AGENT = 'Configurator/2.17 (Macintosh; OS X 15.2; 24C5089c) AppleWebKit/0620.1.16.11.6';
  
  /**
   * 发送请求到 Apple 服务器
   */
  static async request(config: AppleRequestConfig): Promise<AppleResponse> {
    const axiosConfig: AxiosRequestConfig = {
      method: config.method,
      url: config.url,
      headers: {
        'User-Agent': this.USER_AGENT,
        ...config.headers,
      },
      data: config.body,
      maxRedirects: 0, // 禁用自动重定向，手动处理
      validateStatus: () => true, // 不自动抛出错误
      transformResponse: [(data) => data], // 返回原始字符串
    };

    // 添加 cookies
    if (config.cookies && config.cookies.length > 0) {
      axiosConfig.headers!['Cookie'] = config.cookies
        .map((c) => `${c.name}=${c.value}`)
        .join('; ');
    }

    const response = await axios(axiosConfig);

    // 提取响应 cookies
    const responseCookies = this.extractCookies(response.headers['set-cookie'] || []);

    return {
      status: response.status,
      headers: response.headers as Record<string, string>,
      body: response.data,
      cookies: responseCookies,
    };
  }

  /**
   * 从 Set-Cookie 头提取 cookies
   */
  private static extractCookies(setCookieHeaders: string[]): Cookie[] {
    const cookies: Cookie[] = [];

    for (const header of setCookieHeaders) {
      const parts = header.split(';')[0].split('=');
      if (parts.length === 2) {
        cookies.push({
          name: parts[0].trim(),
          value: parts[1].trim(),
        });
      }
    }

    return cookies;
  }

  /**
   * 合并 cookies（新的覆盖旧的）
   */
  static mergeCookies(existing: Cookie[], newCookies: Cookie[]): Cookie[] {
    const merged = [...existing];

    for (const newCookie of newCookies) {
      const index = merged.findIndex((c) => c.name === newCookie.name);
      if (index !== -1) {
        merged[index] = newCookie;
      } else {
        merged.push(newCookie);
      }
    }

    return merged;
  }

  /**
   * 提取 Pod 编号
   */
  static extractPod(headers: Record<string, string>): number | undefined {
    const podHeader = headers['pod'];
    if (podHeader) {
      const pod = parseInt(podHeader, 10);
      if (!isNaN(pod)) {
        return pod;
      }
    }
    return undefined;
  }

  /**
   * 提取 StoreFront
   */
  static extractStoreFront(headers: Record<string, string>): string | undefined {
    const storeHeader = headers['x-set-apple-store-front'];
    if (storeHeader) {
      return storeHeader.split('-')[0];
    }
    return undefined;
  }
}

/**
 * Bag 配置
 */
export interface BagConfig {
  authURL: string;
  buyURL: string;
}

/**
 * 获取 Bag 配置
 */
export async function fetchBag(deviceId: string): Promise<BagConfig> {
  appleLog('[BAG] Fetching bag for device: ' + deviceId);
  
  const response = await AppleClient.request({
    method: 'GET',
    url: `https://init.itunes.apple.com/bag.xml?guid=${deviceId}`,
    headers: {
      'Accept': 'application/xml',
    },
  });

  appleLog(`[BAG] Response status: ${response.status}`);
  appleLog(`[BAG] Response length: ${response.body.length}`);
  appleLog(`[BAG] Response preview: ${response.body.substring(0, 200)}`);

  // Bag XML 格式特殊：<Document><Protocol><plist>...</plist></Protocol></Document>
  // 需要提取出 plist 部分
  let plistXml = response.body;
  
  // 如果包含 <Protocol> 标签，提取 plist 部分
  const protocolMatch = response.body.match(/<plist[^>]*>[\s\S]*<\/plist>/);
  if (protocolMatch) {
    plistXml = protocolMatch[0];
    appleLog('[BAG] Extracted plist from Protocol wrapper');
    appleLog(`[BAG] Extracted plist length: ${plistXml.length}`);
    appleLog(`[BAG] Extracted plist preview: ${plistXml.substring(0, 500)}`);
  } else {
    appleLog('[BAG] WARNING: No <plist> found in response');
  }

  let bag: any;
  try {
    bag = parsePlist(plistXml);
    appleLog('[BAG] Bag parsed successfully');
  } catch (error) {
    appleLog(`[BAG] ERROR: Bag parse failed: ${error instanceof Error ? error.message : String(error)}`);
    throw error;
  }
  
  // authenticateAccount may be at top level or inside urlBag dict
  let authURL: string | undefined;
  const urlBag = bag.urlBag as Record<string, any> | undefined;
  if (urlBag) {
    authURL = urlBag.authenticateAccount as string | undefined;
    if (authURL) {
      appleLog('[BAG] Found authURL in urlBag');
    }
  }
  if (!authURL) {
    authURL = bag.authenticateAccount as string | undefined;
    if (authURL) {
      appleLog('[BAG] Found authURL at top level');
    }
  }
  
  appleLog(`[BAG] authURL: ${authURL || 'NOT FOUND'}`);

  return {
    authURL: authURL || 'https://buy.itunes.apple.com/WebObjects/MZFinance.woa/wa/authenticate',
    buyURL: bag.volumeStoreDownloadProduct || bag.buy || 'https://buy.itunes.apple.com/WebObjects/MZFinance.woa/wa/volumeStoreDownloadProduct',
  };
}

/**
 * 认证 Apple 账号
 */
export interface AuthenticateParams {
  email: string;
  password: string;
  deviceId: string;
  existingCookies?: Cookie[];
  verificationCode?: string; // 2FA verification code
  passwordToken?: string; // 已保存的密码令牌（用于健康检查）
}

export interface AuthenticateResult {
  passwordToken: string;
  DSID: string;
  cookies: Cookie[];
  pod?: number;
  storeFront?: string;
}

export async function authenticateAccount(
  params: AuthenticateParams
): Promise<AuthenticateResult> {
  appleLog('[AUTH] === Authentication Start ===');
  appleLog(`[AUTH] Email: ${params.email}`);
  appleLog(`[AUTH] Device: ${params.deviceId}`);
  appleLog(`[AUTH] Has passwordToken: ${!!params.passwordToken}`);
  appleLog(`[AUTH] Has verificationCode: ${!!params.verificationCode}`);
  appleLog(`[AUTH] verificationCode value: ${params.verificationCode || 'none'}`);

  const bag = await fetchBag(params.deviceId);
  appleLog(`[AUTH] Bag authURL: ${bag.authURL}`);

  const authURL = new URL(bag.authURL);
  authURL.searchParams.set('guid', params.deviceId);

  // 如果有 passwordToken，使用 token 而不是密码
  const passwordValue = params.passwordToken || 
    (params.verificationCode 
      ? `${params.password}${params.verificationCode}` 
      : params.password);

  appleLog(`[AUTH] Password value type: ${params.passwordToken ? 'token' : params.verificationCode ? '2FA' : 'plain'}`);

  const body = buildPlist({
    appleId: params.email,
    password: passwordValue,
    attempt: params.verificationCode ? '2' : '4',
    guid: params.deviceId,
    rmp: '0',
    why: 'signIn',
  });

  appleLog(`[AUTH] Request body length: ${body.length}`);

  let currentURL = authURL.toString();
  let redirectCount = 0;
  const maxRedirects = 3;

  while (redirectCount <= maxRedirects) {
    appleLog(`[AUTH] Attempt ${redirectCount + 1}: ${currentURL}`);

    const response = await AppleClient.request({
      method: 'POST',
      url: currentURL,
      headers: {
        'Content-Type': 'application/x-apple-plist',
      },
      body,
      cookies: params.existingCookies,
    });

    appleLog(`[AUTH] Response status: ${response.status}`);
    appleLog(`[AUTH] Response body length: ${response.body.length}`);
    appleLog(`[AUTH] Response preview: ${response.body.substring(0, 200)}`);

    // 处理重定向（302）
    if (response.status === 302) {
      const location = response.headers['location'];
      if (!location) {
        appleLog('[AUTH] ERROR: Redirect without Location header');
        throw new Error('Redirect without Location header');
      }
      currentURL = location.startsWith('http') ? location : `https://${new URL(currentURL).host}${location}`;
      redirectCount++;
      appleLog(`[AUTH] Following redirect to: ${currentURL}`);
      continue;
    }

    // 检查响应体
    if (!response.body || !response.body.trim()) {
      appleLog(`[AUTH] ERROR: Empty response body, status: ${response.status}`);
      throw new Error(`Authentication failed with empty body (status ${response.status})`);
    }

    if (response.status !== 200) {
      const preview = response.body.substring(0, 500);
      appleLog(`[AUTH] ERROR: Non-200 status: ${response.status}, body: ${preview}`);
      throw new Error(`Authentication failed with status ${response.status}`);
    }

    let result: any;
    try {
      result = parsePlist(response.body);
      appleLog('[AUTH] Plist parsed successfully');
    } catch (error) {
      appleLog(`[AUTH] ERROR: Plist parse failed: ${error instanceof Error ? error.message : String(error)}`);
      appleLog(`[AUTH] Response body: ${response.body.substring(0, 1000)}`);
      throw new Error(`Failed to parse authentication response: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    if (result.failureType) {
      appleLog(`[AUTH] ERROR: Auth failed: ${result.customerMessage || result.failureType}`);
      throw new Error(
        result.customerMessage || `Authentication failed: ${result.failureType}`
      );
    }

    // 检查是否需要2FA
    if (
      result.failureType === '' &&
      !params.verificationCode &&
      result.customerMessage === 'MZFinance.BadLogin.Configurator_message'
    ) {
      appleLog('[AUTH] ERROR: 2FA required but not provided');
      throw new Error('REQUIRES_2FA_VERIFICATION');
    }

    const accountInfo = result.accountInfo;
    if (!accountInfo || !accountInfo.address) {
      appleLog('[AUTH] ERROR: Missing accountInfo or address');
      throw new Error('Authentication response missing required fields');
    }

    if (!result.passwordToken || !result.dsPersonId) {
      appleLog('[AUTH] ERROR: Missing passwordToken or dsPersonId');
      appleLog(`[AUTH] result keys: ${Object.keys(result).join(', ')}`);
      appleLog(`[AUTH] passwordToken value: ${JSON.stringify(result.passwordToken)}`);
      appleLog(`[AUTH] dsPersonId value: ${JSON.stringify(result.dsPersonId)}`);
      throw new Error('Authentication response missing passwordToken or dsPersonId');
    }

    const cookies = AppleClient.mergeCookies(
      params.existingCookies || [],
      response.cookies
    );

    appleLog('[AUTH] === Authentication Success ===');
    appleLog(`[AUTH] Returning passwordToken: ${result.passwordToken}`);
    appleLog(`[AUTH] Returning DSID: ${result.dsPersonId}`);

    return {
      passwordToken: result.passwordToken,
      DSID: result.dsPersonId,
      cookies,
      pod: AppleClient.extractPod(response.headers),
      storeFront: AppleClient.extractStoreFront(response.headers),
    };
  }

  appleLog(`[AUTH] ERROR: Max redirects (${maxRedirects}) exceeded`);
  throw new Error(`Authentication failed after ${maxRedirects} redirects`);
}

/**
 * 购买应用（获取 SINF）
 */
export interface PurchaseParams {
  appId: number;
  deviceId: string;
  passwordToken: string;
  DSID: string;
  cookies: Cookie[];
  pod?: number;
}

export interface PurchaseResult {
  sinfs: string[]; // Base64-encoded SINF data
}

export async function purchaseApp(params: PurchaseParams): Promise<PurchaseResult> {
  appleLog('[PURCHASE] === Purchase Start ===');
  appleLog(`[PURCHASE] App ID: ${params.appId}`);
  appleLog(`[PURCHASE] Device: ${params.deviceId}`);
  appleLog(`[PURCHASE] Pod: ${params.pod || 'none'}`);
  appleLog(`[PURCHASE] DSID: ${params.DSID}`);
  appleLog(`[PURCHASE] Has passwordToken: ${!!params.passwordToken}`);
  appleLog(`[PURCHASE] Cookies count: ${params.cookies.length}`);

  const host = params.pod
    ? `p${params.pod}-buy.itunes.apple.com`
    : 'buy.itunes.apple.com';

  appleLog(`[PURCHASE] Target host: ${host}`);

  const body = buildPlist({
    creditDisplay: '',
    guid: params.deviceId,
    salableAdamId: params.appId,
    appExtVrsId: 0, // 0 = latest version
  });

  appleLog(`[PURCHASE] Request body length: ${body.length}`);

  const response = await AppleClient.request({
    method: 'POST',
    url: `https://${host}/WebObjects/MZFinance.woa/wa/volumeStoreDownloadProduct`,
    headers: {
      'Content-Type': 'application/x-apple-plist',
      'iCloud-DSID': params.DSID,
      'X-Dsid': params.DSID,
      'X-Apple-I-MD-M': params.passwordToken,
    },
    body,
    cookies: params.cookies,
  });

  appleLog(`[PURCHASE] Response status: ${response.status}`);
  appleLog(`[PURCHASE] Response body length: ${response.body.length}`);
  appleLog(`[PURCHASE] Response preview: ${response.body.substring(0, 500)}`);

  if (response.status !== 200) {
    appleLog(`[PURCHASE] ERROR: Non-200 status: ${response.status}`);
    throw new Error(`Purchase failed with status ${response.status}`);
  }

  let result: any;
  try {
    result = parsePlist(response.body);
    appleLog('[PURCHASE] Plist parsed successfully');
  } catch (error) {
    appleLog(`[PURCHASE] ERROR: Plist parse failed: ${error instanceof Error ? error.message : String(error)}`);
    appleLog(`[PURCHASE] Response body: ${response.body.substring(0, 1000)}`);
    throw new Error(`Failed to parse purchase response: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  if (result.failureType) {
    appleLog(`[PURCHASE] ERROR: Purchase failed: ${result.customerMessage || result.failureType}`);
    appleLog(`[PURCHASE] Full result: ${JSON.stringify(result, null, 2)}`);
    throw new Error(result.customerMessage || `Purchase failed: ${result.failureType}`);
  }

  if (!result.songList || result.songList.length === 0) {
    appleLog('[PURCHASE] ERROR: No SINF data returned');
    appleLog(`[PURCHASE] result keys: ${Object.keys(result).join(', ')}`);
    throw new Error('No SINF data returned');
  }

  const sinfs = result.songList.map((song: any) => song.sinf);
  appleLog(`[PURCHASE] === Purchase Success ===`);
  appleLog(`[PURCHASE] SINF count: ${sinfs.length}`);

  return { sinfs };
}

/**
 * 获取下载信息
 */
export interface DownloadInfoParams extends PurchaseParams {
  externalVersionId?: number; // 指定版本 ID
}

export interface DownloadInfoResult {
  downloadURL: string;
  sinfs: string[];
  metadata?: string; // Base64-encoded iTunesMetadata.plist
}

export async function getDownloadInfo(
  params: DownloadInfoParams
): Promise<DownloadInfoResult> {
  appleLog('[DOWNLOAD_INFO] === Get Download Info Start ===');
  appleLog(`[DOWNLOAD_INFO] App ID: ${params.appId}`);
  appleLog(`[DOWNLOAD_INFO] Device: ${params.deviceId}`);
  appleLog(`[DOWNLOAD_INFO] Pod: ${params.pod || 'none'}`);
  appleLog(`[DOWNLOAD_INFO] External version ID: ${params.externalVersionId || 'latest'}`);

  const host = params.pod
    ? `p${params.pod}-buy.itunes.apple.com`
    : 'p25-buy.itunes.apple.com';

  appleLog(`[DOWNLOAD_INFO] Target host: ${host}`);

  const body = buildPlist({
    creditDisplay: '',
    guid: params.deviceId,
    salableAdamId: params.appId,
    ...(params.externalVersionId && { appExtVrsId: params.externalVersionId }),
  });

  appleLog(`[DOWNLOAD_INFO] Request body length: ${body.length}`);

  const response = await AppleClient.request({
    method: 'POST',
    url: `https://${host}/WebObjects/MZFinance.woa/wa/volumeStoreDownloadProduct`,
    headers: {
      'Content-Type': 'application/x-apple-plist',
      'iCloud-DSID': params.DSID,
      'X-Dsid': params.DSID,
      'X-Apple-I-MD-M': params.passwordToken,
    },
    body,
    cookies: params.cookies,
  });

  appleLog(`[DOWNLOAD_INFO] Response status: ${response.status}`);
  appleLog(`[DOWNLOAD_INFO] Response body length: ${response.body.length}`);
  appleLog(`[DOWNLOAD_INFO] Response preview: ${response.body.substring(0, 500)}`);

  if (response.status !== 200) {
    appleLog(`[DOWNLOAD_INFO] ERROR: Non-200 status: ${response.status}`);
    throw new Error(`Get download info failed with status ${response.status}`);
  }

  let result: any;
  try {
    result = parsePlist(response.body);
    appleLog('[DOWNLOAD_INFO] Plist parsed successfully');
  } catch (error) {
    appleLog(`[DOWNLOAD_INFO] ERROR: Plist parse failed: ${error instanceof Error ? error.message : String(error)}`);
    throw new Error(`Failed to parse download info response: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }

  if (result.failureType) {
    appleLog(`[DOWNLOAD_INFO] ERROR: ${result.customerMessage || result.failureType}`);
    throw new Error(
      result.customerMessage || `Get download info failed: ${result.failureType}`
    );
  }

  if (!result.songList || result.songList.length === 0) {
    appleLog('[DOWNLOAD_INFO] ERROR: No download info returned');
    throw new Error('No download info returned');
  }

  const song = result.songList[0];
  appleLog(`[DOWNLOAD_INFO] === Get Download Info Success ===`);
  appleLog(`[DOWNLOAD_INFO] Download URL: ${song.URL}`);
  appleLog(`[DOWNLOAD_INFO] SINF count: ${result.songList.length}`);

  return {
    downloadURL: song.URL,
    sinfs: result.songList.map((s: any) => s.sinf),
    metadata: song.metadata ? btoa(buildPlist(song.metadata)) : undefined,
  };
}
