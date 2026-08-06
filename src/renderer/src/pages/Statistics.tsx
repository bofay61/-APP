import { useState, useEffect } from 'react'
import { Card, Radio, Space, DatePicker, Empty, Spin, Statistic } from 'antd'
import ReactECharts from 'echarts-for-react'
import dayjs from 'dayjs'

type ViewMode = 'month' | 'year'

export default function Statistics() {
  const [mode, setMode] = useState<ViewMode>('month')
  const [selectedDate, setSelectedDate] = useState(dayjs())
  const [statsData, setStatsData] = useState<ExpenseStats[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    loadStats()
  }, [mode, selectedDate])

  const loadStats = async () => {
    setLoading(true)
    try {
      const year = selectedDate.year()
      const month = mode === 'month' ? selectedDate.month() + 1 : undefined
      const data = await window.electronAPI.getExpenseStats({ year, month })
      setStatsData(data)
    } finally {
      setLoading(false)
    }
  }

  // ---- 饼图配置：分类占比 ----

  // 处理成按一级分类汇总
  const pieData = (() => {
    const map = new Map<string, number>()
    statsData.forEach(item => {
      const prev = map.get(item.category_name) || 0
      map.set(item.category_name, prev + item.total_amount)
    })
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }))
  })()

  const totalAmount = pieData.reduce((sum, d) => sum + d.value, 0)

  const pieOption = {
    tooltip: {
      trigger: 'item' as const,
      formatter: (params: any) =>
        `${params.name}<br/>¥${params.value.toFixed(2)} (${params.percent}%)`
    },
    legend: {
      type: 'scroll' as const,
      orient: 'vertical' as const,
      right: 10,
      top: 20,
      bottom: 20
    },
    series: [
      {
        name: '支出分类',
        type: 'pie',
        radius: ['45%', '75%'],
        center: ['40%', '50%'],
        avoidLabelOverlap: false,
        itemStyle: {
          borderRadius: 6,
          borderColor: '#fff',
          borderWidth: 2
        },
        label: {
          show: false
        },
        emphasis: {
          label: {
            show: true,
            fontSize: 16,
            fontWeight: 'bold'
          }
        },
        data: pieData
      }
    ]
  }

  // ---- 柱状图配置：按时间/分类 ----

  const barOption = (() => {
    if (mode === 'month') {
      // 每日支出趋势
      const daysInMonth = selectedDate.daysInMonth()
      const dateMap = new Map<string, number>()
      statsData.forEach(item => {
        if (item.date) {
          const prev = dateMap.get(item.date) || 0
          dateMap.set(item.date, prev + item.total_amount)
        }
      })

      const dates: string[] = []
      const values: number[] = []
      for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${selectedDate.year()}-${String(selectedDate.month() + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
        dates.push(`${d}日`)
        values.push(dateMap.get(dateStr) || 0)
      }

      return {
        tooltip: {
          trigger: 'axis' as const,
          formatter: (params: any) =>
            `${params[0].axisValue}<br/>¥${params[0].value.toFixed(2)}`
        },
        xAxis: {
          type: 'category' as const,
          data: dates,
          axisLabel: { rotate: 45 }
        },
        yAxis: {
          type: 'value' as const,
          axisLabel: {
            formatter: (val: number) => `¥${val}`
          }
        },
        series: [
          {
            name: '支出',
            type: 'bar',
            data: values,
            itemStyle: {
              borderRadius: [6, 6, 0, 0],
              color: '#1677ff'
            },
            emphasis: {
              itemStyle: { color: '#4096ff' }
            }
          }
        ],
        grid: { left: 50, right: 20, top: 20, bottom: 50 }
      }
    } else {
      // 每月各分类支出
      const categories = [...new Set(statsData.map(s => s.category_name))]
      const months = [...new Set(statsData.map(s => s.month!))].sort()

      const series = categories.map(cat => ({
        name: cat,
        type: 'bar' as const,
        stack: 'total',
        emphasis: { focus: 'series' as const },
        data: months.map(month => {
          const item = statsData.find(s => s.month === month && s.category_name === cat)
          return item ? item.total_amount : 0
        })
      }))

      return {
        tooltip: {
          trigger: 'axis' as const,
          formatter: (params: any) => {
            let result = params[0].axisValue + '<br/>'
            let total = 0
            params.forEach((p: any) => {
              result += `${p.marker} ${p.seriesName}: ¥${p.value.toFixed(2)}<br/>`
              total += p.value
            })
            result += `<strong>合计: ¥${total.toFixed(2)}</strong>`
            return result
          }
        },
        legend: {
          type: 'scroll' as const,
          bottom: 0
        },
        xAxis: {
          type: 'category' as const,
          data: months
        },
        yAxis: {
          type: 'value' as const,
          axisLabel: {
            formatter: (val: number) => `¥${val}`
          }
        },
        series,
        grid: { left: 50, right: 20, top: 20, bottom: 50 }
      }
    }
  })()

  const titleText = mode === 'month'
    ? `${selectedDate.format('YYYY年M月')} 支出统计`
    : `${selectedDate.format('YYYY年')} 支出统计`

  return (
    <div>
      <Card
        title={`📊 ${titleText}`}
        extra={
          <Space>
            <Radio.Group
              value={mode}
              onChange={(e) => setMode(e.target.value)}
              optionType="button"
              buttonStyle="solid"
            >
              <Radio.Button value="month">按月</Radio.Button>
              <Radio.Button value="year">按年</Radio.Button>
            </Radio.Group>
            <DatePicker
              picker={mode === 'month' ? 'month' : 'year'}
              value={selectedDate}
              onChange={(d) => d && setSelectedDate(d)}
              allowClear={false}
            />
          </Space>
        }
      >
        <Spin spinning={loading}>
          {statsData.length === 0 ? (
            <Empty description="暂无统计数据" style={{ padding: 60 }} />
          ) : (
            <div>
              {/* 总支出卡片 */}
              <div style={{ marginBottom: 24 }}>
                <Statistic
                  title="总支出"
                  value={totalAmount}
                  precision={2}
                  prefix="¥"
                  valueStyle={{ color: '#ff4d4f', fontWeight: 700 }}
                />
              </div>

              {/* 饼图 */}
              <Card title="支出分类占比" size="small" style={{ marginBottom: 24 }}>
                <ReactECharts option={pieOption} style={{ height: 360 }} />
              </Card>

              {/* 柱状图 */}
              <Card
                title={mode === 'month' ? '每日支出趋势' : '每月支出构成'}
                size="small"
              >
                <ReactECharts option={barOption} style={{ height: 360 }} />
              </Card>
            </div>
          )}
        </Spin>
      </Card>
    </div>
  )
}
