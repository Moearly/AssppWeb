import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useState, useEffect } from "react";
import {
  HomeIcon,
  AccountsIcon,
  SearchIcon,
  DownloadsIcon,
  SettingsIcon,
  SunIcon,
  MoonIcon,
  SystemIcon,
} from "../common/icons";
import { useSettingsStore } from "../../store/settings";
import { getAdminApiKey } from "../../api/admin";

const navItems = [
  { to: "/", label: "home", icon: HomeIcon },
  { to: "/accounts", label: "accounts", icon: AccountsIcon },
  { to: "/search", label: "search", icon: SearchIcon },
  { to: "/downloads", label: "downloads", icon: DownloadsIcon },
  { to: "/settings", label: "settings", icon: SettingsIcon },
];

const poolNavItems = [
  { to: "/pool/store", label: "应用商店", icon: SearchIcon },
];

const adminNavItems = [
  { to: "/admin/pool", label: "账号池", icon: AccountsIcon },
  { to: "/admin/whitelist", label: "应用白名单", icon: SearchIcon },
  { to: "/admin/settings", label: "管理员设置", icon: SettingsIcon },
];

export default function Sidebar() {
  const { t } = useTranslation();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    // 检查是否配置了管理员 API Key
    const checkAdmin = () => {
      setIsAdmin(!!getAdminApiKey());
    };
    
    checkAdmin();
    
    // 监听 localStorage 变化
    window.addEventListener('storage', checkAdmin);
    
    // 定期检查（处理同窗口更新）
    const interval = setInterval(checkAdmin, 1000);

    return () => {
      window.removeEventListener('storage', checkAdmin);
      clearInterval(interval);
    };
  }, []);

  return (
    <aside className="hidden md:flex md:flex-col md:w-60 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 h-screen sticky top-0 transition-colors duration-200">
      <div className="px-6 py-5 border-b border-gray-200 dark:border-gray-800">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">
          Asspp Web
        </h1>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {/* 零信任模式 */}
        <div className="mb-4">
          <div className="px-3 mb-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">
            零信任模式
          </div>
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/"}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-blue-50 dark:bg-blue-900/50 text-blue-700 dark:text-blue-400"
                    : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white"
                }`
              }
            >
              <item.icon className="w-5 h-5" />
              {t(`nav.${item.label}`)}
            </NavLink>
          ))}
        </div>

        {/* 账号池模式 */}
        <div className="mb-4">
          <div className="px-3 mb-2 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">
            账号池模式
          </div>
          {poolNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-blue-50 dark:bg-blue-900/50 text-blue-700 dark:text-blue-400"
                    : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white"
                }`
              }
            >
              <item.icon className="w-5 h-5" />
              {item.label}
            </NavLink>
          ))}
        </div>

        {/* 管理员（仅在配置了 API Key 时显示） */}
        {isAdmin && (
          <div className="mb-4">
            <div className="px-3 mb-2 text-xs font-semibold text-orange-600 dark:text-orange-400 uppercase">
              管理员
            </div>
            {adminNavItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-orange-50 dark:bg-orange-900/50 text-orange-700 dark:text-orange-400"
                      : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white"
                  }`
                }
              >
                <item.icon className="w-5 h-5" />
                {item.label}
              </NavLink>
            ))}
          </div>
        )}
      </nav>
      <div className="p-3 border-t border-gray-200 dark:border-gray-800">
        <ThemeToggle />
      </div>
    </aside>
  );
}

function ThemeToggle() {
  const { theme, setTheme } = useSettingsStore();
  const { t } = useTranslation();

  const cycleTheme = () => {
    if (theme === "system") setTheme("light");
    else if (theme === "light") setTheme("dark");
    else setTheme("system");
  };

  return (
    <button
      onClick={cycleTheme}
      className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm font-medium transition-colors text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white"
      title={t(`theme.${theme}`)}
    >
      {theme === "light" && <SunIcon className="w-5 h-5" />}
      {theme === "dark" && <MoonIcon className="w-5 h-5" />}
      {theme === "system" && <SystemIcon className="w-5 h-5" />}
      <span>{t(`theme.${theme}`)}</span>
    </button>
  );
}
