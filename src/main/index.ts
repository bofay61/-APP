import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import * as fs from 'fs'
import {
  initDatabase,
  getCategories,
  addCategory,
  updateCategory,
  deleteCategory,
  getExpenses,
  addExpense,
  updateExpense,
  deleteExpense,
  getExpenseStats,
  getHighScore,
  setHighScore
} from './database'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 750,
    minWidth: 900,
    minHeight: 600,
    title: '黑马记账',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function registerIpcHandlers(): void {
  // ---- 分类管理 ----
  ipcMain.handle('categories:getAll', async () => {
    return getCategories()
  })

  ipcMain.handle('categories:add', async (_event, name: string, parentId: number | null) => {
    return addCategory(name, parentId)
  })

  ipcMain.handle('categories:update', async (_event, id: number, name: string) => {
    return updateCategory(id, name)
  })

  ipcMain.handle('categories:delete', async (_event, id: number) => {
    return deleteCategory(id)
  })

  // ---- 花销记录 ----
  ipcMain.handle('expenses:add', async (_event, data: {
    amount: number
    categoryId: number
    date: string
    note?: string
  }) => {
    return addExpense(data)
  })

  ipcMain.handle('expenses:getAll', async (_event, filters?: {
    categoryId?: number
    startDate?: string
    endDate?: string
  }) => {
    return getExpenses(filters)
  })

  ipcMain.handle('expenses:update', async (_event, id: number, data: {
    amount?: number
    categoryId?: number
    date?: string
    note?: string
  }) => {
    return updateExpense(id, data)
  })

  ipcMain.handle('expenses:delete', async (_event, id: number) => {
    return deleteExpense(id)
  })

  // ---- 贪吃蛇最高分 ----
  ipcMain.handle('snake:getHighScore', async () => {
    return getHighScore()
  })

  ipcMain.handle('snake:setHighScore', async (_event, value: number) => {
    setHighScore(value)
  })

  // ---- 统计 ----
  ipcMain.handle('stats:getExpenseStats', async (_event, params: {
    year: number
    month?: number
  }) => {
    return getExpenseStats(params)
  })

  // ---- 导出CSV ----
  ipcMain.handle('data:exportCsv', async (_event, filters?: {
    startDate?: string
    endDate?: string
  }) => {
    const expenses = getExpenses(filters)

    const headers = ['日期', '分类', '金额(元)', '备注']
    const rows = expenses.map((e: any) => [
      e.date,
      `${e.parent_category_name} > ${e.category_name}`,
      e.amount.toFixed(2),
      e.note || ''
    ])

    const bom = '﻿'
    const csvContent = bom + [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n')

    const result = await dialog.showSaveDialog(mainWindow!, {
      title: '导出花销数据',
      defaultPath: `黑马记账_支出记录_${new Date().toISOString().slice(0, 10)}.csv`,
      filters: [{ name: 'CSV文件', extensions: ['csv'] }]
    })

    if (!result.canceled && result.filePath) {
      fs.writeFileSync(result.filePath, csvContent, 'utf-8')
      return { success: true, path: result.filePath }
    }
    return { success: false }
  })
}

app.whenReady().then(async () => {
  await initDatabase()
  registerIpcHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
