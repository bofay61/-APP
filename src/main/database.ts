import { app } from 'electron'
import { join } from 'path'
import * as fs from 'fs'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const initSqlJs = require('sql.js')

let db: any = null
let SQL: any = null

// 内置的二级分类数据
const DEFAULT_CATEGORIES: { name: string; children: string[] }[] = [
  { name: '餐饮饮食', children: ['日常三餐', '外卖', '聚餐', '零食饮料', '咖啡奶茶'] },
  { name: '交通出行', children: ['公交地铁', '打车', '加油充电', '停车费', '火车机票'] },
  { name: '购物消费', children: ['服饰鞋包', '数码产品', '日用品', '美妆护肤', '其他购物'] },
  { name: '住房居家', children: ['房租房贷', '水电燃气', '物业费', '维修装修', '家居用品'] },
  { name: '娱乐休闲', children: ['电影演出', '游戏', '运动健身', '旅游度假', '其他娱乐'] },
  { name: '医疗健康', children: ['看病买药', '体检', '健身卡', '保健品'] },
  { name: '教育学习', children: ['课程培训', '书籍', '文具', '考试报名'] },
  { name: '人情往来', children: ['红包礼品', '婚礼份子', '孝敬父母', '慈善捐款'] },
  { name: '其他支出', children: ['快递物流', '金融服务费', '宠物用品', '其他'] }
]

function getDbPath(): string {
  return join(app.getPath('userData'), 'heima-accounting.db')
}

function saveToDisk(): void {
  const data = db.export()
  const buffer = Buffer.from(data)
  fs.writeFileSync(getDbPath(), buffer)
}

// 辅助函数：执行 SQL 查询并返回结果数组
function queryAll(sql: string, params: any[] = []): any[] {
  const stmt = db.prepare(sql)
  if (params.length > 0) {
    stmt.bind(params)
  }
  const results: any[] = []
  while (stmt.step()) {
    results.push(stmt.getAsObject())
  }
  stmt.free()
  return results
}

// 辅助函数：执行单条查询
function queryOne(sql: string, params: any[] = []): any | null {
  const stmt = db.prepare(sql)
  if (params.length > 0) {
    stmt.bind(params)
  }
  let result: any = null
  if (stmt.step()) {
    result = stmt.getAsObject()
  }
  stmt.free()
  return result
}

// 辅助函数：执行写操作
function run(sql: string, params: any[] = []): { lastInsertRowid: number; changes: number } {
  db.run(sql, params)
  saveToDisk()
  // sql.js 中获取 lastInsertRowid 需要用 prepare
  const result = queryOne('SELECT last_insert_rowid() as id')
  return {
    lastInsertRowid: result ? result.id : 0,
    changes: db.getRowsModified()
  }
}

export async function initDatabase(): Promise<void> {
  SQL = await initSqlJs()
  const dbPath = getDbPath()

  // 加载已有数据库或创建新的
  if (fs.existsSync(dbPath)) {
    const buffer = fs.readFileSync(dbPath)
    db = new SQL.Database(buffer)
  } else {
    db = new SQL.Database()
  }

  // 创建分类表
  db.run(`
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      parent_id INTEGER,
      sort_order INTEGER DEFAULT 0,
      is_preset INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE CASCADE
    )
  `)

  // 迁移旧数据库：如果没有 is_preset 列，自动补上
  const tableInfo = queryAll("PRAGMA table_info(categories)")
  const hasIsPreset = tableInfo.some((col: any) => col.name === 'is_preset')
  if (!hasIsPreset) {
    db.run('ALTER TABLE categories ADD COLUMN is_preset INTEGER DEFAULT 0')
  }

  // 创建花销表
  db.run(`
    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      amount REAL NOT NULL,
      category_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      note TEXT DEFAULT '',
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (category_id) REFERENCES categories(id)
    )
  `)

  // 创建键值表（存贪吃蛇最高分等零散数据）
  db.run(`
    CREATE TABLE IF NOT EXISTS key_value (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `)

  saveToDisk()

  // 初始化默认分类
  const count = queryOne('SELECT COUNT(*) as cnt FROM categories')
  if (count.cnt === 0) {
    DEFAULT_CATEGORIES.forEach((parent, pIdx) => {
      const result = run('INSERT INTO categories (name, parent_id, sort_order, is_preset) VALUES (?, ?, ?, 1)', [parent.name, null, pIdx])
      const parentId = result.lastInsertRowid
      parent.children.forEach((child, cIdx) => {
        run('INSERT INTO categories (name, parent_id, sort_order, is_preset) VALUES (?, ?, ?, 1)', [child, parentId, cIdx])
      })
    })
  }

  // 校正预置标记：只有内置分类名单中的才锁定，用户自建分类保持可编辑
  // （旧版本误锁的用户分类会在下次启动时自动解锁）
  db.run('UPDATE categories SET is_preset = 0')
  DEFAULT_CATEGORIES.forEach((parent) => {
    db.run('UPDATE categories SET is_preset = 1 WHERE name = ? AND parent_id IS NULL', [parent.name])
    parent.children.forEach((child) => {
      db.run(
        'UPDATE categories SET is_preset = 1 WHERE name = ? AND parent_id = (SELECT id FROM categories WHERE name = ? AND parent_id IS NULL)',
        [child, parent.name]
      )
    })
  })
  saveToDisk()
}

// ---- 分类操作 ----

export function getCategories(): any[] {
  const parents = queryAll(
    'SELECT id, name, parent_id, sort_order, is_preset FROM categories WHERE parent_id IS NULL ORDER BY sort_order'
  )
  const children = queryAll(
    'SELECT id, name, parent_id, sort_order, is_preset FROM categories WHERE parent_id IS NOT NULL ORDER BY sort_order'
  )
  return parents.map((p: any) => ({
    ...p,
    children: children.filter((c: any) => c.parent_id === p.id)
  }))
}

export function addCategory(name: string, parentId: number | null): any {
  // 新分类排在同类列表末尾
  const maxSort = queryOne('SELECT MAX(sort_order) as max_sort FROM categories WHERE parent_id IS ?', [parentId])
  const result = run(
    'INSERT INTO categories (name, parent_id, sort_order) VALUES (?, ?, ?)',
    [name, parentId, ((maxSort && maxSort.max_sort) ?? -1) + 1]
  )
  return { id: result.lastInsertRowid, name, parent_id: parentId }
}

export function updateCategory(id: number, name: string): { success: boolean; error?: string } {
  const cat = queryOne('SELECT is_preset FROM categories WHERE id = ?', [id])
  if (!cat) {
    return { success: false, error: '分类不存在' }
  }
  if (cat.is_preset === 1) {
    return { success: false, error: '系统预置分类不可修改' }
  }
  run('UPDATE categories SET name = ? WHERE id = ?', [name, id])
  return { success: true }
}

export function deleteCategory(id: number): { success: boolean; error?: string } {
  const cat = queryOne('SELECT is_preset FROM categories WHERE id = ?', [id])
  if (!cat) {
    return { success: false, error: '分类不存在' }
  }
  if (cat.is_preset === 1) {
    return { success: false, error: '系统预置分类不可删除' }
  }
  const expCount = queryOne('SELECT COUNT(*) as cnt FROM expenses WHERE category_id = ?', [id])
  if (expCount.cnt > 0) {
    return { success: false, error: '该分类下有花销记录，无法删除' }
  }
  const childCount = queryOne('SELECT COUNT(*) as cnt FROM categories WHERE parent_id = ?', [id])
  if (childCount.cnt > 0) {
    return { success: false, error: '请先删除该大类下的所有小类' }
  }
  run('DELETE FROM categories WHERE id = ?', [id])
  return { success: true }
}

// ---- 贪吃蛇最高分 ----

export function getHighScore(): number {
  const row = queryOne('SELECT value FROM key_value WHERE key = ?', ['snake_high_score'])
  if (!row) return 0
  const n = Number(row.value)
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0
}

export function setHighScore(value: number): void {
  run(
    'INSERT OR REPLACE INTO key_value (key, value) VALUES (?, ?)',
    ['snake_high_score', String(Math.floor(value))]
  )
}

// ---- 花销操作 ----

export function addExpense(data: {
  amount: number
  categoryId: number
  date: string
  note?: string
}): any {
  const result = run(
    'INSERT INTO expenses (amount, category_id, date, note) VALUES (?, ?, ?, ?)',
    [data.amount, data.categoryId, data.date, data.note || '']
  )
  return { id: result.lastInsertRowid, ...data }
}

export function getExpenses(filters?: {
  categoryId?: number
  startDate?: string
  endDate?: string
}): any[] {
  let sql = `
    SELECT e.*, c.name as category_name, pc.name as parent_category_name, pc.id as parent_category_id
    FROM expenses e
    JOIN categories c ON e.category_id = c.id
    LEFT JOIN categories pc ON c.parent_id = pc.id
    WHERE 1=1
  `
  const params: any[] = []

  if (filters?.categoryId) {
    const isParent = queryOne('SELECT parent_id FROM categories WHERE id = ?', [filters.categoryId])
    if (isParent && isParent.parent_id === null) {
      sql += ' AND c.parent_id = ?'
      params.push(filters.categoryId)
    } else {
      sql += ' AND e.category_id = ?'
      params.push(filters.categoryId)
    }
  }
  if (filters?.startDate) {
    sql += ' AND e.date >= ?'
    params.push(filters.startDate)
  }
  if (filters?.endDate) {
    sql += ' AND e.date <= ?'
    params.push(filters.endDate)
  }

  sql += ' ORDER BY e.date DESC, e.id DESC'
  return queryAll(sql, params)
}

export function updateExpense(id: number, data: {
  amount?: number
  categoryId?: number
  date?: string
  note?: string
}): void {
  const fields: string[] = []
  const params: any[] = []

  if (data.amount !== undefined) { fields.push('amount = ?'); params.push(data.amount) }
  if (data.categoryId !== undefined) { fields.push('category_id = ?'); params.push(data.categoryId) }
  if (data.date !== undefined) { fields.push('date = ?'); params.push(data.date) }
  if (data.note !== undefined) { fields.push('note = ?'); params.push(data.note) }

  if (fields.length > 0) {
    params.push(id)
    run(`UPDATE expenses SET ${fields.join(', ')} WHERE id = ?`, params)
  }
}

export function deleteExpense(id: number): void {
  run('DELETE FROM expenses WHERE id = ?', [id])
}

export function getExpenseStats(params: { year: number; month?: number }): any[] {
  const { year, month } = params
  let sql: string
  let sqlParams: any[]

  if (month !== undefined) {
    const monthStr = String(month).padStart(2, '0')
    const lastDay = new Date(year, month, 0).getDate()
    sqlParams = [
      `${year}-${monthStr}-01`,
      `${year}-${monthStr}-${String(lastDay).padStart(2, '0')}`
    ]
    sql = `
      SELECT
        pc.id as parent_category_id,
        pc.name as category_name,
        e.date,
        SUM(e.amount) as total_amount
      FROM expenses e
      JOIN categories c ON e.category_id = c.id
      JOIN categories pc ON c.parent_id = pc.id
      WHERE e.date >= ? AND e.date <= ?
      GROUP BY pc.id, e.date
      ORDER BY e.date, total_amount DESC
    `
  } else {
    sqlParams = [`${year}-01-01`, `${year}-12-31`]
    sql = `
      SELECT
        pc.id as parent_category_id,
        pc.name as category_name,
        substr(e.date, 1, 7) as month,
        SUM(e.amount) as total_amount
      FROM expenses e
      JOIN categories c ON e.category_id = c.id
      JOIN categories pc ON c.parent_id = pc.id
      WHERE e.date >= ? AND e.date <= ?
      GROUP BY pc.id, substr(e.date, 1, 7)
      ORDER BY month, total_amount DESC
    `
  }

  return queryAll(sql, sqlParams)
}
