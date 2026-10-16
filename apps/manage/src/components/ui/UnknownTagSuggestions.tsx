import { useEffect, useMemo, useState } from 'react';

import { rankOptionsBySimilarity, type PasteOption } from './selectValues';

/**
 * 幽灵值的近似候选清单：弹层挂载时才按 probe 远端检索一次（远程候选按页加载，大小写变体
 * 常不在首页里），与本地候选按值去重合并后按近似度排序；检索中先展示本地近似项，命中后原位更新。
 */
export function UnknownTagSuggestions({
  value,
  options,
  probe,
  onReplace,
}: {
  value: string;
  options: readonly PasteOption[];
  probe?: (value: string) => Promise<readonly PasteOption[]>;
  onReplace: (to: string) => void;
}) {
  const [probed, setProbed] = useState<readonly PasteOption[]>();
  useEffect(() => {
    if (!probe) return;
    let live = true;
    void probe(value)
      .then((items) => {
        if (live) setProbed(items);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [probe, value]);
  const merged = useMemo(() => {
    const seen = new Set<string>();
    return [...(probed ?? []), ...options].filter((option) => {
      const key = String(option.value);
      return !seen.has(key) && (seen.add(key), true);
    });
  }, [probed, options]);
  return (
    <ul className="ds-select-tag__suggestions">
      {rankOptionsBySimilarity(value, merged).map((option) => {
        const optionValue = String(option.value);
        const label = String(option.label ?? option.value);
        return (
          <li key={optionValue}>
            <button
              type="button"
              className="ds-select-tag__suggestion"
              onClick={(event) => {
                event.stopPropagation();
                onReplace(optionValue);
              }}
            >
              {label === optionValue ? label : `${label} (${optionValue})`}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
