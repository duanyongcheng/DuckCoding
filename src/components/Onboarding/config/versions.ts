// filepath: e:\DuckCoding\src\components\Onboarding\config\versions.ts

import type { OnboardingStep, VersionStepsMap } from '../../../types/onboarding';

// 导入各版本步骤组件
import WelcomeStep from '../steps/v1/WelcomeStep';
import ProxyConfigStep from '../steps/v1/ProxyConfigStep';
import ToolIntroStep from '../steps/v1/ToolIntroStep';
import CompleteStep from '../steps/v1/CompleteStep';

import UpdateWelcomeStep from '@/components/Onboarding/steps/v2/UpdateWelcomeStep';
import LogFeatureStep from '@/components/Onboarding/steps/v2/LogFeatureStep';
import SessionConfigStep from '@/components/Onboarding/steps/v2/SessionConfigStep';
import UpdateCompleteStep from '@/components/Onboarding/steps/v2/UpdateCompleteStep';

/**
 * 当前引导版本
 * 每次添加新版本时更新此常量
 */
export const CURRENT_ONBOARDING_VERSION = 'v2';

/**
 * 各版本的引导步骤配置
 * 添加新版本时在此映射中添加新条目
 */
export const VERSION_STEPS: VersionStepsMap = {
  v1: [
    {
      id: 'welcome',
      title: '欢迎使用 DuckCoding',
      description: '了解 DuckCoding 的核心功能',
      component: WelcomeStep,
      skippable: false,
    },
    {
      id: 'proxy-config',
      title: '配置代理',
      description: '配置全局代理以访问 AI 服务（可选）',
      component: ProxyConfigStep,
      skippable: true,
    },
    {
      id: 'tool-intro',
      title: '工具介绍',
      description: '了解支持的 AI 编程工具',
      component: ToolIntroStep,
      skippable: false,
    },
    {
      id: 'complete',
      title: '完成设置',
      description: '准备开始使用 DuckCoding',
      component: CompleteStep,
      skippable: false,
    },
  ],
  v2: [
    {
      id: 'update-welcome',
      title: 'DuckCoding 更新了',
      description: '了解新增功能',
      component: UpdateWelcomeStep,
      skippable: false,
    },
    {
      id: 'log-feature',
      title: '日志配置管理',
      description: '灵活控制应用日志',
      component: LogFeatureStep,
      skippable: false,
    },
    {
      id: 'session-config',
      title: '透明代理增强',
      description: '会话级配置和多工具支持',
      component: SessionConfigStep,
      skippable: false,
    },
    {
      id: 'update-complete',
      title: '更新完成',
      description: '开始使用新功能',
      component: UpdateCompleteStep,
      skippable: false,
    },
  ],
};

/**
 * 版本比较工具函数
 * @param v1 版本号（如 "v1", "v2"）
 * @param v2 版本号（如 "v1", "v2"）
 * @returns 如果 v1 < v2 返回负数，v1 == v2 返回 0，v1 > v2 返回正数
 */
export function compareVersions(v1: string, v2: string): number {
  const num1 = parseInt(v1.replace('v', ''), 10);
  const num2 = parseInt(v2.replace('v', ''), 10);
  return num1 - num2;
}

/**
 * 获取需要展示的引导步骤
 * @param completedVersion 用户已完成的版本（null 表示首次使用）
 * @returns 需要展示的引导步骤列表
 */
export function getRequiredSteps(completedVersion: string | null): OnboardingStep[] {
  const currentVersion = CURRENT_ONBOARDING_VERSION;

  // 首次使用：展示从 v1 到当前版本的所有步骤
  if (!completedVersion) {
    const allSteps: OnboardingStep[] = [];
    const versions = Object.keys(VERSION_STEPS).sort(compareVersions);

    for (const version of versions) {
      if (compareVersions(version, currentVersion) <= 0) {
        allSteps.push(...VERSION_STEPS[version]);
      }
    }

    // 如果包含多个版本，移除衔接处的重复步骤
    // 移除 v1 的 complete 步骤和 v2+ 的 update-welcome 步骤
    if (versions.length > 1 && compareVersions(currentVersion, 'v1') > 0) {
      return allSteps.filter((step) => step.id !== 'complete' && step.id !== 'update-welcome');
    }

    return allSteps;
  }

  // 已完成引导：只展示新增版本的步骤
  if (compareVersions(completedVersion, currentVersion) < 0) {
    const newSteps: OnboardingStep[] = [];
    const versions = Object.keys(VERSION_STEPS).sort(compareVersions);

    for (const version of versions) {
      if (
        compareVersions(version, completedVersion) > 0 &&
        compareVersions(version, currentVersion) <= 0
      ) {
        newSteps.push(...VERSION_STEPS[version]);
      }
    }

    return newSteps;
  }

  // 已是最新版本：无需引导
  return [];
}

/**
 * 获取所有版本的完整步骤（用于设置页重新打开）
 * @returns 所有引导步骤
 */
export function getAllSteps(): OnboardingStep[] {
  return getRequiredSteps(null);
}
