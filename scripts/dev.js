// 删除 ELECTRON_RUN_AS_NODE 环境变量，然后启动 electron-vite
// Electron 只要检测到这个变量存在（即使值为空）就会退化为纯 Node.js 模式
delete process.env.ELECTRON_RUN_AS_NODE

const { spawn } = require('child_process')
const path = require('path')

const electronVite = path.join(__dirname, '..', 'node_modules', '.bin', 'electron-vite')

const child = spawn(electronVite, ['dev'], {
  stdio: 'inherit',
  env: process.env,
  shell: true
})

child.on('exit', (code) => {
  process.exit(code)
})
