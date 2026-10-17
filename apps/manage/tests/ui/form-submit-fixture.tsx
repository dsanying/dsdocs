import { Form, Input, InputNumber, Switch } from 'antd';
import { useRef, useState, useEffect } from 'react';
import { AtomicValue, DrawerForm, ModalForm, ReadonlyValue } from '../../src/components/ui';

export function FormSubmitFixture() {
  const containerRef = useRef<HTMLElement>(null),
    effectMounts = useRef(0);
  useEffect(() => {
    effectMounts.current++;
    containerRef.current?.setAttribute('data-effect-mounts', String(effectMounts.current));
  }, []);
  const [open, setOpen] = useState<'drawer' | 'modal' | null>(null);
  const [requests, setRequests] = useState(0);
  const pending = useRef<(() => void) | undefined>(undefined);
  const finish = async () => {
    setRequests((value) => value + 1);
    await new Promise<void>((resolve) => {
      pending.current = resolve;
    });
    return true;
  };
  const fields = (
    <>
      <Form.Item name="draft" label="会话草稿">
        <Input />
      </Form.Item>
      <AtomicValue text={'完整的长字段'.repeat(80)} />
      <Form.Item name="reference" label="只读标识">
        <ReadonlyValue />
      </Form.Item>
      <Form.Item name="order" label="排序">
        <InputNumber />
      </Form.Item>
      <Form.Item name="enabled" label="启用标志" valuePropName="checked">
        <Switch />
      </Form.Item>
    </>
  );
  return (
    <section ref={containerRef} aria-label="表单提交契约">
      <button type="button" onClick={() => setOpen('drawer')}>
        打开抽屉表单
      </button>
      <button type="button" onClick={() => setOpen('modal')}>
        打开弹窗表单
      </button>
      <button type="button" onClick={() => pending.current?.()}>
        完成表单请求
      </button>
      <output aria-label="表单请求数">{requests}</output>
      <DrawerForm
        initialValues={{ draft: '初始内容', reference: 'reference-key', order: 7, enabled: true }}
        title="抽屉会话"
        open={open === 'drawer'}
        onOpenChange={(visible) => {
          if (!visible) setOpen(null);
        }}
        onFinish={finish}
      >
        {fields}
      </DrawerForm>
      <ModalForm
        initialValues={{ draft: '初始内容', reference: 'reference-key', order: 7, enabled: true }}
        title="弹窗会话"
        open={open === 'modal'}
        onOpenChange={(visible) => {
          if (!visible) setOpen(null);
        }}
        onFinish={finish}
        submitter={{ action: 'query' }}
      >
        {fields}
      </ModalForm>
    </section>
  );
}
