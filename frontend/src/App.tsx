import { Routes, Route, Navigate } from "react-router-dom";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useSettingsStore } from "./store/settings";

import Sidebar from "./components/Layout/Sidebar";
import MobileNav from "./components/Layout/MobileNav";
import MobileHeader from "./components/Layout/MobileHeader";
import ToastContainer from "./components/common/ToastContainer";
import GlobalDownloadNotifier from "./components/common/GlobalDownloadNotifier";

// 直接导入所有组件（移除懒加载）
import DownloadList from "./components/Download/DownloadList";
import PackageDetail from "./components/Download/PackageDetail";
import SettingsPage from "./components/Settings/SettingsPage";
import PoolStorePage from "./components/Pool/PoolStorePage";
import AdminPoolPage from "./components/Admin/AdminPoolPage";
import AdminWhitelistPage from "./components/Admin/AdminWhitelistPage";
import AdminSettingsPage from "./components/Admin/AdminSettingsPage";

function Loading() {
  const { t } = useTranslation();
  return (
    <div className="p-8 text-center text-gray-500 dark:text-gray-400">
      {t("loading")}
    </div>
  );
}

export default function App() {
  const theme = useSettingsStore((s) => s.theme);

  useEffect(() => {
    const root = window.document.documentElement;
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    function applyTheme() {
      const isDark =
        theme === "dark" || (theme === "system" && mediaQuery.matches);
      if (isDark) {
        root.classList.add("dark");
        root.style.colorScheme = "dark";
      } else {
        root.classList.remove("dark");
        root.style.colorScheme = "light";
      }
    }

    applyTheme();
    mediaQuery.addEventListener("change", applyTheme);
    return () => mediaQuery.removeEventListener("change", applyTheme);
  }, [theme]);

  // 初始化管理员 API Key
  useEffect(() => {
    const savedKey = localStorage.getItem('adminApiKey');
    if (savedKey) {
      import('./api/admin').then(({ setAdminApiKey }) => {
        setAdminApiKey(savedKey);
      });
    }
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex text-gray-900 dark:text-gray-100 transition-colors duration-200">
      <ToastContainer />
      <GlobalDownloadNotifier />

      <Sidebar />
      <main className="flex-1 flex flex-col min-w-0 safe-top">
        <MobileHeader />
        <Routes>
          {/* 默认路由 - 重定向到应用商店 */}
          <Route path="/" element={<Navigate to="/pool/store" replace />} />
          
          {/* 账号池模式路由 */}
          <Route path="/pool/store" element={<PoolStorePage />} />
          <Route path="/downloads" element={<DownloadList />} />
          <Route path="/downloads/:id" element={<PackageDetail />} />
          <Route path="/settings" element={<SettingsPage />} />

          {/* 管理员路由 */}
          <Route path="/admin/pool" element={<AdminPoolPage />} />
          <Route path="/admin/whitelist" element={<AdminWhitelistPage />} />
          <Route path="/admin/settings" element={<AdminSettingsPage />} />
        </Routes>
      </main>
      <MobileNav />
    </div>
  );
}
