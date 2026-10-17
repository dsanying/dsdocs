import assert from "node:assert/strict";
import test from "node:test";
import { rewriteLiteralKeys } from "./i18n-rewrite-keys.mjs";
const rename = new Map([["portal.commit", "common.vocab.commit"]]);
test("精确迁移三种静态引号，不碰动态模板、注释和子串", () => {
  const input = "t('portal.commit'); t(\"portal.commit\"); t(`portal.commit`); t(`portal.$"+"{kind}`); // 'portal.commit'\nconst x = 'prefix portal.commit';";
  const output = "t('common.vocab.commit'); t(\"common.vocab.commit\"); t(`common.vocab.commit`); t(`portal.$"+"{kind}`); // 'portal.commit'\nconst x = 'prefix portal.commit';";
  assert.equal(rewriteLiteralKeys(input, rename), output);
});
test("识别转义的真实字面值，同步动态键 JSON 登记", () => {
  assert.equal(rewriteLiteralKeys("t('portal.\\u0063ommit')", rename), "t('common.vocab.commit')");
  assert.equal(rewriteLiteralKeys('{"keys":["portal.commit"]}', rename, "dynamic-keys.json"), '{"keys":["common.vocab.commit"]}');
});
