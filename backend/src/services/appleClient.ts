import axios, { AxiosRequestConfig } from 'axios';
import { buildPlist, parsePlist } from './plist.js';

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
  private static readonly USER_AGENT = 'Configurator/2.15 (Macintosh; OS X 11.0.0; 16G29) AppleWebKit/2603.3.8';
  
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
      maxRedirects: 3,
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
  const response = await AppleClient.request({
    method: 'GET',
    url: `https://init.itunes.apple.com/bag.xml?guid=${deviceId}`,
    headers: {
      'Accept': 'application/xml',
    },
  });

  const bag = parsePlist(response.body);

  return {
    authURL: bag.authenticateAccount || 'https://buy.itunes.apple.com/WebObjects/MZFinance.woa/wa/authenticate',
    buyURL: bag.volumeStoreDownloadProduct || 'https://buy.itunes.apple.com/WebObjects/MZFinance.woa/wa/volumeStoreDownloadProduct',
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
  const bag = await fetchBag(params.deviceId);

  const authURL = new URL(bag.authURL);
  authURL.searchParams.set('guid', params.deviceId);

  const body = buildPlist({
    appleId: params.email,
    password: params.password,
    attempt: '4',
    guid: params.deviceId,
    rmp: '0',
    why: 'signIn',
  });

  const response = await AppleClient.request({
    method: 'POST',
    url: authURL.toString(),
    headers: {
      'Content-Type': 'application/x-apple-plist',
    },
    body,
    cookies: params.existingCookies,
  });

  if (response.status !== 200) {
    throw new Error(`Authentication failed with status ${response.status}`);
  }

  const result = parsePlist(response.body);

  if (result.failureType) {
    throw new Error(
      result.customerMessage || `Authentication failed: ${result.failureType}`
    );
  }

  if (!result.passwordToken || !result.dsPersonId) {
    throw new Error('Authentication response missing required fields');
  }

  const cookies = AppleClient.mergeCookies(
    params.existingCookies || [],
    response.cookies
  );

  return {
    passwordToken: result.passwordToken,
    DSID: result.dsPersonId,
    cookies,
    pod: AppleClient.extractPod(response.headers),
    storeFront: AppleClient.extractStoreFront(response.headers),
  };
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
  const host = params.pod
    ? `p${params.pod}-buy.itunes.apple.com`
    : 'buy.itunes.apple.com';

  const body = buildPlist({
    creditDisplay: '',
    guid: params.deviceId,
    salableAdamId: params.appId,
    appExtVrsId: 0, // 0 = latest version
  });

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

  if (response.status !== 200) {
    throw new Error(`Purchase failed with status ${response.status}`);
  }

  const result = parsePlist(response.body);

  if (result.failureType) {
    throw new Error(result.customerMessage || `Purchase failed: ${result.failureType}`);
  }

  if (!result.songList || result.songList.length === 0) {
    throw new Error('No SINF data returned');
  }

  const sinfs = result.songList.map((song: any) => song.sinf);

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
  const host = params.pod
    ? `p${params.pod}-buy.itunes.apple.com`
    : 'p25-buy.itunes.apple.com';

  const body = buildPlist({
    creditDisplay: '',
    guid: params.deviceId,
    salableAdamId: params.appId,
    ...(params.externalVersionId && { appExtVrsId: params.externalVersionId }),
  });

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

  if (response.status !== 200) {
    throw new Error(`Get download info failed with status ${response.status}`);
  }

  const result = parsePlist(response.body);

  if (result.failureType) {
    throw new Error(
      result.customerMessage || `Get download info failed: ${result.failureType}`
    );
  }

  if (!result.songList || result.songList.length === 0) {
    throw new Error('No download info returned');
  }

  const song = result.songList[0];

  return {
    downloadURL: song.URL,
    sinfs: result.songList.map((s: any) => s.sinf),
    metadata: song.metadata ? btoa(buildPlist(song.metadata)) : undefined,
  };
}
