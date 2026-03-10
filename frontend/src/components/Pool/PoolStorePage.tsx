import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import PageContainer from '../Layout/PageContainer';
import Alert from '../common/Alert';
import Spinner from '../common/Spinner';
import AppIcon from '../common/AppIcon';
import { useToastStore } from '../../store/toast';
import { useAccountsStore } from '../../store/accounts';
import { allocatePoolAccount, releasePoolAccount, updatePoolAccountCredentials, type PoolAccountCredentials } from '../../api/pool';
import { authenticate } from '../../apple/authenticate';
import { purchaseApp } from '../../apple/purchase';
import { getDownloadInfo } from '../../apple/download';
import { searchApps, type Software } from '../../api/search';
import { startDownload } from '../../api/downloads';
import { getErrorMessage } from '../../utils/error';
import { accountHash } from '../../utils/account';
import type { Account } from '../../types';

export default function PoolStorePage() {
  const navigate = useNavigate();
  const addToast = useToastStore((s) => s.addToast);
  const accounts = useAccountsStore((s) => s.accounts);
  const addAccount = useAccountsStore((s) => s.addAccount);
  const updateAccount = useAccountsStore((s) => s.updateAccount);

  const [poolAccount, setPoolAccount] = useState<PoolAccountCredentials | null>(null);
  const [allocating, setAllocating] = useState(false);
  const [authenticating, setAuthenticating] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [error, setError] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');

  // 白名单应用
  const [whitelistApps, setWhitelistApps] = useState<Software[]>([]);
  const [loadingApps, setLoadingApps] = useState(false);
  const [appsError, setAppsError] = useState('');
  const [selectedApp, setSelectedApp] = useState<Software | null>(null);
  
  // 搜索过滤（仅在白名单内搜索）
  const [searchQuery, setSearchQuery] = useState('');
  const filteredApps = searchQuery.trim()
    ? whitelistApps.filter(app =>
        app.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        app.bundleID.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : whitelistApps;

  // 检查是否已有账号池账号在 store 中（页面加载时恢复状态）
  useEffect(() => {
    const poolAcct = accounts.find(a => a.email && (a.email.includes('owylssl') || a.email.includes('@gmail.com')));
    if (poolAcct && !authenticated && !poolAccount) {
      // 恢复账号信息
      setPoolAccount({
        accountId: 0, // 临时ID
        email: poolAcct.email,
        password: '', // 不需要密码
        deviceIdentifier: poolAcct.deviceIdentifier,
        country: 'us', // 默认美区
        pod: poolAcct.pod || null,
      });
      setAuthenticated(true);
      setLoadingMessage('');
    }
  }, [accounts, authenticated, poolAccount]);

  // 加载白名单应用
  useEffect(() => {
    if (authenticated && poolAccount) {
      loadWhitelistApps();
    }
  }, [authenticated, poolAccount]);

  const loadWhitelistApps = async () => {
    try {
      setLoadingApps(true);
      setAppsError('');
      
      const response = await fetch(`/api/user/apps?country=${poolAccount?.country || 'us'}`);
      if (!response.ok) {
        throw new Error('加载失败');
      }
      
      const apps = await response.json();
      
      // 转换为 Software 格式
      const softwareList: Software[] = apps.map((app: any) => ({
        id: app.software_id,
        bundleID: app.bundle_id,
        name: app.name,
        artworkUrl: app.artwork_url || '',
        version: app.version || '1.0',
        artistName: '开发商',
        sellerName: '开发商',
        description: '',
        averageUserRating: 0,
        userRatingCount: 0,
        screenshotUrls: [],
        minimumOsVersion: '12.0',
        fileSizeBytes: '0',
        releaseNotes: '',
        formattedPrice: 'Free',
        primaryGenreName: app.category || '工具',
        price: 0,
        releaseDate: new Date().toISOString(),
      }));
      
      setWhitelistApps(softwareList);
    } catch (err) {
      setAppsError(getErrorMessage(err, '加载应用列表失败'));
    } finally {
      setLoadingApps(false);
    }
  };

  // 获取池账号并自动登录
  const handleGetAccount = async () => {
    try {
      setAllocating(true);
      setError('');
      setLoadingMessage('正在分配账号...');

      // 1. 从服务器获取池账号
      const account = await allocatePoolAccount();
      setPoolAccount(account);
      setLoadingMessage(`已分配账号: ${account.email}`);

      // 2. 自动在浏览器登录
      setAuthenticating(true);
      setLoadingMessage('正在登录账号...');
      await loginWithPoolAccount(account);
      
      setAuthenticated(true);
      setLoadingMessage('');
      addToast('登录成功', 'success');
    } catch (err) {
      const errorMsg = getErrorMessage(err, '获取账号失败');
      setError(errorMsg);
      setLoadingMessage('');
      addToast(errorMsg, 'error');
    } finally {
      setAllocating(false);
      setAuthenticating(false);
    }
  };

  // 使用池账号登录（支持自动获取2FA验证码）
  const loginWithPoolAccount = async (account: PoolAccountCredentials) => {
    try {
      console.log('[Pool] Starting authentication for:', account.email);
      
      let verificationCode: string | undefined;

      // 如果有验证码API，尝试自动获取
      if (account.verificationCodeApi) {
        try {
          console.log('[Pool] Fetching 2FA code from API...');
          // 通过后端代理获取验证码（避免CORS）
          const response = await fetch(`/api/pool/verification-code?url=${encodeURIComponent(account.verificationCodeApi)}`);
          const data = await response.json();
          
          if (data.code) {
            verificationCode = data.code;
            console.log('[Pool] Auto-fetched 2FA code:', verificationCode);
          } else {
            console.log('[Pool] No code in response:', data);
          }
        } catch (fetchError) {
          console.warn('[Pool] Failed to fetch verification code:', fetchError);
          // 继续尝试不用验证码登录
        }
      }

      // 确保 libcurl 已初始化
      console.log('[Pool] Ensuring libcurl is initialized...');
      const { initLibcurl } = await import('../../apple/libcurl-init');
      await initLibcurl();
      console.log('[Pool] libcurl ready, starting authentication...');

      // 使用 libcurl.js 在浏览器端认证
      const authResult = await authenticate(
        account.email,
        account.password,
        verificationCode,
        undefined,
        account.deviceIdentifier
      );

      console.log('[Pool] Authentication successful, updating server credentials...');

      // 将账号添加到 store（用于持久化状态）
      const accountData: Account = {
        email: account.email, // 使用原始邮箱
        passwordToken: authResult.passwordToken,
        directoryServicesIdentifier: authResult.dsPersonId,
        cookies: authResult.cookies,
        store: authResult.store,
        pod: authResult.pod,
        deviceIdentifier: account.deviceIdentifier,
      };
      addAccount(accountData);

      // 认证成功，回传新的凭据到服务器
      await updatePoolAccountCredentials(account.accountId, {
        passwordToken: authResult.passwordToken,
        DSID: authResult.dsPersonId,
        cookies: authResult.cookies.reduce((acc, c) => {
          acc[c.name] = c.value;
          return acc;
        }, {} as Record<string, string>),
        pod: authResult.pod,
      });

      console.log('[Pool] Credentials updated successfully');
    } catch (err: any) {
      console.error('[Pool] Authentication error:', err);
      
      // 如果是2FA错误且没有验证码API，提示用户
      if (err.codeRequired && !account.verificationCodeApi) {
        throw new Error('此账号需要双重认证，但未配置验证码API。请联系管理员。');
      }
      
      // 如果是 SSL 错误，给出更友好的提示
      if (err.message && err.message.includes('code35')) {
        throw new Error('SSL 连接失败 (code35)。可能原因：1) Wisp 代理未运行 2) 网络连接问题 3) 浏览器安全限制。请刷新页面重试。');
      }
      
      throw err;
    }
  };

  // 下载应用（使用服务器端API）
  const handleDownload = async (app: Software) => {
    try {
      setDownloading(true);
      setLoadingMessage('正在创建下载任务...');

      // 直接调用后端API，让服务器处理购买和下载
      const response = await fetch('/api/user/quick-download', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          softwareId: app.id,
          bundleId: app.bundleID,
          country: poolAccount?.country || 'us',
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || error.details || '下载失败');
      }

      const result = await response.json();
      
      setLoadingMessage('');
      addToast('下载已开始', 'success');
      navigate('/downloads');
    } catch (err: any) {
      const errorMsg = getErrorMessage(err, '下载失败');
      setLoadingMessage('');
      addToast(errorMsg, 'error');
      console.error('[Pool] Download error:', err);
    } finally {
      setDownloading(false);
    }
  };

  // 不再需要搜索函数，改为本地过滤

  // 释放账号（组件卸载时）
  useEffect(() => {
    return () => {
      if (poolAccount) {
        releasePoolAccount(poolAccount.accountId).catch(console.error);
      }
    };
  }, [poolAccount]);

  return (
    <PageContainer title="应用商店">
      {/* 加载消息提示 */}
      {loadingMessage && (
        <div className="mb-6">
          <Alert type="info">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Spinner />
                <span>{loadingMessage}</span>
              </div>
              <button
                onClick={() => setLoadingMessage('')}
                className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              >
                ✕
              </button>
            </div>
          </Alert>
        </div>
      )}

      {error && (
        <div className="mb-6">
          <Alert type="error">{error}</Alert>
        </div>
      )}

      {/* 账号状态卡片 - 紧凑样式 */}
      <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4 mb-4">
        {!poolAccount ? (
          <div className="text-center">
            <h3 className="text-base font-semibold mb-1.5">获取共享账号</h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
              无需自己的 Apple ID，使用共享账号池即可下载应用
            </p>
            <button
              onClick={handleGetAccount}
              disabled={allocating}
              className="px-5 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {allocating ? <Spinner /> : '获取账号'}
            </button>
          </div>
        ) : authenticating ? (
          <div className="text-center py-2">
            <Spinner size="lg" />
            <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">正在登录账号...</p>
          </div>
        ) : authenticated ? (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold">已登录</h3>
                <p className="text-xs text-gray-600 dark:text-gray-400 truncate">{poolAccount.email}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-gray-600 dark:text-gray-400">国家/地区:</span>
                <span className="ml-1.5 font-medium">{poolAccount.country.toUpperCase()}</span>
              </div>
              <div>
                <span className="text-gray-600 dark:text-gray-400">设备ID:</span>
                <span className="ml-1.5 font-mono text-xs">{poolAccount.deviceIdentifier.slice(0, 8)}...</span>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {/* 过滤搜索框 - 仅在白名单内搜索 */}
      {authenticated && (
        <>
          {appsError && (
            <div className="mb-4">
              <Alert type="error">{appsError}</Alert>
            </div>
          )}

          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4 mb-4">
            <div className="flex gap-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索可下载的应用..."
                className="flex-1 px-3 py-2 text-base border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 text-sm rounded-md hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors whitespace-nowrap"
                >
                  清除
                </button>
              )}
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-gray-600 dark:text-gray-400">
              <span>共 {whitelistApps.length} 个应用{searchQuery && ` · 显示 ${filteredApps.length} 个结果`}</span>
              <button
                onClick={loadWhitelistApps}
                disabled={loadingApps}
                className="text-blue-600 hover:text-blue-700 disabled:opacity-50"
              >
                {loadingApps ? '刷新中...' : '刷新列表'}
              </button>
            </div>
          </div>

          {/* 白名单应用列表 - 紧凑样式 */}
          {!selectedApp && !loadingApps && filteredApps.length > 0 && (
            <div className="space-y-3">
              {filteredApps.map((app) => (
                <div
                  key={app.id}
                  className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-3 hover:border-blue-500 transition-colors cursor-pointer"
                  onClick={() => setSelectedApp(app)}
                >
                  <div className="flex items-center gap-3">
                    <AppIcon src={app.artworkUrl} name={app.name} size={48} />
                    <div className="flex-1 min-w-0">
                      <h3 className="font-medium text-sm truncate">{app.name}</h3>
                      <p className="text-xs text-gray-600 dark:text-gray-400 truncate">{app.artistName}</p>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500 dark:text-gray-400">
                        <span className="truncate">{app.primaryGenreName}</span>
                        <span>v{app.version}</span>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className="text-sm font-semibold text-blue-600">{app.formattedPrice || 'Free'}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 空状态 */}
          {!selectedApp && !loadingApps && filteredApps.length === 0 && whitelistApps.length > 0 && (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              <p>没有找到匹配的应用</p>
              <button
                onClick={() => setSearchQuery('')}
                className="mt-2 text-blue-600 hover:text-blue-700 text-sm"
              >
                清除搜索
              </button>
            </div>
          )}

          {!selectedApp && !loadingApps && whitelistApps.length === 0 && (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              <svg className="w-16 h-16 mx-auto mb-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
              </svg>
              <p className="font-medium">暂无可下载的应用</p>
              <p className="text-sm mt-1">请联系管理员添加应用到白名单</p>
            </div>
          )}

          {loadingApps && (
            <div className="text-center py-12">
              <Spinner size="lg" />
              <p className="mt-4 text-gray-600 dark:text-gray-400">加载应用列表...</p>
            </div>
          )}

          {/* 应用详情 - 紧凑样式 */}
          {selectedApp && (
            <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
              {/* 返回按钮 */}
              <button
                onClick={() => setSelectedApp(null)}
                className="mb-3 flex items-center gap-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
                返回搜索结果
              </button>

              {/* 应用信息 */}
              <div className="flex items-start gap-3 mb-4">
                <AppIcon src={selectedApp.artworkUrl} name={selectedApp.name} size={64} />
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg font-bold mb-1">{selectedApp.name}</h2>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-1.5 truncate">{selectedApp.artistName}</p>
                  <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                    <span className="truncate">{selectedApp.primaryGenreName}</span>
                    <span>v{selectedApp.version}</span>
                    {selectedApp.averageUserRating > 0 && (
                      <span>★ {selectedApp.averageUserRating.toFixed(1)}</span>
                    )}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-lg font-bold text-blue-600 mb-2">
                    {selectedApp.formattedPrice || 'Free'}
                  </div>
                  <button
                    onClick={() => handleDownload(selectedApp)}
                    disabled={downloading}
                    className="px-5 py-1.5 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {downloading ? (
                      <>
                        <Spinner />
                        <span>获取中</span>
                      </>
                    ) : (
                      '获取'
                    )}
                  </button>
                </div>
              </div>

              {/* 应用描述 */}
              {selectedApp.description && (
                <div className="mb-4">
                  <h3 className="text-sm font-semibold mb-1.5">应用简介</h3>
                  <p className="text-xs text-gray-600 dark:text-gray-400 whitespace-pre-line line-clamp-4">
                    {selectedApp.description}
                  </p>
                </div>
              )}

              {/* 应用信息 */}
              <div className="grid grid-cols-2 gap-3 text-xs border-t border-gray-200 dark:border-gray-800 pt-3">
                <div>
                  <span className="text-gray-600 dark:text-gray-400">开发商:</span>
                  <span className="ml-1.5 font-medium truncate block">{selectedApp.sellerName || selectedApp.artistName}</span>
                </div>
                <div>
                  <span className="text-gray-600 dark:text-gray-400">大小:</span>
                  <span className="ml-1.5 font-medium">
                    {(parseInt(selectedApp.fileSizeBytes) / 1024 / 1024).toFixed(1)} MB
                  </span>
                </div>
                <div>
                  <span className="text-gray-600 dark:text-gray-400">版本:</span>
                  <span className="ml-1.5 font-medium">{selectedApp.version}</span>
                </div>
                <div>
                  <span className="text-gray-600 dark:text-gray-400">最低系统:</span>
                  <span className="ml-1.5 font-medium">iOS {selectedApp.minimumOsVersion}</span>
                </div>
                <div className="col-span-2">
                  <span className="text-gray-600 dark:text-gray-400">Bundle ID:</span>
                  <span className="ml-1.5 font-mono text-xs truncate block">{selectedApp.bundleID}</span>
                </div>
              </div>

              {/* 更新说明 */}
              {selectedApp.releaseNotes && (
                <div className="mt-4 border-t border-gray-200 dark:border-gray-800 pt-3">
                  <h3 className="text-sm font-semibold mb-1.5">更新内容</h3>
                  <p className="text-xs text-gray-600 dark:text-gray-400 whitespace-pre-line line-clamp-3">
                    {selectedApp.releaseNotes}
                  </p>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </PageContainer>
  );
}
