import { theme as antdTheme } from 'antd';
import type { ThemeConfig } from 'antd';
import type { MappingAlgorithm } from 'antd';
import { designTokens, readCssColorToken, type ThemeMode } from '@/design/tokens';

/** 运行时从 tokens.css 读取当前主题的语义色；切换 data-theme 后即可读到新值。字面量登记让门禁能证明每个变量都有使用方。 */
function readCssPalette() {
  return {
    canvas: readCssColorToken('--ds-color-canvas'),
    shadow: readCssColorToken('--ds-color-shadow'),
    surface: readCssColorToken('--ds-color-surface'),
    surfaceSubtle: readCssColorToken('--ds-color-surface-subtle'),
    surfaceMuted: readCssColorToken('--ds-color-surface-muted'),
    surfaceElevated: readCssColorToken('--ds-color-surface-elevated'),
    text: readCssColorToken('--ds-color-text'),
    textSecondary: readCssColorToken('--ds-color-text-secondary'),
    textTertiary: readCssColorToken('--ds-color-text-tertiary'),
    textDisabled: readCssColorToken('--ds-color-text-disabled'),
    border: readCssColorToken('--ds-color-border'),
    borderStrong: readCssColorToken('--ds-color-border-strong'),
    primary: readCssColorToken('--ds-color-primary'),
    primaryHover: readCssColorToken('--ds-color-primary-hover'),
    primaryActive: readCssColorToken('--ds-color-primary-active'),
    primaryForeground: readCssColorToken('--ds-color-primary-foreground'),
    primaryText: readCssColorToken('--ds-color-primary-text'),
    primarySurface: readCssColorToken('--ds-color-primary-surface'),
    primaryBorder: readCssColorToken('--ds-color-primary-border'),
    link: readCssColorToken('--ds-color-link'),
    linkHover: readCssColorToken('--ds-color-link-hover'),
    info: readCssColorToken('--ds-color-info'),
    infoSurface: readCssColorToken('--ds-color-info-surface'),
    infoBorder: readCssColorToken('--ds-color-info-border'),
    success: readCssColorToken('--ds-color-success'),
    successSurface: readCssColorToken('--ds-color-success-surface'),
    successBorder: readCssColorToken('--ds-color-success-border'),
    warning: readCssColorToken('--ds-color-warning'),
    warningSurface: readCssColorToken('--ds-color-warning-surface'),
    warningBorder: readCssColorToken('--ds-color-warning-border'),
    error: readCssColorToken('--ds-color-error'),
    errorSurface: readCssColorToken('--ds-color-error-surface'),
    errorBorder: readCssColorToken('--ds-color-error-border'),
  };
}

/**
 * Ant 算法会从主色与状态色种子各派生一整套色阶；品牌种子派生档位和稳定状态色
 * 会被改写成带灰阶或偏暗的派生色在算法之后把语义色还原为 token。
 */
function createPreserveSemanticColors(token: {
  color: {
    primary: string;
    primaryHover: string;
    primaryActive: string;
    primaryText: string;
    link: string;
    linkHover: string;
    info: string;
    success: string;
    warning: string;
    error: string;
    shadow: string;
  };
}): MappingAlgorithm {
  return (_seed, derived) => ({
    ...(derived as ReturnType<MappingAlgorithm>),
    // Drawer/Card 等方向阴影由内部 map token colorShadow 派生，暗色算法会把它翻成白色描边；
    // 阴影在任何主题下都只用黑色系
    colorShadow: token.color.shadow,
    colorPrimary: token.color.primary,
    colorPrimaryHover: token.color.primaryHover,
    colorPrimaryActive: token.color.primaryActive,
    colorPrimaryText: token.color.primaryText,
    colorPrimaryTextHover: token.color.primaryHover,
    colorPrimaryTextActive: token.color.primaryActive,
    colorLink: token.color.link,
    colorLinkHover: token.color.linkHover,
    colorLinkActive: token.color.linkHover,
    colorInfo: token.color.info,
    colorInfoHover: token.color.info,
    colorInfoActive: token.color.info,
    colorInfoText: token.color.info,
    colorInfoTextHover: token.color.info,
    colorInfoTextActive: token.color.info,
    colorSuccess: token.color.success,
    colorSuccessHover: token.color.success,
    colorSuccessActive: token.color.success,
    colorSuccessText: token.color.success,
    colorSuccessTextHover: token.color.success,
    colorSuccessTextActive: token.color.success,
    colorWarning: token.color.warning,
    colorWarningHover: token.color.warning,
    colorWarningActive: token.color.warning,
    colorWarningText: token.color.warning,
    colorWarningTextHover: token.color.warning,
    colorWarningTextActive: token.color.warning,
    colorError: token.color.error,
    colorErrorHover: token.color.error,
    colorErrorActive: token.color.error,
    colorErrorText: token.color.error,
    colorErrorTextHover: token.color.error,
    colorErrorTextActive: token.color.error,
  });
}

/**
 * Ant Design 的唯一主题入口：颜色在运行时从 tokens.css 的 CSS 变量派生
 * （CSS 是颜色唯一来源），尺寸仍从 designTokens 取值。
 */
export function buildThemeConfig(mode: ThemeMode): ThemeConfig {
  const token = { ...designTokens, color: readCssPalette() };
  return {
    // 不启用 ant cssvar:多层变量作用域(Pro 容器默认主题)会缓存过期派生色,
    // 内联主题值随每次渲染重生成,保证亮暗切换确定性。

    algorithm: [
      mode === 'dark' ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
      createPreserveSemanticColors(token),
    ],
    token: {
      colorPrimary: token.color.primary,
      colorPrimaryHover: token.color.primaryHover,
      colorInfo: token.color.info,
      colorLink: token.color.link,
      colorLinkHover: token.color.linkHover,
      colorPrimaryActive: token.color.primaryActive,
      colorPrimaryBg: token.color.primarySurface,
      colorPrimaryBgHover: token.color.primarySurface,
      colorPrimaryBorder: token.color.primaryBorder,
      colorPrimaryBorderHover: token.color.primary,
      colorSuccess: token.color.success,
      colorSuccessBg: token.color.successSurface,
      colorSuccessBgHover: token.color.successSurface,
      colorSuccessBorder: token.color.successBorder,
      colorWarning: token.color.warning,
      colorWarningBg: token.color.warningSurface,
      colorWarningBgHover: token.color.warningSurface,
      colorWarningBorder: token.color.warningBorder,
      colorError: token.color.error,
      colorErrorBg: token.color.errorSurface,
      colorErrorBgHover: token.color.errorSurface,
      colorErrorBorder: token.color.errorBorder,
      colorInfoBg: token.color.infoSurface,
      colorInfoBorder: token.color.infoBorder,
      colorText: token.color.text,
      colorTextSecondary: token.color.textSecondary,
      colorTextTertiary: token.color.textTertiary,
      colorTextQuaternary: token.color.textDisabled,
      colorTextHeading: token.color.text,
      colorBgBase: token.color.surface,
      colorBgLayout: token.color.canvas,
      colorBgContainer: token.color.surface,
      colorBgElevated: token.color.surfaceElevated,
      colorBgSpotlight: token.color.surfaceElevated,
      colorTextDisabled: token.color.textDisabled,
      // 文字只用前景色：实心控件、提示与菜单选中都不做黑白反转。
      colorTextLightSolid: token.color.primaryForeground,
      colorBorder: token.color.borderStrong,
      colorBorderSecondary: token.color.border,
      // 填充与悬停统一落在弱表面/次表面，不再由 Ant 算法从主色派生带色偏的灰。
      colorFill: token.color.surfaceMuted,
      colorFillSecondary: token.color.surfaceMuted,
      colorFillTertiary: token.color.surfaceMuted,
      colorFillQuaternary: token.color.surfaceSubtle,
      colorBgTextHover: token.color.surfaceMuted,
      colorBgTextActive: token.color.surfaceMuted,
      colorBgContainerDisabled: token.color.surfaceMuted,
      controlItemBgHover: token.color.surfaceMuted,
      controlItemBgActive: token.color.primarySurface,
      controlItemBgActiveHover: token.color.primarySurface,
      controlItemBgActiveDisabled: token.color.surfaceMuted,
      borderRadius: token.radius.md,
      borderRadiusLG: token.radius.lg,
      borderRadiusSM: token.radius.xs,
      borderRadiusXS: token.radius.xs,
      controlHeight: token.control.height,
      controlHeightLG: token.control.heightLg,
      controlHeightSM: token.control.heightSm,
      fontFamily: token.font.family,
      fontFamilyCode: token.font.mono,
      fontSize: token.font.sizeBody,
      fontSizeSM: token.font.sizeXs,
      fontSizeLG: token.font.sizeLg,
      fontSizeXL: token.font.sizeTitle,
      fontSizeHeading1: token.font.sizePageTitle,
      fontSizeHeading2: token.font.sizeTitle,
      fontSizeHeading3: token.font.sizeLg,
      fontSizeHeading4: token.font.sizeBody,
      fontSizeHeading5: token.font.sizeXs,
      boxShadow: readCssColorToken('--ds-shadow-raised'),
      boxShadowSecondary: readCssColorToken('--ds-shadow-raised'),
      boxShadowTertiary: 'none',
      motionDurationFast: token.motion.fast,
      motionDurationMid: token.motion.normal,
      wireframe: false,
    },
    components: {
      Layout: {
        headerBg: token.color.surface,
        headerHeight: token.layout.headerHeight,
        headerPadding: `0 ${token.space.xl}px`,
        siderBg: token.color.surface,
        bodyBg: token.color.canvas,
        footerBg: token.color.canvas,
      },
      Menu: {
        // 侧栏自带右边框，菜单不再画第二条竖线
        activeBarBorderWidth: 0,
        itemBg: 'transparent',
        // 未选中的菜单项用灰度；悬停回到纯色弱底；选中与页签/分页同一 accent 语言：
        // primarySurface 弱底 + primaryText 文字，页面当前位置一目了然
        itemColor: token.color.textTertiary,
        itemHoverColor: token.color.text,
        itemHoverBg: token.color.surfaceMuted,
        itemSelectedColor: token.color.primaryText,
        subMenuItemSelectedColor: token.color.primaryText,
        itemSelectedBg: token.color.primarySurface,
        itemActiveBg: token.color.primarySurface,
        itemHeight: token.control.height,
        itemBorderRadius: token.radius.md,
        itemMarginInline: token.space.sm,
        iconSize: token.font.sizeLg,
        collapsedIconSize: token.font.sizeLg,
        groupTitleColor: token.color.textTertiary,
        groupTitleFontSize: token.font.sizeXs,
        subMenuItemBg: 'transparent',
        darkItemBg: 'transparent',
        // 收起态侧栏以 Ant dark 菜单模式渲染,dark* token 同样映射语义色,保证随主题切换。
        darkItemColor: token.color.textTertiary,
        darkItemHoverColor: token.color.text,
        darkItemHoverBg: token.color.surfaceMuted,
        darkItemSelectedColor: token.color.text,
        darkItemSelectedBg: token.color.surfaceMuted,
        darkGroupTitleColor: token.color.textTertiary,
        darkSubMenuItemBg: 'transparent',
      },
      Button: {
        controlHeight: token.control.height,
        borderRadius: token.radius.md,
        fontWeight: 500,
        defaultBg: token.color.surface,
        defaultBorderColor: token.color.border,
        defaultColor: token.color.text,
        defaultHoverBg: token.color.surfaceSubtle,
        defaultHoverBorderColor: token.color.borderStrong,
        defaultHoverColor: token.color.text,
        // 主操作使用品牌实色与自动派生前景，分段项/页签使用品牌弱底与主色文字，保留语义图标色。
        colorPrimary: token.color.primary,
        colorPrimaryHover: token.color.primaryHover,
        colorPrimaryActive: token.color.primaryActive,
        primaryColor: token.color.primaryForeground,
        solidTextColor: token.color.primaryForeground,
        primaryShadow: 'none',
        defaultShadow: 'none',
        dangerShadow: 'none',
      },
      Card: {
        borderRadiusLG: token.radius.lg,
        paddingLG: token.space.lg,
        headerBg: 'transparent',
        headerHeight: token.control.heightLg + token.space.sm,
        headerHeightSM: token.control.height,
        colorBorderSecondary: token.color.border,
      },
      // 表头与表格表面同色，保留次级色文字与底线；背景必须不透明，固定列才能遮住滚过的其他列。
      Table: {
        headerBg: token.color.surface,
        headerColor: token.color.textSecondary,
        // 表头里的多选下拉/排序/筛选图标 = colorIcon × 65% 透明度（Ant 内部派生，不可直接改）：
        // 基色改成正文色，降透明度后仍不低于 3:1
        colorIcon: token.color.text,
        headerBorderRadius: 0,
        borderColor: token.color.border,
        rowHoverBg: token.color.surfaceSubtle,
        rowSelectedBg: token.color.primarySurface,
        rowSelectedHoverBg: token.color.primarySurface,
        cellPaddingBlock: token.space.md,
        cellPaddingInline: token.space.lg,
        headerSplitColor: 'transparent',
        footerBg: 'transparent',
      },
      Input: {
        activeBorderColor: token.color.primary,
        hoverBorderColor: token.color.borderStrong,
        activeShadow: readCssColorToken('--ds-shadow-focus'),
      },
      InputNumber: {
        activeBorderColor: token.color.primary,
        hoverBorderColor: token.color.borderStrong,
        activeShadow: readCssColorToken('--ds-shadow-focus'),
      },
      Select: {
        // 下拉箭头/后缀图标：Ant 默认取四级文字色再降透明度，亮色下不足 3:1；改用不透明的三级灰
        colorTextQuaternary: token.color.textTertiary,
        activeBorderColor: token.color.primary,
        hoverBorderColor: token.color.borderStrong,
        activeOutlineColor: token.color.primarySurface,
        optionActiveBg: token.color.surfaceMuted,
        optionSelectedBg: token.color.primarySurface,
        optionSelectedColor: token.color.text,
      },
      DatePicker: {
        activeBorderColor: token.color.text,
        hoverBorderColor: token.color.borderStrong,
        activeShadow: readCssColorToken('--ds-shadow-focus'),
        colorPrimary: token.color.primary,
        colorTextLightSolid: token.color.primaryForeground,
        cellActiveWithRangeBg: token.color.primarySurface,
      },
      Pagination: {
        itemActiveBg: token.color.primarySurface,
        // 弱底上的选中文字用加深的 primaryText，对比度达标（原色在弱底上只有 4.16）
        itemActiveColor: token.color.primaryText,
        itemActiveColorHover: token.color.primaryHover,
      },
      Progress: { defaultColor: token.color.primary, remainingColor: token.color.surfaceMuted },
      // 开关等交互选中态跟随唯一品牌种子；滑块与内文字使用自动派生的可读前景。
      Switch: {
        colorPrimary: token.color.primary,
        colorPrimaryHover: token.color.primaryHover,
        // 关态轨道：常态 disabled 灰，悬停加深到 tertiary 灰（都不是文字色，不随“文字纯色”走）
        colorTextQuaternary: token.color.textDisabled,
        colorTextTertiary: token.color.textTertiary,
        handleBg: token.color.primaryForeground,
        colorTextLightSolid: token.color.primaryForeground,
        trackHeight: token.control.height - token.space.md,
        trackMinWidth: token.control.height + token.space.md,
        handleSize: token.control.height - token.space.md - token.space.xs,
      },
      Spin: { colorPrimary: token.color.text },
      // 进度/选中态的实色填充改用信息蓝，避免暗色下白底白字或“黑字白框”
      Steps: {
        colorPrimary: token.color.primary,
        colorTextLightSolid: token.color.primaryForeground,
      },
      Calendar: {
        colorPrimary: token.color.primary,
        colorTextLightSolid: token.color.primaryForeground,
      },
      Badge: {
        colorPrimary: token.color.primary,
        colorTextLightSolid: token.color.primaryForeground,
      },
      Slider: {
        colorPrimary: token.color.primary,
        colorPrimaryBorder: token.color.primary,
        colorPrimaryBorderHover: token.color.primaryHover,
      },
      Checkbox: { colorWhite: token.color.primaryForeground },
      Radio: { colorWhite: token.color.primaryForeground },
      Tree: { nodeHoverBg: token.color.surfaceMuted, nodeSelectedBg: token.color.primarySurface },
      Tag: {
        borderRadiusSM: token.radius.xs,
        defaultBg: token.color.surfaceMuted,
        defaultColor: token.color.textSecondary,
      },
      Modal: { borderRadiusLG: token.radius.lg, titleFontSize: token.font.sizeLg },
      // 视图切换是原生 Segmented：选中药丸=品牌弱底+主色字，全部走 token/CSS 变量，品牌种子热切换同步换色
      Segmented: {
        trackBg: 'var(--ds-color-surface-muted)',
        trackPadding: token.space.xs,
        // 未选中的分段项用灰度
        itemColor: 'var(--ds-color-text-tertiary)',
        itemHoverBg: 'var(--ds-color-surface-subtle)',
        itemHoverColor: 'var(--ds-color-text)',
        itemSelectedBg: 'var(--ds-color-primary-surface)',
        itemSelectedColor: 'var(--ds-color-primary-text)',
      },
      // 页签是 line 原生形态；选中文字与下划线用 primary-text（品牌色的文字对比度档），CSS 变量保持品牌种子热切换
      Tabs: {
        itemColor: token.color.textTertiary,
        itemSelectedColor: 'var(--ds-color-primary-text)',
        itemHoverColor: 'var(--ds-color-primary-text)',
        inkBarColor: 'var(--ds-color-primary-text)',
        titleFontSize: token.font.sizeBody,
        horizontalItemGutter: token.space.xl,
      },
      Tooltip: {
        colorBgSpotlight: token.color.surfaceElevated,
        colorTextLightSolid: token.color.text,
        borderRadius: token.radius.xs,
      },
      Form: { labelFontSize: token.font.sizeXs, itemMarginBottom: token.space.lg },
      Statistic: { titleFontSize: token.font.sizeXs, contentFontSize: token.font.sizeMetric },
    },
  };
}
