import { Input, Form } from 'antd';

import { QueryForm } from '../../src/components/ui/QueryForm';

/** 查询字段换行后，区域唯一收尾按钮仍贴齐右边界。 */
export function QueryLayoutFixture() {
  return (
    <main>
      <h1>查询收尾布局</h1>
      <QueryForm onSubmit={() => undefined}>
        <Form.Item name="first" label="名称">
          <Input allowClear />
        </Form.Item>
        <Form.Item name="second" label="说明">
          <Input allowClear />
        </Form.Item>
        <Form.Item name="third" label="关键词">
          <Input allowClear />
        </Form.Item>
      </QueryForm>
    </main>
  );
}
