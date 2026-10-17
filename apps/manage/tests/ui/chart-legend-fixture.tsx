import { useRef, useState } from 'react';
import type { ECharts } from 'echarts';
import ReactECharts from '../../src/components/ReactEcharts';
import { BarList } from '../../src/components/ReactEcharts/BarList';
import { CHART_HEIGHT } from '../../src/components/ReactEcharts/chartOptions';

/** 使用真实渲染器核对模块注册、图例取色与密集标签，而不是仅断言 option 字面量。 */
export function ChartLegendFixture() {
  const classified = useRef<ECharts | null>(null);
  const chart = useRef<ECharts | null>(null);
  const [snapshot, setSnapshot] = useState('');
  const names = Array.from({ length: 20 }, (_, index) => `model-${index}`);
  const inspect = () => {
    const instance = chart.current;
    if (!instance) return;
    const option = instance.getOption();
    const visibleLabels = instance
      .getZr()
      .storage.getDisplayList()
      .filter((element) => {
        const painted = element as unknown as {
          type: string;
          style?: { text?: string };
          ignore?: boolean;
        };
        return (
          !painted.ignore && painted.type === 'tspan' && names.includes(painted.style?.text ?? '')
        );
      }).length;
    const classifiedOption = classified.current?.getOption();
    const legend = (
      classifiedOption?.legend as { type: string; data: string[] }[] | undefined
    )?.[0];
    const colors = [0, 1].map((seriesIndex) =>
      classified.current?.getVisual({ seriesIndex }, 'color')
    );
    setSnapshot(
      JSON.stringify({
        visibleLabels,
        seriesCount: (option.series as unknown[]).length,
        legendType: legend?.type,
        legendNames: legend?.data,
        distinctColors: new Set(colors).size,
      })
    );
  };
  return (
    <main>
      <BarList
        label="堆叠 Token"
        categories={['model']}
        series={[
          { name: '输入', data: [10] },
          { name: '输出', data: [5] },
        ]}
        stacked
      />
      <ReactECharts
        ref={chart}
        option={{
          animation: false,
          xAxis: { type: 'value' },
          yAxis: { type: 'value' },
          series: [
            {
              type: 'scatter',
              data: names.map((name) => [1, 1, name]),
              label: { show: true, formatter: '{@[2]}' },
              labelLayout: { hideOverlap: true },
            },
          ],
        }}
        style={{ height: CHART_HEIGHT }}
      />
      <ReactECharts
        ref={classified}
        option={{
          animation: false,
          xAxis: { type: 'value', name: '请求数' },
          yAxis: { type: 'value', name: '数量' },
          series: ['model-a', 'model-b'].map((name, index) => ({
            type: 'scatter',
            name,
            data: [[index + 1, index + 2]],
          })),
        }}
        style={{ height: CHART_HEIGHT }}
      />
      <button type="button" onClick={inspect}>
        检查图表
      </button>
      <output>{snapshot}</output>
    </main>
  );
}
