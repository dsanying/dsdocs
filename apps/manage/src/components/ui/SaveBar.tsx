import { SaveOutlined, CloseOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import { useTranslation } from 'react-i18next';

import type { ReactNode } from 'react';

import { PageFooterPortal } from './PageFooterSlot';
import { Popconfirm } from './Popconfirm';
import { ResponsiveActions } from './ResponsiveTableToolbar';

import './SaveBar.css';

/** 保存需要二次确认时（如后端返回冲突、需强制覆盖）锚在保存按钮上的确认气泡。 */
export type SaveBarConfirm = {
  description: ReactNode;
  okText?: ReactNode;
  cancelText?: ReactNode;
  /** 确认后的动作有破坏性（强制覆盖等）时确定按钮用危险色。 */
  danger?: boolean;
  wide?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
};

export type SaveBarProps = {
  dirty: boolean;
  saving?: boolean;
  /** 校验或前置条件仅禁用保存，取消仍可用。 */
  disabled?: boolean;
  onSave: () => void;
  /** 丢弃本次草稿，不发起保存。 */
  onCancel: () => void;
  /** 默认正常流；实际正文纵滚时才选择底部槽位。 */
  placement?: 'inline' | 'footer';
  /** 有值时在保存按钮上打开确认气泡（页面级保存的二次确认唯一形式，不用居中弹窗）。 */
  saveConfirm?: SaveBarConfirm;
};

/** 状态化编辑动作：仅在脏状态渲染取消与保存；干净状态的退出由所在容器的返回/关闭承担，页面不重复提供。 */
export function SaveBar({
  dirty,
  saving = false,
  disabled = false,
  onSave,
  onCancel,
  placement = 'inline',
  saveConfirm,
}: SaveBarProps) {
  const { t } = useTranslation();
  if (!dirty) return null;
  const saveButton = (
    <Button
      type="primary"
      aria-label={t('common.actions.save')}
      icon={<SaveOutlined aria-hidden />}
      loading={saving}
      disabled={disabled || saving}
      onClick={onSave}
    >
      {t('common.actions.save')}
    </Button>
  );
  const actions = (
    <div
      className={`ds-save-bar ds-save-bar--${placement}`}
      role="region"
      aria-label={t('common.unsavedChanges')}
      data-kind="save-bar"
    >
      <span className="ds-save-bar__hint">{t('common.unsavedChanges')}</span>
      <ResponsiveActions>
        <Button icon={<CloseOutlined aria-hidden />} disabled={saving} onClick={onCancel}>
          {t('common.actions.cancel')}
        </Button>
        {saveConfirm ? (
          <Popconfirm
            open
            title={t('common.confirm.execute')}
            description={saveConfirm.description}
            okText={saveConfirm.okText}
            cancelText={saveConfirm.cancelText}
            okButtonProps={{ danger: saveConfirm.danger }}
            wide={saveConfirm.wide}
            placement="topRight"
            onConfirm={saveConfirm.onConfirm}
            onCancel={saveConfirm.onCancel}
            onOpenChange={(next) => {
              if (!next) saveConfirm.onCancel();
            }}
          >
            {saveButton}
          </Popconfirm>
        ) : (
          saveButton
        )}
      </ResponsiveActions>
    </div>
  );
  return placement === 'footer' ? <PageFooterPortal>{actions}</PageFooterPortal> : actions;
}
