import { SearchOutlined } from '@ant-design/icons';
import { Button, Form, type FormInstance, type FormProps } from 'antd';
import { useId, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import './QueryForm.css';

export type QueryFormProps<TValues> = {
  form?: FormInstance<TValues>;
  initialValues?: Partial<TValues>;
  /** 点击查询或在输入框回车时提交；条件变更本身不触发请求。 */
  onSubmit: (values: TValues) => void;
  /** 若干 `Form.Item`，每项以 label 表达字段名，不使用 placeholder。 */
  children: ReactNode;
  className?: string;
};

/**
 * 表格查询区的唯一实现：“标签：控件”同行的查询条，条件横向排列、查询按钮在区域右侧，
 * 宽度足够时保持一行，不够时整项换行，窄屏单列，查询换行后仍靠右；只保留一个查询按钮；
 * 清除单个条件用输入控件自身的 allowClear，不提供整表重置。
 * 查询按钮在请求进行中保持可点：新提交由表格状态机按末次请求胜出处理，加载态由表格自身表达。
 */
export function QueryForm<TValues extends object>({
  form,
  initialValues,
  onSubmit,
  children,
  className,
}: QueryFormProps<TValues>) {
  const { t } = useTranslation();
  // 查询表单与同页的编辑表单常常使用同名字段（如 name），用唯一表单名隔离控件 id，保证 label 关联正确。
  const formName = `query-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const formProps: FormProps<TValues> = {
    form,
    name: formName,
    initialValues,
    layout: 'inline',
    onFinish: onSubmit,
  };
  return (
    <Form<TValues>
      {...formProps}
      className={['ds-query-form', className].filter(Boolean).join(' ')}
      data-layout="query-form"
    >
      {children}
      <Form.Item className="ds-query-form__submit">
        <Button
          type="primary"
          htmlType="submit"
          aria-label={t('common.actions.query')}
          icon={<SearchOutlined aria-hidden />}
        >
          {t('common.actions.query')}
        </Button>
      </Form.Item>
    </Form>
  );
}
