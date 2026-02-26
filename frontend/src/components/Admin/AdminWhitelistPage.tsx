import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import PageContainer from '../Layout/PageContainer';
import Alert from '../common/Alert';
import Spinner from '../common/Spinner';
import Badge from '../common/Badge';
import Modal from '../common/Modal';
import AppIcon from '../common/AppIcon';
import { useToastStore } from '../../store/toast';
import {
  getWhitelistApps,
  addWhitelistApp,
  updateWhitelistApp,
  deleteWhitelistApp,
  toggleWhitelistApp,
  type WhitelistApp,
} from '../../api/admin';
import { getErrorMessage } from '../../utils/error';
import { countryNames } from '../../utils/countries';

export default function AdminWhitelistPage() {
  const { t } = useTranslation();
  const showToast = useToastStore((s) => s.showToast);

  const [apps, setApps] = useState<WhitelistApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterCountry, setFilterCountry] = useState<string>('');
  const [filterEnabled, setFilterEnabled] = useState<string>('');

  // 添加/编辑应用模态框
  const [showModal, setShowModal] = useState(false);
  const [editingApp, setEditingApp] = useState<WhitelistApp | null>(null);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({
    softwareId: '',
    bundleId: '',
    name: '',
    country: 'US',
    artworkUrl: '',
    version: '',
  });

  // 加载数据
  const loadData = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await getWhitelistApps({
        country: filterCountry || undefined,
        enabled: filterEnabled === '' ? undefined : filterEnabled === 'true',
      });
      setApps(data);
    } catch (err) {
      setError(getErrorMessage(err, '加载白名单失败'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [filterCountry, filterEnabled]);

  // 打开添加模态框
  const handleAdd = () => {
    setEditingApp(null);
    setFormData({
      softwareId: '',
      bundleId: '',
      name: '',
      country: 'US',
      artworkUrl: '',
      version: '',
    });
    setShowModal(true);
  };

  // 打开编辑模态框
  const handleEdit = (app: WhitelistApp) => {
    setEditingApp(app);
    setFormData({
      softwareId: String(app.software_id),
      bundleId: app.bundle_id,
      name: app.name,
      country: app.country,
      artworkUrl: app.artwork_url || '',
      version: app.version || '',
    });
    setShowModal(true);
  };

  // 保存（添加或更新）
  const handleSave = async () => {
    if (!formData.name || (!editingApp && (!formData.softwareId || !formData.bundleId))) {
      showToast('请填写所有必填字段', 'error');
      return;
    }

    try {
      setSaving(true);
      if (editingApp) {
        // 更新
        await updateWhitelistApp(editingApp.id, {
          name: formData.name,
          artworkUrl: formData.artworkUrl || undefined,
          version: formData.version || undefined,
        });
        showToast('应用已更新', 'success');
      } else {
        // 添加
        await addWhitelistApp({
          softwareId: parseInt(formData.softwareId, 10),
          bundleId: formData.bundleId,
          name: formData.name,
          country: formData.country,
          artworkUrl: formData.artworkUrl || undefined,
          version: formData.version || undefined,
        });
        showToast('应用已添加', 'success');
      }
      setShowModal(false);
      loadData();
    } catch (err) {
      showToast(getErrorMessage(err, '保存失败'), 'error');
    } finally {
      setSaving(false);
    }
  };

  // 删除应用
  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`确定要删除应用"${name}"吗？`)) return;

    try {
      await deleteWhitelistApp(id);
      showToast('应用已删除', 'success');
      loadData();
    } catch (err) {
      showToast(getErrorMessage(err, '删除失败'), 'error');
    }
  };

  // 切换启用状态
  const handleToggle = async (id: number) => {
    try {
      await toggleWhitelistApp(id);
      showToast('状态已更新', 'success');
      loadData();
    } catch (err) {
      showToast(getErrorMessage(err, '更新失败'), 'error');
    }
  };

  if (loading) {
    return (
      <PageContainer title="应用白名单">
        <div className="flex justify-center py-12">
          <Spinner size="lg" />
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer
      title="应用白名单"
      action={
        <button
          onClick={handleAdd}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
        >
          添加应用
        </button>
      }
    >
      {error && (
        <div className="mb-6">
          <Alert type="error">{error}</Alert>
        </div>
      )}

      {/* 过滤器 */}
      <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4 mb-6">
        <div className="flex flex-wrap gap-4">
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
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium mb-1">状态</label>
            <select
              value={filterEnabled}
              onChange={(e) => setFilterEnabled(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
            >
              <option value="">全部</option>
              <option value="true">已启用</option>
              <option value="false">已禁用</option>
            </select>
          </div>
        </div>
      </div>

      {/* 应用列表 */}
      {apps.length === 0 ? (
        <div className="bg-gray-50 dark:bg-gray-900/30 border-2 border-dashed border-gray-200 dark:border-gray-800 rounded-lg p-12 text-center">
          <div className="text-gray-500 dark:text-gray-400">
            <p className="text-lg font-medium mb-2">暂无应用</p>
            <p className="text-sm">点击"添加应用"按钮添加第一个应用</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {apps.map((app) => (
            <div
              key={app.id}
              className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-800 p-4"
            >
              <div className="flex items-start gap-3 mb-3">
                <AppIcon src={app.artwork_url || undefined} name={app.name} size="md" />
                <div className="flex-1 min-w-0">
                  <h3 className="font-medium truncate">{app.name}</h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 truncate">{app.bundle_id}</p>
                </div>
                <Badge variant={app.enabled ? 'success' : 'default'}>
                  {app.enabled ? '已启用' : '已禁用'}
                </Badge>
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1 mb-4">
                <div>国家: {countryNames[app.country] || app.country}</div>
                <div>软件 ID: {app.software_id}</div>
                {app.version && <div>版本: {app.version}</div>}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleToggle(app.id)}
                  className="flex-1 px-3 py-1 text-sm border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  {app.enabled ? '禁用' : '启用'}
                </button>
                <button
                  onClick={() => handleEdit(app)}
                  className="flex-1 px-3 py-1 text-sm border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  编辑
                </button>
                <button
                  onClick={() => handleDelete(app.id, app.name)}
                  className="px-3 py-1 text-sm text-red-600 border border-red-300 dark:border-red-700 rounded-md hover:bg-red-50 dark:hover:bg-red-950 transition-colors"
                >
                  删除
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 添加/编辑模态框 */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title={editingApp ? '编辑应用' : '添加应用'}>
        <div className="space-y-4">
          {!editingApp && (
            <>
              <div>
                <label className="block text-sm font-medium mb-1">软件 ID *</label>
                <input
                  type="number"
                  value={formData.softwareId}
                  onChange={(e) => setFormData({ ...formData, softwareId: e.target.value })}
                  placeholder="123456789"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Bundle ID *</label>
                <input
                  type="text"
                  value={formData.bundleId}
                  onChange={(e) => setFormData({ ...formData, bundleId: e.target.value })}
                  placeholder="com.example.app"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                />
              </div>
            </>
          )}
          <div>
            <label className="block text-sm font-medium mb-1">应用名称 *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="My App"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
            />
          </div>
          {!editingApp && (
            <div>
              <label className="block text-sm font-medium mb-1">国家/地区 *</label>
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
          )}
          <div>
            <label className="block text-sm font-medium mb-1">图标 URL</label>
            <input
              type="text"
              value={formData.artworkUrl}
              onChange={(e) => setFormData({ ...formData, artworkUrl: e.target.value })}
              placeholder="https://example.com/icon.png"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">版本</label>
            <input
              type="text"
              value={formData.version}
              onChange={(e) => setFormData({ ...formData, version: e.target.value })}
              placeholder="1.0.0"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-md bg-white dark:bg-gray-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
            />
          </div>
          <div className="flex gap-3 pt-4">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {saving ? <Spinner /> : (editingApp ? '保存' : '添加')}
            </button>
            <button
              onClick={() => setShowModal(false)}
              disabled={saving}
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
