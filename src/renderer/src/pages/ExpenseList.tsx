import { useState, useEffect } from 'react'
import {
  Card, Table, Select, DatePicker, Button, Space, Tag, Popconfirm, message, Empty
} from 'antd'
import { DeleteOutlined, DownloadOutlined, ReloadOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'

const { RangePicker } = DatePicker

export default function ExpenseList() {
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(false)
  const [filters, setFilters] = useState<{
    categoryId?: number
    startDate?: string
    endDate?: string
  }>({})
  const [messageApi, contextHolder] = message.useMessage()

  useEffect(() => {
    loadCategories()
    loadExpenses()
  }, [])

  const loadCategories = async () => {
    const cats = await window.electronAPI.getCategories()
    setCategories(cats)
  }

  const loadExpenses = async (filterParams?: typeof filters) => {
    setLoading(true)
    try {
      const data = await window.electronAPI.getExpenses(filterParams || filters)
      setExpenses(data)
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (id: number) => {
    await window.electronAPI.deleteExpense(id)
    messageApi.success('已删除')
    loadExpenses()
  }

  const handleExport = async () => {
    const result = await window.electronAPI.exportCsv({
      startDate: filters.startDate,
      endDate: filters.endDate
    })
    if (result.success) {
      messageApi.success('导出成功！')
    }
  }

  const handleFilterApply = () => {
    loadExpenses(filters)
  }

  const handleFilterReset = () => {
    setFilters({})
    loadExpenses({})
  }

  // 构建分类筛选下拉选项
  const categoryOptions = categories.map((p: Category) => ({
    label: p.name,
    value: p.id,
    children: p.children?.map((c: Category) => ({
      label: c.name,
      value: c.id
    }))
  }))

  const columns = [
    {
      title: '日期',
      dataIndex: 'date',
      key: 'date',
      width: 120,
      sorter: (a: Expense, b: Expense) => a.date.localeCompare(b.date),
      render: (date: string) => <span style={{ fontWeight: 500 }}>{date}</span>
    },
    {
      title: '分类',
      key: 'category',
      width: 180,
      render: (_: any, record: Expense) => (
        <Space size={4}>
          <Tag color="blue">{record.parent_category_name}</Tag>
          <span style={{ color: '#999' }}>/</span>
          <Tag color="cyan">{record.category_name}</Tag>
        </Space>
      )
    },
    {
      title: '金额',
      dataIndex: 'amount',
      key: 'amount',
      width: 120,
      sorter: (a: Expense, b: Expense) => a.amount - b.amount,
      render: (amount: number) => (
        <span style={{ color: '#ff4d4f', fontWeight: 600, fontSize: 16 }}>
          -¥{amount.toFixed(2)}
        </span>
      )
    },
    {
      title: '备注',
      dataIndex: 'note',
      key: 'note',
      ellipsis: true,
      render: (note: string) => note || <span style={{ color: '#ccc' }}>—</span>
    },
    {
      title: '操作',
      key: 'action',
      width: 80,
      render: (_: any, record: Expense) => (
        <Popconfirm
          title="确定删除这条记录？"
          onConfirm={() => handleDelete(record.id)}
          okText="确定"
          cancelText="取消"
        >
          <Button type="link" danger icon={<DeleteOutlined />} size="small" />
        </Popconfirm>
      )
    }
  ]

  return (
    <div>
      {contextHolder}
      <Card
        title="📋 花销记录"
        extra={
          <Button icon={<DownloadOutlined />} onClick={handleExport}>
            导出CSV
          </Button>
        }
      >
        {/* 筛选栏 */}
        <div style={{ marginBottom: 16, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <Select
            placeholder="按分类筛选"
            allowClear
            style={{ width: 200 }}
            options={categoryOptions}
            value={filters.categoryId}
            onChange={(val) => setFilters(prev => ({ ...prev, categoryId: val }))}
          />
          <RangePicker
            placeholder={['开始日期', '结束日期']}
            value={
              filters.startDate && filters.endDate
                ? [dayjs(filters.startDate), dayjs(filters.endDate)]
                : null
            }
            onChange={(dates) => {
              if (dates && dates[0] && dates[1]) {
                setFilters(prev => ({
                  ...prev,
                  startDate: dates[0]!.format('YYYY-MM-DD'),
                  endDate: dates[1]!.format('YYYY-MM-DD')
                }))
              } else {
                setFilters(prev => ({
                  ...prev,
                  startDate: undefined,
                  endDate: undefined
                }))
              }
            }}
          />
          <Space>
            <Button type="primary" onClick={handleFilterApply} icon={<ReloadOutlined />}>
              查询
            </Button>
            <Button onClick={handleFilterReset}>重置</Button>
          </Space>
        </div>

        {/* 汇总信息 */}
        <div style={{ marginBottom: 16, fontSize: 15 }}>
          共 <strong>{expenses.length}</strong> 条记录，
          合计支出：
          <span style={{ color: '#ff4d4f', fontWeight: 700, fontSize: 18 }}>
            ¥{expenses.reduce((sum, e) => sum + e.amount, 0).toFixed(2)}
          </span>
        </div>

        {/* 表格 */}
        <Table
          columns={columns}
          dataSource={expenses}
          rowKey="id"
          loading={loading}
          locale={{ emptyText: <Empty description="暂无花销记录，快去记一笔吧！" /> }}
          pagination={{
            pageSize: 20,
            showSizeChanger: true,
            pageSizeOptions: ['10', '20', '50'],
            showTotal: (total) => `共 ${total} 条`
          }}
        />
      </Card>
    </div>
  )
}
