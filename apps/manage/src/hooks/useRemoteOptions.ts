import { useCallback, useEffect, useMemo, useRef, useState, type DependencyList } from 'react';

import { useDebouncedValue } from './useDebouncedValue';
import { useRequest } from './useRequest';

export type RemoteOption = { value: string; label: string; unverified?: boolean };

export type RemoteOptionsLoader = (keyword: string) => Promise<RemoteOption[]>;

/**
 * 大候选集（主体、UPN、邮箱这类以万计的枚举）的实时候选机制：
 * 不全量下发，按输入关键词防抖后向后端取前 N 条；只有最新一次请求的结果会写入（useRequest 保证），
 * 已选值即使不在当前结果里也保留为选项，保证选中标签不丢失。
 * 传 resolve 时已选值会按真实值精确核验：服务端认得的回填标签，认不得的保留为未核验项（unverified），
 * 供控件标红提示；不提供 resolve 时无法区分真伪，已选值一律视为候选（历史兼容行为）。
 */
const sameScope = (left: DependencyList, right: DependencyList) =>
  left.length === right.length && left.every((value, index) => Object.is(value, right[index]));

/** 折叠核验的规范化修正：from 是已选原文，to 是服务端返回的唯一规范值（仅大小写差异）。 */
export type RemoteOptionsCorrection = { from: string; to: string };

export type RemoteOptionsResolveExtras = {
  /**
   * 精确核验失败后的折叠核验：按大小写不敏感匹配取回库中规范值，
   * 一个输入值对应唯一规范值时通过 onCorrect 自动校正，多个变体视为歧义保持未核验。
   */
  resolveFold?: (values: string[]) => Promise<RemoteOption[]>;
  /** 批量应用规范化修正：由调用方把已选值 from 替换为 to（只改选择，不重发请求）。 */
  onCorrect?: (fixes: readonly RemoteOptionsCorrection[]) => void;
  /**
   * 一批已选值核验（精确+折叠）全部落定后回报：settled 是整批送验原值，unresolved 是仍未核验子集
   * （候选不存在，或存在多个仅大小写不同的变体属歧义）。核验请求失败不触发——失败值退回 failed 等显式重试，
   * 此时错误面由 error 承担，不算"未决"。
   */
  onVerifySettled?: (settled: readonly string[], unresolved: readonly string[]) => void;
};

export function useRemoteOptions(
  load: RemoteOptionsLoader,
  selected: readonly RemoteOption[] = [],
  refreshDeps: DependencyList = [],
  resolve?: (values: string[]) => Promise<RemoteOption[]>,
  extras?: RemoteOptionsResolveExtras
) {
  const { resolveFold, onCorrect, onVerifySettled } = extras ?? {};
  const [keyword, setKeyword] = useState('');
  const debounced = useDebouncedValue(keyword);
  const [selectedLabels, setSelectedLabels] = useState<{
    load: RemoteOptionsLoader;
    scope: DependencyList;
    options: RemoteOption[];
  }>({ load, scope: [...refreshDeps], options: [] });
  const sequence = useRef(0);
  const currentSelection = useRef(selected);
  useEffect(() => {
    currentSelection.current = selected;
  }, [selected]);
  // 按值核验：每个作用域内同一值只请求一次；核验到的写入 selectedLabels（与检索命中同源），其余保持未核验。
  const attempted = useRef<{
    load: RemoteOptionsLoader;
    scope: DependencyList;
    values: Set<string>;
    failed: Set<string>;
  }>({ load, scope: [...refreshDeps], values: new Set(), failed: new Set() });
  // 折叠核验结果缓存：value → 唯一规范值（undefined=歧义或无命中）；已推送过 onCorrect 的值不再重复修正
  const corrections = useRef<{
    load: RemoteOptionsLoader;
    scope: DependencyList;
    map: Map<string, string | undefined>;
    pushed: Set<string>;
  }>({ load, scope: [...refreshDeps], map: new Map(), pushed: new Set() });
  const pendingResolve = useRef(0);
  const [resolving, setResolving] = useState(false);
  // 核验（精确+折叠）失败的错误面：与检索失败一样就地内联报错可重试；核验失败的值退回 attempted 重新排队，
  // 否则一次网络抖动会让唯一大小写变体永久标红且无恢复路径。
  const [resolveError, setResolveError] = useState<unknown>(null);
  const query = useRequest(
    async () => {
      const requestSequence = ++sequence.current;
      const results = await load(debounced);
      if (requestSequence !== sequence.current)
        return { load, scope: [...refreshDeps], keyword: debounced, options: results };
      setSelectedLabels((previous) => {
        const selectedValues = new Set(currentSelection.current.map((item) => item.value));
        const labels = new Map(
          (previous.load === load && sameScope(previous.scope, refreshDeps) ? previous.options : [])
            .filter((item) => selectedValues.has(item.value))
            .map((item) => [item.value, item])
        );
        for (const item of results) labels.set(item.value, item);
        return { load, scope: [...refreshDeps], options: [...labels.values()] };
      });
      return { load, scope: [...refreshDeps], keyword: debounced, options: results };
    },
    { refreshDeps: [debounced, load, ...refreshDeps], resetDataOnRefreshDepsChange: true }
  );
  // 候选属于加载器（实体/作用域）和原始关键词；防抖等待期间也不能展示上一轮结果。
  const results = useMemo(
    () =>
      query.data?.load === load &&
      sameScope(query.data.scope, refreshDeps) &&
      query.data.keyword === keyword
        ? query.data.options
        : [],
    [query.data, load, keyword, refreshDeps]
  );

  // 按值核验：每个作用域内同一值只请求一次；核验到的写入 selectedLabels（与检索命中同源），其余保持未核验标红。
  useEffect(() => {
    if (!resolve) return;
    if (attempted.current.load !== load || !sameScope(attempted.current.scope, refreshDeps)) {
      attempted.current = { load, scope: [...refreshDeps], values: new Set(), failed: new Set() };
      corrections.current = { load, scope: [...refreshDeps], map: new Map(), pushed: new Set() };
      setResolveError(null);
    }
    // 已知的规范化修正立即应用（含再次粘贴同一拼写变体的场景）。
    // pushed 只挡"修正已发出、父级尚未回写"窗口内的重复推送：值离开选择集后放行，
    // 否则同一变体被删掉再粘贴时会永久标红。
    const selectedNow = new Set(selected.map((item) => item.value));
    for (const from of [...corrections.current.pushed]) {
      if (!selectedNow.has(from)) corrections.current.pushed.delete(from);
    }
    const pendingFixes: RemoteOptionsCorrection[] = [];
    for (const item of selected) {
      const canonical = corrections.current.map.get(item.value);
      if (canonical && canonical !== item.value && !corrections.current.pushed.has(item.value)) {
        corrections.current.pushed.add(item.value);
        pendingFixes.push({ from: item.value, to: canonical });
      }
    }
    if (pendingFixes.length) onCorrect?.(pendingFixes);
    const verified = new Set([
      ...results.map((item) => item.value),
      ...(selectedLabels.load === load && sameScope(selectedLabels.scope, refreshDeps)
        ? selectedLabels.options
        : []
      ).map((item) => item.value),
    ]);
    // 后端一次最多核验 200 个，超出的等本轮核验落定后由下一次 effect 续批
    // failed 里的值（上次核验请求失败）不自动重试，等显式 retry 清空后重新核验——避免失败在渲染循环里自我重放
    const missing = selected
      .map((item) => item.value)
      .filter(
        (value) =>
          !verified.has(value) &&
          !attempted.current.values.has(value) &&
          !attempted.current.failed.has(value)
      )
      .slice(0, 200);
    if (missing.length === 0) return;
    for (const value of missing) attempted.current.values.add(value);
    // selected 引用每轮渲染都可能变化，别用 cleanup 取消：写入时按值幂等合并，pending 计数归零才收 loading
    pendingResolve.current += 1;
    setResolving(true);
    const scope = [...refreshDeps];
    const mergeLabels = (items: readonly RemoteOption[]) => {
      setSelectedLabels((previous) => {
        const base =
          previous.load === load && sameScope(previous.scope, scope) ? previous.options : [];
        const merged = new Map(base.map((item) => [item.value, item]));
        for (const item of items)
          merged.set(item.value, { value: item.value, label: item.label || item.value });
        return { load, scope, options: [...merged.values()] };
      });
    };
    // 作用域已切换时整批结果作废：corrections/failed/resolveError 都属于当前作用域，
    // 迟到响应不得写入新作用域的状态（mergeLabels 内部另有同样的 scope 守卫）
    const isCurrentScope = () =>
      attempted.current.load === load && sameScope(attempted.current.scope, scope);
    void resolve(missing)
      .then(async (items) => {
        if (!isCurrentScope()) return;
        mergeLabels(items);
        // 只在没有任何待重试的失败值时才清错误面：另一批次失败留下的 failed 仍需显式 retry
        if (attempted.current.failed.size === 0) setResolveError(null);
        const found = new Set(items.map((item) => item.value));
        const pending = missing.filter((value) => !found.has(value));
        // 精确核验未命中的值再做一轮折叠核验：唯一大小写变体自动校正为规范值，多个变体是歧义保持标红不猜
        if (!resolveFold || pending.length === 0) {
          onVerifySettled?.(missing, pending);
          return;
        }
        // 折叠核验失败只影响 pending 这批值（精确已命中的不回退）：同样退回 failed 等显式重试
        let folded: RemoteOption[];
        try {
          folded = await resolveFold(pending);
        } catch (cause) {
          if (!isCurrentScope()) return;
          for (const value of pending) {
            attempted.current.values.delete(value);
            attempted.current.failed.add(value);
          }
          setResolveError(cause);
          return;
        }
        if (!isCurrentScope()) return;
        mergeLabels(folded);
        const fixes: RemoteOptionsCorrection[] = [];
        for (const value of pending) {
          const canonicals = [
            ...new Set(
              folded
                .filter((item) => item.value.toLowerCase() === value.toLowerCase())
                .map((item) => item.value)
            ),
          ];
          const canonical = canonicals.length === 1 ? canonicals[0] : undefined;
          corrections.current.map.set(value, canonical);
          if (canonical && canonical !== value && !corrections.current.pushed.has(value)) {
            corrections.current.pushed.add(value);
            fixes.push({ from: value, to: canonical });
          }
        }
        if (fixes.length) onCorrect?.(fixes);
        // 折叠落定后本批全部有结论：精确命中 + 唯一变体已修正为已决；歧义与缺席是未决
        onVerifySettled?.(
          missing,
          pending.filter((value) => !corrections.current.map.get(value))
        );
      })
      .catch((cause: unknown) => {
        // 核验失败不是"值不存在"：从 attempted 挪到 failed——挡住渲染循环的自动重放，
        // 显式 retry 清空 failed 后重新核验；错误透出到候选区报错。
        if (!isCurrentScope()) return;
        for (const value of missing) {
          attempted.current.values.delete(value);
          attempted.current.failed.add(value);
        }
        setResolveError(cause);
      })
      .finally(() => {
        pendingResolve.current -= 1;
        if (pendingResolve.current <= 0) setResolving(false);
      });
  }, [
    resolve,
    resolveFold,
    onCorrect,
    onVerifySettled,
    selected,
    refreshDeps,
    load,
    results,
    selectedLabels,
  ]);

  const options = useMemo(() => {
    const seen = new Set(results.map((item) => item.value));
    const persisted =
      selectedLabels.load === load && sameScope(selectedLabels.scope, refreshDeps)
        ? selectedLabels.options
        : [];
    // 服务端从未确认过的种子值标记 unverified：供候选制控件标红，不冒充真实候选；无 resolve 无法核验时维持原样
    return [
      ...results,
      ...selected
        .map(
          (item) =>
            persisted.find((option) => option.value === item.value) ??
            (resolve ? { ...item, unverified: true } : item)
        )
        .filter((item) => !seen.has(item.value)),
    ];
  }, [results, selected, selectedLabels, load, refreshDeps, resolve]);

  const onSearch = useCallback(
    (value: string) => {
      if (value === keyword) return;
      // 新输入到达即失效旧标签写入，不等下一次防抖请求发起。
      sequence.current += 1;
      setKeyword(value);
    },
    [keyword]
  );

  const queryRun = query.run;
  const retry = useCallback(async () => {
    // 显式重试放行上次核验失败的值（重新走"精确→折叠"链），并清掉核验错误面
    attempted.current.failed.clear();
    setResolveError(null);
    await queryRun();
  }, [queryRun]);

  return {
    options,
    loading: query.loading || keyword !== debounced || resolving,
    error: keyword === debounced ? (resolveError ?? query.error) : undefined,
    retry,
    onSearch,
    keyword,
  };
}

/**
 * 失焦后按搜索框实际内容同步关键词：Ant 在下一帧内自行清空输入且不回调 onSearch，
 * 输入仍保留（如关闭自动清空）时保持关键词与进行中的请求不变。
 */
export function syncClearedKeyword(target: EventTarget, onSearch: (value: string) => void) {
  if (!(target instanceof HTMLInputElement)) return;
  requestAnimationFrame(() => {
    if (!target.value) onSearch('');
  });
}
