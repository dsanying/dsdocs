import { useState } from 'react';
import { Form, Input } from 'antd';
import { ModalForm, DrawerForm } from '../../src/components/ui';

export function ActionFooterFixture() {
  const [open, setOpen] = useState<'modal' | 'drawer' | null>(null);
  return (
    <section>
      <button type="button" onClick={() => setOpen('modal')}>
        打开弹窗表单
      </button>
      <button type="button" onClick={() => setOpen('drawer')}>
        打开抽屉表单
      </button>
      <ModalForm
        title="查询"
        open={open === 'modal'}
        onOpenChange={(value) => {
          if (!value) setOpen(null);
        }}
        submitter={{ action: 'query' }}
        onFinish={() => true}
      >
        <Form.Item name="draft" label="草稿">
          <Input />
        </Form.Item>
      </ModalForm>
      <DrawerForm
        title="编辑"
        open={open === 'drawer'}
        onOpenChange={(value) => {
          if (!value) setOpen(null);
        }}
        onFinish={() => true}
      >
        <Form.Item name="draft" label="草稿">
          <Input />
        </Form.Item>
      </DrawerForm>
    </section>
  );
}
