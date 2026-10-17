import test from "node:test";
import assert from "node:assert/strict";
import { orderedTableColumns, defaultTableSort } from "../src/components/ui/tableOrdering.ts";
import { isSameValue, dirtyKeys } from "../src/hooks/useFormDirty.ts";

test("运行时校验最终叶列，条件隐藏与操作列不伪装可排序",()=>{
  const contract={column:"#name",order:"ascend" as const,interactive:["name"],reason:"名称定位"};
  assert.deepEqual(defaultTableSort(contract),{field:"name",order:"ascend"});
  assert.throws(()=>orderedTableColumns([{title:"Other",dataIndex:"other"}],contract,{}));
  assert.throws(()=>orderedTableColumns([{key:"action"}],{...contract,column:"#action",interactive:[]},{}));
  const grouped=orderedTableColumns([{title:"Group",children:[{title:"Name",dataIndex:"name"},{title:"State",dataIndex:"state"}]}],contract,{field:"name",order:"descend"});
  assert.equal("children" in grouped[0] && grouped[0].children[0].sortOrder,"descend");
  assert.equal("children" in grouped[0] && grouped[0].children[1].sorter,false);
});
test("脏值保留实际空白修改，真正空值与字段顺序归一化",()=>{
  assert.equal(isSameValue("name ","name"),false);
  assert.equal(isSameValue(" ",""),false);
  assert.equal(isSameValue(undefined,""),true);
  assert.equal(isSameValue({a:1,b:2},{b:2,a:1}),true);
  assert.deepEqual(dirtyKeys({name:"name "},{name:"name"}),["name"]);
});
