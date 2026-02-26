import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import PageContainer from '../Layout/PageContainer';
import Alert from '../common/Alert';
import Spinner from '../common/Spinner';
import AppIcon from '../common/AppIcon';
import { useToastStore } from '../../store/toast';
import { getPoolApps, quickDownload, type PoolApp } from '../../api/pool';
import { getErrorMessage } from '../../utils/error';
import { countryNames } from '../../utils/countries';

export default function PoolStorePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const showToast = useToastStore((s) => s.showToast);

  const [apps, setApps] = useState<PoolApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterCountry, setFilterCountry] = useState<string>('');
  const [downloadingApps, setDownloadingApps] = useState<Set<number>>(new Set());

  // 加载应用列表
  const loadApps = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await getPoolApps(filterCountry || undefined);
      setApps(data);
    } catch (err) {
      setError(getErrorMessage(err, '加载应用列表失败'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadApps();
  }, [filterCountry]);

  // 一键下载
  const handleDownload = async (app: PoolApp) => {
    try {
      setDownloadingApps((prev) => new Set(prev).add(app.id));
      
      const result = await quickDownload({
        softwareId: app.software_id,
        bundleId: app.bundle_id,
        country: app.country,
      });

      showToast(result.message || '下载任务已创建', 'success');
      
      // 跳转到下载页面
      setTimeout(() => {
        navigate('/downloads');
      }, 1000);
    } catch (err) {
      showToast(getErrorMessage(err, '下载失败'), 'error');
    } finally {
      setDownloadingApps((prev) => {
        const next = new Set(prev);
        next.delete(app.id);
        return next;
      });
    }
  };

  if (loading) {
    return (
      <PageContainer title="应用商店">
        <div className="flex justify-center py-12">
          <Spinner size="lg" />
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer title="应用商店">
      {error && (
        <div className="mb-6">
          <Alert type="error">{error}</Alert>
        </div>
      )}

      <div className="mb-6">
        <Alert type="warning">
          <div className="space-y-1">
            <p className="font-medium">账号池模式</p>
            <p className="text-sm">
              当前使用的是共享账号池，无需登录 Apple ID 即可直接下载白名单中的应用。
            </p>
          </div>
        </Alert>
      </div>

      {/* 过滤器 */}
      <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4 mb-6">
        <div className="flex items-center gap-4">
          <label className="text-sm font-medium">按国家筛选:</label>
          <select
            value={filterCountry}
            onChange={(e) => setFilterCountry(e.target.value)}
            className="flex-1 max-w-xs px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
          >
            <option value="">全部国家</option>
            {Object.entries(countryNames).map(([code, name]) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 应用网格 */}
      {apps.length === 0 ? (
        <div className="bg-gray-50 dark:bg-gray-900/30 border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-lg p-12 text-center">
          <div className="text-gray-500 dark:text-gray-400">
            <p className="text-lg font-medium mb-2">暂无可下载的应用</p>
            <p className="text-sm">管理员尚未添加任何应用到白名单</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {apps.map((app) => {
            const isDownloading = downloadingApps.has(app.id);
            return (
              <div
                key={app.id}
                className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex flex-col items-center text-center">
                  <AppIcon src={app.artwork_url || undefined} name={app.name} size="lg" />
                  <h3 className="font-medium mt-3 mb-1 line-clamp-2">{app.name}</h3>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mb-1 truncate w-full">
                    {app.bundle_id}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-500 mb-3">
                    {countryNames[app.country] || app.country}
                    {app.version && ` · v${app.version}`}
                  </p>
                  <button
                    onClick={() => handleDownload(app)}
                    disabled={isDownloading}
                    className="w-full px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {isDownloading ? (
                      <>
                        <Spinner size="sm" />
                        <span>下载中...</span>
                      </>
                    ) : (
                      <span>一键下载</span>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </PageContainer>
  );
}
