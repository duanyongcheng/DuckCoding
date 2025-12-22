import { useEffect, useState } from 'react';
import { Theme, ThemeContext } from './theme-context';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // 从 localStorage 读取主题设置，默认为 system
  const [theme, setThemeState] = useState<Theme>(() => {
    const stored = localStorage.getItem('duckcoding-theme');
    return (stored as Theme) || 'system';
  });

  // 获取系统主题偏好
  const getSystemTheme = (): 'light' | 'dark' => {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  };

  // 计算实际应用的主题
  const actualTheme: 'light' | 'dark' = theme === 'system' ? getSystemTheme() : theme;

  // 设置主题
  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    localStorage.setItem('duckcoding-theme', newTheme);
  };

  // 应用主题到 DOM
  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(actualTheme);
  }, [actualTheme]);

  // 监听系统主题变化
  useEffect(() => {
    if (theme !== 'system') return;

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      const root = window.document.documentElement;
      root.classList.remove('light', 'dark');
      root.classList.add(getSystemTheme());
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, actualTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
