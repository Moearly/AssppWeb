import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import PageContainer from '../Layout/PageContainer';
import Alert from '../common/Alert';
import Spinner from '../common/Spinner';
import AppIcon from '../common/AppIcon';
import { useToastStore } from '../../store/toast';
import { allocatePoolAccount, releasePoolAccount, updatePoolAccountCredentials, type PoolAccountCredentials } from '../../api/pool';
import { authenticate } from '../../apple/authenticate';
import { searchApps, type Software } from '../../api/search';
import { getErrorMessage } from '../../utils/error';

export default function PoolStorePage() {
  const navigate = useNavigate();
  const addToast = useToastStore((s) => s.addToast);

  const [poolAccount, setPoolAccount] = useState<PoolAccountCredentials | null>(null);
  const [allocating, setAllocating] = useState(false);
  const [authenticating, setAuthenticating] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [error, setError] = useState('');

  // 搜索相关
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<Software[]>([]);
  const [searchError, setSearchError] = useState('');

  // 获取池账号并自动登录
  const handleGetAccount = async () => {
    try {
      setAllocating(true);
      setError('');

      // 1. 从服务器获取池账号
      const account = await allocatePoolAccount();
      setPoolAccount(account);
      addToast(`已分配账号: ${account.email}`, 'success');

      // 2. 自动在浏览器登录
      setAuthenticating(true);
      await loginWithPoolAccount(account);
      
      setAuthenticated(true);
      addToast('登录成功', 'success');
    } catch (err) {
      const errorMsg = getErrorMessage(err, '获取账号失败');
      setError(errorMsg);
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

  // 搜索应用
  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setSearchError('请输入搜索关键词');
      return;
    }

    try {
      setSearching(true);
      setSearchError('');
      const results = await searchApps(searchQuery, poolAccount?.country || 'US');
      setSearchResults(results);
      
      if (results.length === 0) {
        setSearchError('未找到相关应用');
      }
    } catch (err) {
      setSearchError(getErrorMessage(err, '搜索失败'));
    } finally {
      setSearching(false);
    }
  };

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
      {error && (
        <div className="mb-6">
          <Alert type="error">{error}</Alert>
        </div>
      )}

      {/* 账号状态卡片 */}
      <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-6 mb-6">
        {!poolAccount ? (
          <div className="text-center">
            <h3 className="text-lg font-semibold mb-2">获取共享账号</h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              无需自己的 Apple ID，使用共享账号池即可下载应用
            </p>
            <button
              onClick={handleGetAccount}
              disabled={allocating}
              className="px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {allocating ? <Spinner /> : '获取账号'}
            </button>
          </div>
        ) : authenticating ? (
          <div className="text-center">
            <Spinner size="lg" />
            <p className="mt-4 text-gray-600 dark:text-gray-400">正在登录账号...</p>
          </div>
        ) : authenticated ? (
          <div>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center">
                <svg className="w-6 h-6 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold">已登录</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">{poolAccount.email}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-600 dark:text-gray-400">国家/地区:</span>
                <span className="ml-2 font-medium">{poolAccount.country}</span>
              </div>
              <div>
                <span className="text-gray-600 dark:text-gray-400">设备ID:</span>
                <span className="ml-2 font-mono text-xs">{poolAccount.deviceIdentifier}</span>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {/* 搜索区域 */}
      {authenticated && (
        <>
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-6 mb-6">
            <div className="flex gap-3">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="搜索应用名称或 Bundle ID..."
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
              />
              <button
                onClick={handleSearch}
                disabled={searching}
                className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {searching ? <Spinner /> : '搜索'}
              </button>
            </div>
            {searchError && (
              <div className="mt-4">
                <Alert type="error">{searchError}</Alert>
              </div>
            )}
          </div>

          {/* 搜索结果 */}
          {searchResults.length > 0 && (
            <div className="space-y-4">
              {searchResults.map((app) => (
                <div
                  key={app.id}
                  className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4 hover:border-blue-500 transition-colors cursor-pointer"
                  onClick={() => navigate(`/search/${app.id}`)}
                >
                  <div className="flex items-center gap-4">
                    <AppIcon src={app.artworkUrl} name={app.name} size={56} />
                    <div className="flex-1">
                      <h3 className="font-semibold">{app.name}</h3>
                      <p className="text-sm text-gray-600 dark:text-gray-400">{app.artistName}</p>
                      <div className="flex items-center gap-4 mt-1 text-sm text-gray-500 dark:text-gray-400">
                        <span>{app.primaryGenreName}</span>
                        <span>v{app.version}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-semibold text-blue-600">{app.formattedPrice || '免费'}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </PageContainer>
  );
}
