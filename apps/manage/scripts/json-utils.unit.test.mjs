import assert from "node:assert/strict";
import test from "node:test";

import {
  formatJson,
  formatUnknownJson,
  parseJsonText,
} from "../src/utils/json.ts";

test("JSON helper 保持语法解析与领域校验边界", () => {
  assert.deepEqual(parseJsonText('{"enabled":true}'), { enabled: true });
  assert.throws(() => parseJsonText("{"), SyntaxError);

});

test("JSON helper 统一 pretty print 且只读文本安全降级", () => {
  assert.equal(formatJson({ nested: [1] }), '{\n  "nested": [\n    1\n  ]\n}');
  assert.equal(formatUnknownJson('{"nested":[1]}'), '{\n  "nested": [\n    1\n  ]\n}');
  assert.equal(formatUnknownJson("plain remark"), "plain remark");
  assert.equal(formatUnknownJson(null), "—");
});
