import { Routes, Route, useNavigate, useLocation } from 'react-router-dom'
import { Layout, Menu } from 'antd'
import {
  PlusCircleOutlined,
  UnorderedListOutlined,
  PieChartOutlined,
  AppstoreOutlined,
  PlayCircleOutlined
} from '@ant-design/icons'
import AddExpense from './pages/AddExpense'
import ExpenseList from './pages/ExpenseList'
import Statistics from './pages/Statistics'
import CategoryManage from './pages/CategoryManage'
import SnakeGame from './pages/SnakeGame'

const { Sider, Content } = Layout

const menuItems = [
  {
    key: '/add',
    icon: <PlusCircleOutlined />,
    label: '记一笔'
  },
  {
    key: '/list',
    icon: <UnorderedListOutlined />,
    label: '花销记录'
  },
  {
    key: '/stats',
    icon: <PieChartOutlined />,
    label: '统计'
  },
  {
    key: '/categories',
    icon: <AppstoreOutlined />,
    label: '分类管理'
  },
  {
    key: '/snake',
    icon: <PlayCircleOutlined />,
    label: '🎮 贪吃蛇'
  }
]

export default function AppRouter() {
  const navigate = useNavigate()
  const location = useLocation()

  // 默认跳转到记账页
  const currentPath = location.pathname === '/' ? '/add' : location.pathname

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider
        width={180}
        style={{
          background: '#fff',
          borderRight: '1px solid #f0f0f0'
        }}
      >
        <div style={{
          height: 56,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderBottom: '1px solid #f0f0f0'
        }}>
          <span style={{ fontSize: 18, fontWeight: 700, color: '#1677ff' }}>
            🐴 黑马记账
          </span>
        </div>
        <Menu
          mode="inline"
          selectedKeys={[currentPath]}
          items={menuItems}
          onClick={({ key }) => navigate(key)}
          style={{ borderRight: 0, marginTop: 8 }}
        />
      </Sider>
      <Layout>
        <Content style={{ padding: 24, background: '#f5f5f5', overflow: 'auto' }}>
          <Routes>
            <Route path="/add" element={<AddExpense />} />
            <Route path="/list" element={<ExpenseList />} />
            <Route path="/stats" element={<Statistics />} />
            <Route path="/categories" element={<CategoryManage />} />
            <Route path="/snake" element={<SnakeGame />} />
          </Routes>
        </Content>
      </Layout>
    </Layout>
  )
}
