/// <reference types="vite/client" />

interface Category {
  id: number
  name: string
  parent_id: number | null
  sort_order: number
  children?: Category[]
}

interface Expense {
  id: number
  amount: number
  category_id: number
  date: string
  note: string
  created_at: string
  category_name: string
  parent_category_name: string
  parent_category_id: number
}

interface ExpenseStats {
  parent_category_id: number
  category_name: string
  month?: string
  date?: string
  total_amount: number
}

interface ElectronAPI {
  getCategories: () => Promise<Category[]>
  addCategory: (name: string, parentId: number | null) => Promise<any>
  updateCategory: (id: number, name: string) => Promise<void>
  deleteCategory: (id: number) => Promise<{ success: boolean; error?: string }>
  addExpense: (data: { amount: number; categoryId: number; date: string; note?: string }) => Promise<any>
  getExpenses: (filters?: { categoryId?: number; startDate?: string; endDate?: string }) => Promise<Expense[]>
  updateExpense: (id: number, data: { amount?: number; categoryId?: number; date?: string; note?: string }) => Promise<void>
  deleteExpense: (id: number) => Promise<void>
  getExpenseStats: (params: { year: number; month?: number }) => Promise<ExpenseStats[]>
  exportCsv: (filters?: { startDate?: string; endDate?: string }) => Promise<{ success: boolean; path?: string }>
}

interface Window {
  electronAPI: ElectronAPI
}
