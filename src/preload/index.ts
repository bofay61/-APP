import { contextBridge, ipcRenderer } from 'electron'

// 通过 contextBridge 安全地暴露 API 给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  // ---- 分类管理 ----
  getCategories: (): Promise<any[]> =>
    ipcRenderer.invoke('categories:getAll'),

  addCategory: (name: string, parentId: number | null): Promise<any> =>
    ipcRenderer.invoke('categories:add', name, parentId),

  updateCategory: (id: number, name: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('categories:update', id, name),

  deleteCategory: (id: number): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('categories:delete', id),

  // ---- 花销记录 ----
  addExpense: (data: { amount: number; categoryId: number; date: string; note?: string }): Promise<any> =>
    ipcRenderer.invoke('expenses:add', data),

  getExpenses: (filters?: { categoryId?: number; startDate?: string; endDate?: string }): Promise<any[]> =>
    ipcRenderer.invoke('expenses:getAll', filters),

  updateExpense: (id: number, data: { amount?: number; categoryId?: number; date?: string; note?: string }): Promise<void> =>
    ipcRenderer.invoke('expenses:update', id, data),

  deleteExpense: (id: number): Promise<void> =>
    ipcRenderer.invoke('expenses:delete', id),

  // ---- 统计 ----
  getExpenseStats: (params: { year: number; month?: number }): Promise<any[]> =>
    ipcRenderer.invoke('stats:getExpenseStats', params),

  // ---- 导出 ----
  exportCsv: (filters?: { startDate?: string; endDate?: string }): Promise<{ success: boolean; path?: string }> =>
    ipcRenderer.invoke('data:exportCsv', filters)
})
