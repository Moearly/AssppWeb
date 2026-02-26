import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import PageContainer from '../Layout/PageContainer';
import Alert from '../common/Alert';
import Spinner from '../common/Spinner';
import Badge from '../common/Badge';
import Modal from '../common/Modal';
import { useToastStore } from '../../store/toast';
import {
  getPoolAccounts,
  deletePoolAccount,
  updateAccountStatus,
  checkAccountHealth,
  checkAllAccountsHealth,
  getPoolStats,
  addPoolAccount,
  type PoolAccount,
  type PoolStats,
} from '../../api/admin';
import { getErrorMessage } from '../../utils/error';
import { countryNames } from '../../utils/countries';

export default function AdminPoolPage() {
  const { t } = useTranslation();
  const showToast = useToastStore((s) => s.showToast);

  const [accounts, setAccounts] = useState<PoolAccount[]>([]);
  const [stats, setStats] = useState<PoolStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterCountry, setFilterCountry] = useState<string>('');
  
  // 添加账号模态框
  const [showAddModal, setShowAddModal] = useState(false);
  const [adding, setAdding] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    country: 'US',
    deviceIdentifier: '',
  });

  // 加载数据
  const loadData = async () => {
    try {
      setLoading(true);
      setError('');
      const [accountsData, statsData] = await Promise.all([
        getPoolAccounts({ status: filterStatus || undefined, country: filterCountry || undefined }),
        getPoolStats(),
      ]);
      setAccounts(accountsData);
      setStats(statsData);
    } catch (err) {
      setError(getErrorMessage(err, '加载账号池数据失败'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [filterStatus, filterCountry]);

  // 删除账号
  const handleDelete = async (id: number, email: string) => {
    if (!confirm(`确定要删除账号 ${email} 吗？`)) return;
    
    try {
      await deletePoolAccount(id);
      showToast('账号已删除', 'success');
      loadData();
    } catch (err) {
      showToast(getErrorMessage(err, '删除失败'), 'error');
    }
  };

  // 更新状态
  const handleUpdateStatus = async (id: number, status: 'active' | 'disabled' | 'expired') => {
    try {
      await updateAccountStatus(id, status);
      showToast('状态已更新', 'success');
      loadData();
    } catch (err) {
      showToast(getErrorMessage(err, '更新失败'), 'error');
    }
  };

  // 健康检查
  const handleHealthCheck = async (id: number) => {
    try {
      const result = await checkAccountHealth(id);
      showToast(`健康检查完成: ${result.status}`, 'success');
      loadData();
    } catch (err) {
      showToast(getErrorMessage(err, '健康检查失败'), 'error');
    }
  };

  // 批量健康检查
  const handleCheckAll = async () => {
    if (!confirm('确定要检查所有账号的健康状态吗？这可能需要几分钟时间。')) return;
    
    try {
      const result = await checkAllAccountsHealth();
      showToast(`已检查 ${result.checked} 个账号`, 'success');
      loadData();
    } catch (err) {
      showToast(getErrorMessage(err, '批量检查失败'), 'error');
    }
  };

  // 添加账号
  const handleAdd = async () => {
    if (!formData.email || !formData.password || !formData.deviceIdentifier) {
      showToast('请填写所有必填字段', 'error');
      return;
    }

    try {
      setAdding(true);
      await addPoolAccount(formData);
      showToast('账号已添加', 'success');
      setShowAddModal(false);
      setFormData({ email: '', password: '', country: 'US', deviceIdentifier: '' });
      loadData();
    } catch (err) {
      showToast(getErrorMessage(err, '添加失败'), 'error');
    } finally {
      setAdding(false);
    }
  };

  // 生成随机设备 ID
  const generateDeviceId = () => {
    const chars = '0123456789ABCDEF';
    let id = '';
    for (let i = 0; i < 12; i++) {
      id += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setFormData({ ...formData, deviceIdentifier: id });
  };

  const getStatusBadge = (status: string) => {
    const statusMap = {
      active: { label: '正常', variant: 'success' as const },
      disabled: { label: '已禁用', variant: 'default' as const },
      expired: { label: '已过期', variant: 'warning' as const },
      error: { label: '错误', variant: 'error' as const },
    };
    const config = statusMap[status as keyof typeof statusMap] || { label: status, variant: 'default' as const };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  if (loading) {
    return (
      <PageContainer title="账号池管理">
        <div className="flex justify-center py-12">
          <Spinner size="lg" />
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer
      title="账号池管理"
      action={
        <button
          onClick={() => setShowAddModal(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
        >
          添加账号
        </button>
      }
    >
      {error && (
        <div className="mb-6">
          <Alert type="error">{error}</Alert>
        </div>
      )}

      {/* 统计卡片 */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
            <div className="text-sm text-gray-600 dark:text-gray-400">总账号数</div>
            <div className="text-2xl font-semibold mt-1">{stats.total}</div>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
            <div className="text-sm text-gray-600 dark:text-gray-400">正常</div>
            <div className="text-2xl font-semibold text-green-600 mt-1">{stats.active}</div>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
            <div className="text-sm text-gray-600 dark:text-gray-400">已禁用</div>
            <div className="text-2xl font-semibold text-gray-600 mt-1">{stats.disabled}</div>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4">
            <div className="text-sm text-gray-600 dark:text-gray-400">已过期</div>
            <div className="text-2xl font-semibold text-yellow-600 mt-1">{stats.expired}</div>
          </div>
        </div>
      )}

      {/* 过滤器 */}
      <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4 mb-6">
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium mb-1">状态</label>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
            >
              <option value="">全部</option>
              <option value="active">正常</option>
              <option value="disabled">已禁用</option>
              <option value="expired">已过期</option>
              <option value="error">错误</option>
            </select>
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium mb-1">国家</label>
            <select
              value={filterCountry}
              onChange={(e) => setFilterCountry(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
            >
              <option value="">全部</option>
              {Object.entries(countryNames).map(([code, name]) => (
                <option key={code} value={code}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={handleCheckAll}
              className="px-4 py-2 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              批量健康检查
            </button>
          </div>
        </div>
      </div>

      {/* 账号列表 */}
      {accounts.length === 0 ? (
        <div className="bg-gray-50 dark:bg-gray-900/30 border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-lg p-12 text-center">
          <div className="text-gray-500 dark:text-gray-400">
            <p className="text-lg font-medium mb-2">暂无账号</p>
            <p className="text-sm">点击"添加账号"按钮添加第一个账号</p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {accounts.map((account) => (
            <div
              key={account.id}
              className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4"
            >
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="font-medium">{account.email}</span>
                    {getStatusBadge(account.status)}
                  </div>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm text-gray-600 dark:text-gray-400">
                    <div>国家: {countryNames[account.country] || account.country}</div>
                    <div>使用次数: {account.usage_count}</div>
                    <div>设备 ID: {account.device_identifier}</div>
                    <div>
                      最后使用: {account.last_used_at ? new Date(account.last_used_at).toLocaleString('zh-CN') : '未使用'}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleHealthCheck(account.id)}
                    className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  >
                    健康检查
                  </button>
                  {account.status === 'active' ? (
                    <button
                      onClick={() => handleUpdateStatus(account.id, 'disabled')}
                      className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    >
                      禁用
                    </button>
                  ) : (
                    <button
                      onClick={() => handleUpdateStatus(account.id, 'active')}
                      className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                    >
                      启用
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(account.id, account.email)}
                    className="px-3 py-1 text-sm text-red-600 border border-red-300 dark:border-red-700 rounded-md hover:bg-red-50 dark:hover:bg-red-950 transition-colors"
                  >
                    删除
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 添加账号模态框 */}
      <Modal open={showAddModal} onClose={() => setShowAddModal(false)} title="添加账号">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Apple ID 邮箱</label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="example@icloud.com"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">密码</label>
            <input
              type="password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              placeholder="••••••••"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">国家/地区</label>
            <select
              value={formData.country}
              onChange={(e) => setFormData({ ...formData, country: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
            >
              {Object.entries(countryNames).map(([code, name]) => (
                <option key={code} value={code}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">设备标识符 (12 位十六进制)</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={formData.deviceIdentifier}
                onChange={(e) => setFormData({ ...formData, deviceIdentifier: e.target.value.toUpperCase().slice(0, 12) })}
                placeholder="0123456789AB"
                maxLength={12}
                className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
              />
              <button
                type="button"
                onClick={generateDeviceId}
                className="px-4 py-2 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                随机生成
              </button>
            </div>
          </div>
          <div className="flex gap-3 pt-4">
            <button
              onClick={handleAdd}
              disabled={adding}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {adding ? <Spinner /> : '添加'}
            </button>
            <button
              onClick={() => setShowAddModal(false)}
              disabled={adding}
              className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              取消
            </button>
          </div>
        </div>
      </Modal>
    </PageContainer>
  );
}
