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
  verify2FAAccount,
  batchImportAccounts,
  type PoolAccount,
  type PoolStats,
} from '../../api/admin';
import { getErrorMessage } from '../../utils/error';
import { countryNames } from '../../utils/countries';

export default function AdminPoolPage() {
  const { t } = useTranslation();
  const addToast = useToastStore((s) => s.addToast);

  const [accounts, setAccounts] = useState<PoolAccount[]>([]);
  const [stats, setStats] = useState<PoolStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterCountry, setFilterCountry] = useState<string>('');
  
  // 添加账号模态框
  const [showAddModal, setShowAddModal] = useState(false);
  const [adding, setAdding] = useState(false);
  const [requires2FA, setRequires2FA] = useState(false);
  const [pendingAccountId, setPendingAccountId] = useState<number | null>(null);
  
  // 重新认证模态框
  const [showReauthModal, setShowReauthModal] = useState(false);
  const [reauthAccountId, setReauthAccountId] = useState<number | null>(null);
  const [reauthAccountEmail, setReauthAccountEmail] = useState('');
  const [reauthVerificationCode, setReauthVerificationCode] = useState('');
  const [reauthing, setReauthing] = useState(false);
  
  // 批量导入模态框
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [batchText, setBatchText] = useState('');
  const [batchCountry, setBatchCountry] = useState('US');
  const [batchImporting, setBatchImporting] = useState(false);
  
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    country: 'US',
    deviceIdentifier: '',
    verificationCode: '',
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
      addToast('账号已删除', 'success');
      loadData();
    } catch (err) {
      addToast(getErrorMessage(err, '删除失败'), 'error');
    }
  };

  // 更新状态
  const handleUpdateStatus = async (id: number, status: 'active' | 'disabled' | 'expired') => {
    try {
      await updateAccountStatus(id, status);
      addToast('状态已更新', 'success');
      loadData();
    } catch (err) {
      addToast(getErrorMessage(err, '更新失败'), 'error');
    }
  };

  // 健康检查
  const handleHealthCheck = async (id: number) => {
    try {
      const result = await checkAccountHealth(id);
      
      if (result.status === 'error' && result.errorMessage === 'REQUIRES_2FA_VERIFICATION') {
        // 需要重新认证
        const account = accounts.find(a => a.id === id);
        if (account) {
          setReauthAccountId(id);
          setReauthAccountEmail(account.email);
          setShowReauthModal(true);
          addToast('此账号需要重新进行双重认证', 'warning');
        }
      } else {
        addToast(`健康检查完成: ${result.status}`, 'success');
      }
      
      loadData();
    } catch (err) {
      addToast(getErrorMessage(err, '健康检查失败'), 'error');
    }
  };

  // 批量健康检查
  const handleCheckAll = async () => {
    if (!confirm('确定要检查所有账号的健康状态吗？这可能需要几分钟时间。')) return;
    
    try {
      const result = await checkAllAccountsHealth();
      addToast(`已检查 ${result.checked} 个账号`, 'success');
      loadData();
    } catch (err) {
      addToast(getErrorMessage(err, '批量检查失败'), 'error');
    }
  };

  // 重新认证（2FA）
  const handleReauth = async () => {
    if (!reauthAccountId || !reauthVerificationCode) {
      addToast('请输入验证码', 'error');
      return;
    }

    try {
      setReauthing(true);
      await verify2FAAccount(reauthAccountId, reauthVerificationCode);
      addToast('重新认证成功', 'success');
      setShowReauthModal(false);
      setReauthAccountId(null);
      setReauthAccountEmail('');
      setReauthVerificationCode('');
      loadData();
    } catch (err) {
      addToast(getErrorMessage(err, '重新认证失败'), 'error');
    } finally {
      setReauthing(false);
    }
  };

  // 批量导入
  const handleBatchImport = async () => {
    if (!batchText.trim()) {
      addToast('请输入账号信息', 'error');
      return;
    }

    try {
      setBatchImporting(true);
      const result = await batchImportAccounts({
        accountsText: batchText,
        country: batchCountry,
      });
      
      addToast(`导入完成: 成功 ${result.success}，失败 ${result.failed}`, 'success');
      setShowBatchModal(false);
      setBatchText('');
      loadData();
    } catch (err) {
      addToast(getErrorMessage(err, '批量导入失败'), 'error');
    } finally {
      setBatchImporting(false);
    }
  };

  // 添加账号
  const handleAdd = async () => {
    if (!formData.email || !formData.password || !formData.deviceIdentifier) {
      addToast('请填写所有必填字段', 'error');
      return;
    }

    if (requires2FA && !formData.verificationCode) {
      addToast('请输入验证码', 'error');
      return;
    }

    try {
      setAdding(true);

      // 如果已经有 pendingAccountId，说明是提交2FA验证码
      if (requires2FA && pendingAccountId) {
        await verify2FAAccount(pendingAccountId, formData.verificationCode);
        addToast('账号已验证并激活', 'success');
      } else {
        // 否则是添加新账号
        await addPoolAccount(formData);
        addToast('账号已添加', 'success');
      }

      setShowAddModal(false);
      setFormData({ email: '', password: '', country: 'US', deviceIdentifier: '', verificationCode: '' });
      setRequires2FA(false);
      setPendingAccountId(null);
      loadData();
    } catch (err: any) {
      console.log('[AdminPoolPage] Add account error:', err);
      console.log('[AdminPoolPage] err.response:', JSON.stringify(err.response));
      console.log('[AdminPoolPage] err.message:', err.message);

      // 检查是否需要2FA
      const errorData = err.response?.data || err;
      console.log('[AdminPoolPage] errorData:', JSON.stringify(errorData));
      console.log('[AdminPoolPage] Checking 2FA condition:', {
        hasError: errorData.error === 'REQUIRES_2FA',
        hasAccountId: !!errorData.accountId,
        accountId: errorData.accountId
      });

      if (errorData.error === 'REQUIRES_2FA' && errorData.accountId) {
        console.log('[AdminPoolPage] 2FA detected! Setting requires2FA=true');
        setRequires2FA(true);
        setPendingAccountId(errorData.accountId);
        addToast('此账号需要双重认证，请输入验证码', 'warning');
      } else {
        console.log('[AdminPoolPage] 2FA not detected, showing error');
        addToast(getErrorMessage(err, '添加失败'), 'error');
      }
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
        <div className="flex gap-2">
          <button
            onClick={() => setShowBatchModal(true)}
            className="px-4 py-2 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            批量导入
          </button>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            添加账号
          </button>
        </div>
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
      <Modal 
        open={showAddModal} 
        onClose={() => {
          setShowAddModal(false);
          setRequires2FA(false);
          setPendingAccountId(null);
          setFormData({ email: '', password: '', country: 'US', deviceIdentifier: '', verificationCode: '' });
        }} 
        title="添加账号"
      >
        {console.log('[AdminPoolPage] Modal render - requires2FA:', requires2FA, 'pendingAccountId:', pendingAccountId)}
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
          {requires2FA && (
            <div>
              <label className="block text-sm font-medium mb-1 text-amber-600 dark:text-amber-500">
                双重认证验证码
              </label>
              <input
                type="text"
                value={formData.verificationCode}
                onChange={(e) => setFormData({ ...formData, verificationCode: e.target.value.replace(/\D/g, '').slice(0, 6) })}
                placeholder="请输入 6 位验证码"
                maxLength={6}
                className="w-full px-3 py-2 border border-amber-300 dark:border-amber-700 rounded-md bg-white dark:bg-gray-900 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-colors"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                请查看您的可信设备或手机上的验证码
              </p>
            </div>
          )}
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
              {adding ? <Spinner /> : (requires2FA ? '提交验证码' : '添加')}
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

      {/* 重新认证模态框 */}
      <Modal
        open={showReauthModal}
        onClose={() => {
          setShowReauthModal(false);
          setReauthAccountId(null);
          setReauthAccountEmail('');
          setReauthVerificationCode('');
        }}
        title="重新认证"
      >
        <div className="space-y-4">
          <Alert type="warning">
            账号 <strong>{reauthAccountEmail}</strong> 需要重新进行双重认证。请查看您的可信设备或手机上的验证码。
          </Alert>
          
          <div>
            <label className="block text-sm font-medium mb-1 text-amber-600 dark:text-amber-500">
              双重认证验证码
            </label>
            <input
              type="text"
              value={reauthVerificationCode}
              onChange={(e) => setReauthVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="请输入 6 位验证码"
              maxLength={6}
              autoFocus
              className="w-full px-3 py-2 border border-amber-300 dark:border-amber-700 rounded-md bg-white dark:bg-gray-900 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-colors"
            />
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              输入您收到的 6 位数字验证码
            </p>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              onClick={handleReauth}
              disabled={reauthing || reauthVerificationCode.length !== 6}
              className="flex-1 px-4 py-2 bg-amber-600 text-white rounded-md hover:bg-amber-700 transition-colors disabled:opacity-50"
            >
              {reauthing ? <Spinner /> : '提交验证码'}
            </button>
            <button
              onClick={() => setShowReauthModal(false)}
              disabled={reauthing}
              className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              取消
            </button>
          </div>
        </div>
      </Modal>

      {/* 批量导入模态框 */}
      <Modal
        open={showBatchModal}
        onClose={() => {
          setShowBatchModal(false);
          setBatchText('');
        }}
        title="批量导入账号"
      >
        <div className="space-y-4">
          <Alert type="warning">
            每行一个账号，格式：<code>email----password verification_code_api</code>
          </Alert>
          
          <div>
            <label className="block text-sm font-medium mb-1">账号列表</label>
            <textarea
              value={batchText}
              onChange={(e) => setBatchText(e.target.value)}
              placeholder={'owylssl2955979@gmail.com----Fthg0202 http://example.com/getCode?id=123\nuser2@gmail.com----Pass123 http://example.com/getCode?id=456'}
              rows={10}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors font-mono text-sm"
            />
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              每行一个账号，使用 ---- 分隔邮箱和密码，空格后跟验证码API地址
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">默认国家/地区</label>
            <select
              value={batchCountry}
              onChange={(e) => setBatchCountry(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
            >
              {Object.entries(countryNames).map(([code, name]) => (
                <option key={code} value={code}>
                  {name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              onClick={handleBatchImport}
              disabled={batchImporting || !batchText.trim()}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {batchImporting ? <Spinner /> : '开始导入'}
            </button>
            <button
              onClick={() => setShowBatchModal(false)}
              disabled={batchImporting}
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
