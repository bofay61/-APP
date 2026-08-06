import { useState, useEffect } from 'react'
import {
  Card, Table, Button, Modal, Input, Space, Popconfirm, message, Tag, Empty
} from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons'

export default function CategoryManage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [modalTitle, setModalTitle] = useState('')
  const [editingId, setEditingId] = useState<number | null>(null)
  const [categoryName, setCategoryName] = useState('')
  const [parentId, setParentId] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [messageApi, contextHolder] = message.useMessage()

  useEffect(() => {
    loadCategories()
  }, [])

  const loadCategories = async () => {
    setLoading(true)
    try {
      const cats = await window.electronAPI.getCategories()
      setCategories(cats)
    } finally {
      setLoading(false)
    }
  }

  const openAddModal = (parentId: number | null, parentName?: string) => {
    setEditingId(null)
    setParentId(parentId)
    setCategoryName('')
    setModalTitle(parentId ? `在「${parentName}」下添加小类` : '添加大类')
    setModalOpen(true)
  }

  const openEditModal = (id: number, name: string) => {
    setEditingId(id)
    setCategoryName(name)
    setParentId(null)
    setModalTitle('修改分类名称')
    setModalOpen(true)
  }

  const handleSubmit = async () => {
    if (!categoryName.trim()) {
      messageApi.warning('请输入分类名称')
      return
    }
    setSubmitting(true)
    try {
      if (editingId) {
        await window.electronAPI.updateCategory(editingId, categoryName.trim())
        messageApi.success('修改成功')
      } else {
        await window.electronAPI.addCategory(categoryName.trim(), parentId)
        messageApi.success('添加成功')
      }
      setModalOpen(false)
      loadCategories()
    } catch (err) {
      messageApi.error('操作失败')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (id: number) => {
    const result = await window.electronAPI.deleteCategory(id)
    if (result.success) {
      messageApi.success('已删除')
      loadCategories()
    } else {
      messageApi.error(result.error || '删除失败')
    }
  }

  // 构建表格数据：展开一级分类，二级分类作为子行
  const tableData = categories.map((parent: Category) => ({
    key: `parent-${parent.id}`,
    id: parent.id,
    name: parent.name,
    isParent: true,
    children: parent.children?.map((child: Category) => ({
      key: `child-${child.id}`,
      id: child.id,
      name: child.name,
      isParent: false,
      parentName: parent.name
    }))
  }))

  const columns = [
    {
      title: '分类名称',
      dataIndex: 'name',
      key: 'name',
      render: (name: string, record: any) => (
        <Space>
          {record.isParent ? (
            <Tag color="blue" style={{ fontSize: 14, padding: '4px 12px' }}>{name}</Tag>
          ) : (
            <span style={{ paddingLeft: 24 }}>
              <Tag color="cyan" style={{ fontSize: 13 }}>{name}</Tag>
            </span>
          )}
        </Space>
      )
    },
    {
      title: '类型',
      key: 'type',
      width: 100,
      render: (_: any, record: any) => (
        <span style={{ color: record.isParent ? '#1677ff' : '#999' }}>
          {record.isParent ? '一级大类' : '二级小类'}
        </span>
      )
    },
    {
      title: '操作',
      key: 'action',
      width: 220,
      render: (_: any, record: any) => (
        <Space>
          <Button
            type="link"
            icon={<EditOutlined />}
            size="small"
            onClick={() => openEditModal(record.id, record.name)}
          >
            编辑
          </Button>
          {record.isParent && (
            <Button
              type="link"
              icon={<PlusOutlined />}
              size="small"
              onClick={() => openAddModal(record.id, record.name)}
            >
              添加小类
            </Button>
          )}
          <Popconfirm
            title="确定删除？"
            description={record.isParent ? '删除大类会同时删除其下所有小类（前提是无关联记录）' : ''}
            onConfirm={() => handleDelete(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button type="link" danger icon={<DeleteOutlined />} size="small" />
          </Popconfirm>
        </Space>
      )
    }
  ]

  return (
    <div style={{ maxWidth: 700, margin: '0 auto' }}>
      {contextHolder}
      <Card
        title="📂 分类管理"
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={() => openAddModal(null)}>
            添加大类
          </Button>
        }
      >
        <Table
          columns={columns}
          dataSource={tableData}
          loading={loading}
          pagination={false}
          locale={{ emptyText: <Empty description="暂无分类" /> }}
          expandable={{
            defaultExpandAllRows: true
          }}
        />
      </Card>

      <Modal
        title={modalTitle}
        open={modalOpen}
        onOk={handleSubmit}
        onCancel={() => setModalOpen(false)}
        confirmLoading={submitting}
        okText="确定"
        cancelText="取消"
        destroyOnClose
      >
        <Input
          placeholder="分类名称"
          value={categoryName}
          onChange={(e) => setCategoryName(e.target.value)}
          onPressEnter={handleSubmit}
          maxLength={20}
          style={{ marginTop: 8 }}
          autoFocus
        />
      </Modal>
    </div>
  )
}
