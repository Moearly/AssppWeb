import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import PageContainer from '../Layout/PageContainer';
import Alert from '../common/Alert';
import { useToastStore } from '../../store/toast';
import { setAdminApiKey, getAdminApiKey, getPoolStats } from '../../api/admin';

export default function AdminSettingsPage() {
  const { t } = useTranslation();
  const addToast = useToastStore((s) => s.addToast);

  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [isConfigured, setIsConfigured] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    const key = getAdminApiKey();
    if (key) {
      setApiKey(key);
      setIsConfigured(true);
    }
  }, []);

  // 保存配置
  const handleSave = () => {
    if (!apiKey.trim()) {
      addToast('请输入 API Key', 'error');
      return;
    }

    try {
      setAdminApiKey(apiKey.trim());
      localStorage.setItem('adminApiKey', apiKey.trim());
      setIsConfigured(true);
      addToast('配置已保存', 'success');
    } catch (err) {
      addToast('保存失败', 'error');
    }
  };

  // 测试连接
  const handleTest = async () => {
    if (!apiKey.trim()) {
      addToast('请先输入 API Key', 'error');
      return;
    }

    try {
      setTesting(true);
      setAdminApiKey(apiKey.trim());
      await getPoolStats();
      addToast('连接成功！API Key 有效', 'success');
      localStorage.setItem('adminApiKey', apiKey.trim());
      setIsConfigured(true);
    } catch (err: any) {
      const errorMessage = err.message || String(err);
      if (errorMessage.includes('401') || errorMessage.includes('Unauthorized')) {
        addToast('API Key 无效', 'error');
      } else {
        addToast('连接失败: ' + errorMessage, 'error');
      }
      setIsConfigured(false);
    } finally {
      setTesting(false);
    }
  };

  // 清除配置
  const handleClear = () => {
    if (!confirm('确定要清除管理员配置吗？')) return;

    setApiKey('');
    setIsConfigured(false);
    setAdminApiKey('');
    localStorage.removeItem('adminApiKey');
    addToast('配置已清除', 'success');
  };

  return (
    <PageContainer title="管理员设置">
      <div className="max-w-2xl">
        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-6">
          <h2 className="text-lg font-semibold mb-4">管理员 API Key 配置</h2>

          {isConfigured && (
            <div className="mb-4">
              <Alert type="success">
                管理员权限已配置，可以访问账号池和白名单管理功能。
              </Alert>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                API Key
                <span className="text-red-500 ml-1">*</span>
              </label>
              <div className="flex gap-2">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="输入管理员 API Key"
                  className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="px-3 py-2 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  {showKey ? '隐藏' : '显示'}
                </button>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                需要从服务器管理员处获取。配置后可以管理账号池和应用白名单。
              </p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleTest}
                disabled={testing || !apiKey.trim()}
                className="px-4 py-2 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
              >
                {testing ? '测试中...' : '测试连接'}
              </button>
              <button
                onClick={handleSave}
                disabled={!apiKey.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                保存配置
              </button>
              {isConfigured && (
                <button
                  onClick={handleClear}
                  className="px-4 py-2 text-red-600 border border-red-300 dark:border-red-700 rounded-md hover:bg-red-50 dark:hover:bg-red-950 transition-colors"
                >
                  清除配置
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-6 mt-6">
          <h2 className="text-lg font-semibold mb-4">权限说明</h2>
          <div className="space-y-3 text-sm text-gray-600 dark:text-gray-400">
            <div className="flex gap-3">
              <span className="text-green-600 font-medium">✓</span>
              <div>
                <p className="font-medium text-gray-900 dark:text-gray-100">账号池管理</p>
                <p>添加、删除、启用/禁用 Apple ID 账号</p>
              </div>
            </div>
            <div className="flex gap-3">
              <span className="text-green-600 font-medium">✓</span>
              <div>
                <p className="font-medium text-gray-900 dark:text-gray-100">白名单管理</p>
                <p>添加、编辑、删除可下载的应用</p>
              </div>
            </div>
            <div className="flex gap-3">
              <span className="text-green-600 font-medium">✓</span>
              <div>
                <p className="font-medium text-gray-900 dark:text-gray-100">健康检查</p>
                <p>检查账号有效性，查看健康日志</p>
              </div>
            </div>
            <div className="flex gap-3">
              <span className="text-green-600 font-medium">✓</span>
              <div>
                <p className="font-medium text-gray-900 dark:text-gray-100">统计信息</p>
                <p>查看账号池使用情况和统计数据</p>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-6 mt-6">
          <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-200 mb-2">
            ⚠️ 安全提示
          </h3>
          <ul className="text-sm text-amber-800 dark:text-amber-300 space-y-1 list-disc list-inside">
            <li>请妥善保管 API Key，不要分享给他人</li>
            <li>API Key 仅存储在浏览器本地，不会上传到服务器</li>
            <li>如果 API Key 泄露，请联系服务器管理员重新生成</li>
          </ul>
        </div>
      </div>
    </PageContainer>
  );
}
