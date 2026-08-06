import { useState, useEffect } from 'react'
import { Card, Form, InputNumber, Cascader, DatePicker, Input, Button, message } from 'antd'
import { PlusOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'

const { TextArea } = Input

export default function AddExpense() {
  const [form] = Form.useForm()
  const [categories, setCategories] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [messageApi, contextHolder] = message.useMessage()

  useEffect(() => {
    loadCategories()
  }, [])

  const loadCategories = async () => {
    const cats = await window.electronAPI.getCategories()
    setCategories(cats)
  }

  const buildCascaderOptions = () => {
    return categories.map((parent: any) => ({
      value: parent.id,
      label: parent.name,
      children: parent.children?.map((child: any) => ({
        value: child.id,
        label: child.name
      }))
    }))
  }

  const handleSubmit = async (values: any) => {
    setLoading(true)
    try {
      // Cascader 返回 [parentId, childId]，取最后一个即二级分类ID
      const categoryId = values.category[values.category.length - 1]
      await window.electronAPI.addExpense({
        amount: values.amount,
        categoryId,
        date: values.date.format('YYYY-MM-DD'),
        note: values.note || ''
      })
      messageApi.success('记账成功！')
      form.resetFields()
      // 保留日期为今天
      form.setFieldsValue({ date: dayjs() })
    } catch (err) {
      messageApi.error('记账失败，请重试')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ maxWidth: 600, margin: '0 auto' }}>
      {contextHolder}
      <Card title="📝 记一笔">
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          initialValues={{ date: dayjs() }}
        >
          <Form.Item
            name="amount"
            label="金额 (¥)"
            rules={[
              { required: true, message: '请输入金额' },
              { type: 'number', min: 0.01, message: '金额必须大于0' }
            ]}
          >
            <InputNumber
              prefix="¥"
              style={{ width: '100%' }}
              placeholder="花了多少钱？"
              precision={2}
              min={0.01}
              size="large"
            />
          </Form.Item>

          <Form.Item
            name="category"
            label="分类"
            rules={[{ required: true, message: '请选择分类' }]}
          >
            <Cascader
              options={buildCascaderOptions()}
              placeholder="选择消费分类"
              size="large"
              style={{ width: '100%' }}
              changeOnSelect
            />
          </Form.Item>

          <Form.Item
            name="date"
            label="日期"
            rules={[{ required: true, message: '请选择日期' }]}
          >
            <DatePicker
              style={{ width: '100%' }}
              size="large"
              maxDate={dayjs()}
            />
          </Form.Item>

          <Form.Item name="note" label="备注（可选）">
            <TextArea
              placeholder="备注信息，如：和谁吃饭、买了什么..."
              rows={2}
              maxLength={200}
              showCount
            />
          </Form.Item>

          <Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              loading={loading}
              icon={<PlusOutlined />}
              size="large"
              block
            >
              记录花销
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  )
}
