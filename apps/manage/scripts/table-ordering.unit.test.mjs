import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectTableOrdering } from './table-ordering-governance.mjs';

const columns = 'export function buildColumns() { return [{title:"名称", dataIndex:"name"},{title:"创建时间", dataIndex:"createdAt"},{title:"操作", key:"actions"}]; }';
const contract = '{column:"./columns#name",order:"ascend",interactive:["name","createdAt"],reason:"名称定位；时间便于浏览，操作不排序"}';
const inspect = (ordering = contract, extra = '', source = columns) => inspectTableOrdering([
  {filename:'src/pages/List/index.tsx',source:`import {DataTable as Grid} from "@/components/ui"; import {buildColumns as make} from "./columns"; const cols=make(); <Grid columns={cols} ${ordering === null ? '' : `ordering={${ordering}}`} ${extra} />`},
  {filename:'src/pages/List/columns.tsx',source},
]);

test('排序绑定实际跨文件构造列，允许部分列主动排序', () => {
  assert.deepEqual(inspect(), []);
  assert.deepEqual(inspect(contract.replace('["name","createdAt"]','[]')), []);
});

test('拒绝缺失、动态契约、对象展开、非法方向和空原因', () => {
  for (const value of [null, 'runtime', `{...rules,column:"./columns#name"}`, contract.replace('"ascend"','"asc"'), contract.replace('名称定位；时间便于浏览，操作不排序',' ')]) assert.ok(inspect(value).length, String(value));
  assert.ok(inspect(contract, '{...runtime}').length);
});

test('拒绝不存在字段、操作列、重复或动态主动排序声明', () => {
  for (const value of [contract.replace('#name','#missing'), contract.replace('#name','#actions'), contract.replace('["name","createdAt"]','["actions"]'), contract.replace('["name","createdAt"]','["name","name"]'), contract.replace('["name","createdAt"]','fields'), contract.replace('["name","createdAt"]','[field]')]) assert.ok(inspect(value).length, value);
});

test('同文件另一表的列不能蒙混成为实际列', () => {
  const source = columns + ' const unrelated=[{title:"ID",dataIndex:"id"}];';
  assert.ok(inspect(contract.replace('#name','#id'), '', source).some(i => i.message.includes('实际传入')));
});

test('列不能保留页面自行 sorter/defaultSortOrder/sortOrder，后端请求映射不误报', () => {
  for (const property of ['sorter:true','defaultSortOrder:"ascend"','sortOrder:"descend"']) assert.ok(inspect(contract, '', columns.replace('dataIndex:"name"',`dataIndex:"name",${property}`)).length);
  assert.deepEqual(inspect(contract, '', columns + ' const request={sortOrder:"desc"};'), []);
});

test('追踪同文件 useMemo、命名空间 DataTable 与条件筛选，不接受动态来源', () => {
  const source = `import * as UI from "@/components/ui"; import {useMemo as memo} from "react";
    function Page(){const columns=memo(()=>[{title:"名称",dataIndex:"name"}],[]); return <UI.DataTable columns={columns} ordering={{column:"#name",order:"ascend",interactive:["name"],reason:"名称定位，其他不排序"}}/>;}`;
  assert.deepEqual(inspectTableOrdering([{filename:'src/pages/List.tsx',source}]), []);
  assert.ok(inspectTableOrdering([{filename:'src/pages/List.tsx',source:source.replace('columns={columns}','columns={runtime}')}]).some(i => i.message.includes('无法静态解析')));
  assert.deepEqual(inspect(contract, '', columns.replace('return [', 'const cols=[').replace(']; }', ']; return enabled ? cols : cols.filter(x=>true); }')), []);
});

test('所有内存 Table 包括分页必须声明排序，given需说明语义顺序', () => {
  const inspectTable = props => inspectTableOrdering([{filename:'src/pages/Preview.tsx',source:`import {Table as Grid} from "@/components/ui"; <Grid pagination={pager} ${props}/>`}]);
  assert.ok(inspectTable('').length);
  assert.deepEqual(inspectTable('orderBy={row=>row.name}'), []);
  assert.deepEqual(inspectTable('sortable={dragging}'), []);
  assert.ok(inspectTable('order="given"').length);
  assert.deepEqual(inspectTable('// 导入预览保持文件顺序\norder="given"'), []);
});

test('共享实现无需业务排序契约；普通本地同名组件不误报', () => {
  assert.deepEqual(inspectTableOrdering([{filename:'src/components/ui/DataTable.tsx',source:'import {Table} from "@/components/ui"; <Table />'}]), []);
  assert.deepEqual(inspectTableOrdering([{filename:'src/pages/Preview.tsx',source:'function DataTable(){return null}; <DataTable />'}]), []);
});

test('真实 columns 可由控制器对象解构返回；不能借返回对象其他数组充数', () => {
  const files = [
    {filename:'src/pages/List/index.tsx',source:`import {DataTable} from "@/components/ui"; import {useController} from "./controller"; const {columns}=useController(); <DataTable columns={columns} ordering={${contract}}/>`},
    {filename:'src/pages/List/controller.ts',source:'import {buildColumns} from "./columns"; export function useController(){const columns=buildColumns(); const other=[{title:"隐藏",dataIndex:"hidden"}]; return {columns,other};}'},
    {filename:'src/pages/List/columns.tsx',source:columns},
  ];
  assert.deepEqual(inspectTableOrdering(files), []);
  files[0].source=files[0].source.replace('#name','#hidden');
  assert.ok(inspectTableOrdering(files).some(i=>i.message.includes('实际传入')));
});

test('本地组件别名不能绕过排序声明', () => {
  const source='import {DataTable as Original} from "@/components/ui"; const Alias=Original; <Alias columns={columns}/>';
  assert.ok(inspectTableOrdering([{filename:'src/pages/List.tsx',source}]).some(i=>i.message.includes('内联静态 ordering')));
});

test('外部固定 ID 顺序须绑定真实页面服务调用及 endpoint，禁止错误方向和主动排序', () => {
  const contract={page:'src/pages/List/index.tsx',columns:'src/pages/List/columns.tsx',service:'src/services/catalog.ts',request:'getList',endpoint:'/api/catalog/v1/list',field:'id',order:'descend',interactive:false,reason:'用户限定不修改外部服务，固定ID倒序'};
  const sources=[
    {filename:contract.page,source:'import {DataTable} from "@/components/ui"; import {buildColumns} from "./columns"; import {getList} from "@/services/catalog"; const request=()=>getList({}); <DataTable columns={buildColumns()} ordering={{column:"./columns#id",order:"descend",interactive:[],reason:"外部固定顺序"}}/>'},
    {filename:contract.columns,source:'export function buildColumns(){return [{title:"ID",dataIndex:"id"},{title:"名称",dataIndex:"name"}];}'},
    {filename:contract.service,source:'export function getList(params){return request("/api/catalog/v1/list",{params});}'},
  ];
  const inspectExternal=(files=sources,meta=contract)=>inspectTableOrdering(files,{externalFixedOrderTables:[meta]});
  assert.deepEqual(inspectExternal(), []);
  for (const [from,to] of [['order:"descend"','order:"ascend"'],['interactive:[]','interactive:["id"]'],['getList({})','otherList({})']]) assert.ok(inspectExternal(sources.map(s=>({...s,source:s.source.replace(from,to)}))).length);
  assert.ok(inspectExternal(sources,{...contract,endpoint:'/api/wrong/v1/list'}).length);
  assert.ok(inspectExternal(sources,{...contract,reason:''}).length);
  assert.ok(inspectExternal(sources.filter(s=>s.filename!==contract.service)).length);
  assert.ok(inspectExternal(sources.map(s=>({...s,source:s.source.replaceAll('DataTable','UncontrolledTable')}))).length);
});
