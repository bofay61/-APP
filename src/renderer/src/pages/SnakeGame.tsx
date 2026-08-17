import { useCallback, useEffect, useRef, useState } from 'react'
import { Card, Space, Button, Radio, Tag, Typography } from 'antd'
import { CaretRightOutlined, PauseOutlined, ReloadOutlined } from '@ant-design/icons'

// 棋盘 20×20 格，每格 24 像素
const GRID_SIZE = 20
const CELL_SIZE = 24
const CANVAS_SIZE = GRID_SIZE * CELL_SIZE

// 三档速度：每步间隔毫秒数（数字越小越快）
const SPEED_MS: Record<string, number> = { slow: 300, medium: 200, fast: 120 }

type Point = { x: number; y: number }

// 游戏状态机：idle=未开始 / running=进行中 / paused=暂停 / gameOver=结束 / won=胜利
type GameStatus = 'idle' | 'running' | 'paused' | 'gameOver' | 'won'

export default function SnakeGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // ---- 界面状态 ----
  const [status, setStatus] = useState<GameStatus>('idle')
  const [score, setScore] = useState(0)
  const [highScore, setHighScore] = useState(0)
  const [speed, setSpeed] = useState('medium')

  // ---- 游戏内部状态（ref 为准，避免闭包旧值）----
  const snakeRef = useRef<Point[]>([])
  const foodRef = useRef<Point>({ x: 10, y: 10 })
  const dirRef = useRef<Point>({ x: 1, y: 0 })
  const nextDirRef = useRef<Point>({ x: 1, y: 0 })
  const timerRef = useRef<number | null>(null)
  // statusRef 是权威状态，所有游戏循环代码读它，永不过期
  const statusRef = useRef<GameStatus>('idle')
  // scoreRef 是权威分数，tick 内同步更新，避免渲染滞后漏记
  const scoreRef = useRef(0)
  const highScoreRef = useRef(0)
  const speedRef = useRef(speed)
  speedRef.current = speed

  const setStatusBoth = (s: GameStatus): void => {
    statusRef.current = s
    setStatus(s)
  }

  // ---- 绘制棋盘 ----
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // 深色背景
    ctx.fillStyle = '#1a1a2e'
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE)

    // 棋盘格线
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)'
    ctx.lineWidth = 1
    for (let i = 1; i < GRID_SIZE; i++) {
      ctx.beginPath()
      ctx.moveTo(i * CELL_SIZE, 0)
      ctx.lineTo(i * CELL_SIZE, CANVAS_SIZE)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(0, i * CELL_SIZE)
      ctx.lineTo(CANVAS_SIZE, i * CELL_SIZE)
      ctx.stroke()
    }

    // 食物（红色圆点）
    const f = foodRef.current
    ctx.fillStyle = '#ff4d4f'
    ctx.beginPath()
    ctx.arc(f.x * CELL_SIZE + CELL_SIZE / 2, f.y * CELL_SIZE + CELL_SIZE / 2, CELL_SIZE / 2 - 3, 0, Math.PI * 2)
    ctx.fill()

    // 蛇身
    snakeRef.current.forEach((seg, i) => {
      ctx.fillStyle = i === 0 ? '#52c41a' : '#73d13d'
      const pad = 1
      ctx.fillRect(seg.x * CELL_SIZE + pad, seg.y * CELL_SIZE + pad, CELL_SIZE - pad * 2, CELL_SIZE - pad * 2)
    })

    // 蛇头眼睛
    if (snakeRef.current.length > 0) {
      const head = snakeRef.current[0]
      const cx = head.x * CELL_SIZE + CELL_SIZE / 2
      const cy = head.y * CELL_SIZE + CELL_SIZE / 2
      const d = dirRef.current
      const ex = d.x * 5
      const ey = d.y * 5
      // 沿两个垂直方向各画一只眼（白色眼白 + 黑色瞳孔）
      for (const s of [1, -1]) {
        const px = -d.y * 5 * s
        const py = d.x * 5 * s
        ctx.fillStyle = '#fff'
        ctx.beginPath()
        ctx.arc(cx + ex + px, cy + ey + py, 2.5, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#000'
        ctx.beginPath()
        ctx.arc(cx + ex + px + d.x * 1.5, cy + ey + py + d.y * 1.5, 1.2, 0, Math.PI * 2)
        ctx.fill()
      }
    }
  }, [])

  // ---- 随机生成食物：先随机碰运气，失败后顺序扫描，保证不卡死 ----
  const spawnFood = useCallback((): void => {
    for (let i = 0; i < 300; i++) {
      const x = Math.floor(Math.random() * GRID_SIZE)
      const y = Math.floor(Math.random() * GRID_SIZE)
      if (!snakeRef.current.some((s) => s.x === x && s.y === y)) {
        foodRef.current = { x, y }
        return
      }
    }
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        if (!snakeRef.current.some((s) => s.x === x && s.y === y)) {
          foodRef.current = { x, y }
          return
        }
      }
    }
  }, [])

  // ---- 保存最高分（内存与数据库同步更新）----
  const persistHighScore = useCallback((finalScore: number): void => {
    const next = Math.max(highScoreRef.current, finalScore)
    highScoreRef.current = next
    setHighScore(next)
    window.electronAPI.setHighScore(next)
  }, [])

  // ---- 游戏结束 / 胜利 ----
  const endGame = useCallback(() => {
    setStatusBoth('gameOver')
    persistHighScore(scoreRef.current)
  }, [persistHighScore])

  const winGame = useCallback(() => {
    setStatusBoth('won')
    draw()
    persistHighScore(scoreRef.current)
  }, [draw, persistHighScore])

  // ---- 计时器管理 ----
  const clearTick = useCallback(() => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  // ---- 游戏主循环：走一步 ----
  const tick = useCallback(() => {
    // 状态守卫：游戏已结束/暂停时不再推进，防止死蛇复活
    if (statusRef.current !== 'running') return

    // 采用缓存的转向
    dirRef.current = nextDirRef.current

    const head = snakeRef.current[0]
    const newHead = { x: head.x + dirRef.current.x, y: head.y + dirRef.current.y }

    // 撞墙
    if (newHead.x < 0 || newHead.x >= GRID_SIZE || newHead.y < 0 || newHead.y >= GRID_SIZE) {
      endGame()
      return
    }

    // 是否吃到食物
    const willEat = newHead.x === foodRef.current.x && newHead.y === foodRef.current.y

    // 撞自己（不吃食物时尾巴会移走，不算撞）
    const bodyToCheck = willEat ? snakeRef.current : snakeRef.current.slice(0, -1)
    if (bodyToCheck.some((s) => s.x === newHead.x && s.y === newHead.y)) {
      endGame()
      return
    }

    // 前进
    const newSnake = [newHead, ...snakeRef.current]
    if (willEat) {
      // 先更新蛇身再生成食物，避免食物落在蛇头刚进入的格子上被盖住
      snakeRef.current = newSnake
      scoreRef.current += 10
      setScore(scoreRef.current)
      if (newSnake.length >= GRID_SIZE * GRID_SIZE) {
        winGame()
        return
      }
      spawnFood()
    } else {
      newSnake.pop()
      snakeRef.current = newSnake
    }
    draw()

    // 安排下一步
    timerRef.current = window.setTimeout(tick, SPEED_MS[speedRef.current])
  }, [draw, endGame, winGame, spawnFood])

  const scheduleTick = useCallback(() => {
    clearTick()
    timerRef.current = window.setTimeout(tick, SPEED_MS[speedRef.current])
  }, [clearTick, tick])

  // ---- 开始新游戏 ----
  const startGame = useCallback(() => {
    clearTick()
    const mid = Math.floor(GRID_SIZE / 2)
    snakeRef.current = [
      { x: mid, y: mid },
      { x: mid - 1, y: mid },
      { x: mid - 2, y: mid }
    ]
    dirRef.current = { x: 1, y: 0 }
    nextDirRef.current = { x: 1, y: 0 }
    spawnFood()
    scoreRef.current = 0
    setScore(0)
    setStatusBoth('running')
    draw()
    scheduleTick()
  }, [clearTick, draw, spawnFood, scheduleTick])

  // ---- 暂停 / 继续（读权威状态，连点不会产生双计时器）----
  const togglePause = useCallback(() => {
    const st = statusRef.current
    if (st === 'running') {
      clearTick()
      setStatusBoth('paused')
    } else if (st === 'paused') {
      setStatusBoth('running')
      scheduleTick()
    }
  }, [clearTick, scheduleTick])

  // ---- 键盘控制 ----
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      // 游戏未开始或已结束时，不接管按键，让页面控件正常使用键盘
      const st = statusRef.current
      if (st !== 'running' && st !== 'paused') return

      switch (e.key) {
        case 'ArrowUp':
        case 'w':
        case 'W':
          e.preventDefault()
          // 校验基于已排队的转向，防止一个间隔内两次按键造成 180° 掉头
          if (nextDirRef.current.y === 0) nextDirRef.current = { x: 0, y: -1 }
          break
        case 'ArrowDown':
        case 's':
        case 'S':
          e.preventDefault()
          if (nextDirRef.current.y === 0) nextDirRef.current = { x: 0, y: 1 }
          break
        case 'ArrowLeft':
        case 'a':
        case 'A':
          e.preventDefault()
          if (nextDirRef.current.x === 0) nextDirRef.current = { x: -1, y: 0 }
          break
        case 'ArrowRight':
        case 'd':
        case 'D':
          e.preventDefault()
          if (nextDirRef.current.x === 0) nextDirRef.current = { x: 1, y: 0 }
          break
        case ' ':
          e.preventDefault()
          // 忽略长按连发，只响应真正的按下
          if (!e.repeat) togglePause()
          break
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [togglePause])

  // ---- 首次挂载：画棋盘 + 加载最高分 ----
  useEffect(() => {
    draw()
    window.electronAPI.getHighScore().then((dbHigh) => {
      let final = dbHigh
      // 一次性迁移旧版本存在浏览器里的最高分，然后清掉
      try {
        const legacy = Number(localStorage.getItem('snake-high-score'))
        if (Number.isFinite(legacy) && legacy > 0 && legacy > dbHigh) {
          final = Math.floor(legacy)
          window.electronAPI.setHighScore(final)
        }
        localStorage.removeItem('snake-high-score')
      } catch {
        // 浏览器存储不可用时忽略
      }
      highScoreRef.current = final
      setHighScore(final)
    })
  }, [draw])

  // ---- 卸载时清理计时器 ----
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current)
    }
  }, [])

  // 按钮点击后移除焦点，避免空格键再次激活聚焦的按钮
  const clickAndBlur = (e: React.MouseEvent<HTMLButtonElement>, handler: () => void) => {
    handler()
    e.currentTarget.blur()
  }

  return (
    <div style={{ maxWidth: 560, margin: '0 auto' }}>
      <Card title="🎮 贪吃蛇">
        {/* 顶部工具栏 */}
        <Space wrap style={{ marginBottom: 16 }}>
          <Tag color="green" style={{ fontSize: 14, padding: '2px 10px' }}>
            得分：{score}
          </Tag>
          <Tag color="gold" style={{ fontSize: 14, padding: '2px 10px' }}>
            🏆 最高分：{highScore}
          </Tag>
          <Radio.Group
            value={speed}
            onChange={(e) => setSpeed(e.target.value)}
            size="small"
            optionType="button"
            buttonStyle="solid"
          >
            <Radio.Button value="slow">慢</Radio.Button>
            <Radio.Button value="medium">中</Radio.Button>
            <Radio.Button value="fast">快</Radio.Button>
          </Radio.Group>
          <Button
            size="small"
            icon={status === 'paused' ? <CaretRightOutlined /> : <PauseOutlined />}
            onClick={(e) => clickAndBlur(e, togglePause)}
            disabled={status !== 'running' && status !== 'paused'}
          >
            {status === 'paused' ? '继续' : '暂停'}
          </Button>
          <Button
            size="small"
            icon={<ReloadOutlined />}
            onClick={(e) => clickAndBlur(e, startGame)}
          >
            重新开始
          </Button>
        </Space>

        {/* 游戏画布 */}
        <div style={{ position: 'relative', width: CANVAS_SIZE, height: CANVAS_SIZE, margin: '0 auto' }}>
          <canvas
            ref={canvasRef}
            width={CANVAS_SIZE}
            height={CANVAS_SIZE}
            style={{ borderRadius: 8, display: 'block' }}
          />

          {/* 遮罩层：未开始 / 结束 / 胜利 / 暂停（四种状态互斥） */}
          {status !== 'running' && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(0, 0, 0, 0.65)',
                borderRadius: 8
              }}
            >
              {status === 'idle' && (
                <>
                  <Typography.Text style={{ color: '#fff', fontSize: 18, marginBottom: 16 }}>
                    🐍 准备好了吗？
                  </Typography.Text>
                  <Button type="primary" onClick={(e) => clickAndBlur(e, startGame)}>
                    开始游戏
                  </Button>
                </>
              )}
              {status === 'gameOver' && (
                <>
                  <Typography.Text style={{ color: '#ff4d4f', fontSize: 24, fontWeight: 700, marginBottom: 8 }}>
                    游戏结束
                  </Typography.Text>
                  <Typography.Text style={{ color: '#fff', fontSize: 14, marginBottom: 16 }}>
                    本局得分：{score}　|　🏆 最高分：{highScore}
                  </Typography.Text>
                  <Button type="primary" onClick={(e) => clickAndBlur(e, startGame)}>
                    再来一局
                  </Button>
                </>
              )}
              {status === 'won' && (
                <>
                  <Typography.Text style={{ color: '#fadb14', fontSize: 24, fontWeight: 700, marginBottom: 8 }}>
                    🎉 恭喜通关！
                  </Typography.Text>
                  <Typography.Text style={{ color: '#fff', fontSize: 14, marginBottom: 16 }}>
                    你填满了整个棋盘！本局得分：{score}　|　🏆 最高分：{highScore}
                  </Typography.Text>
                  <Button type="primary" onClick={(e) => clickAndBlur(e, startGame)}>
                    再来一局
                  </Button>
                </>
              )}
              {status === 'paused' && (
                <Typography.Text style={{ color: '#fff', fontSize: 20 }}>
                  ⏸️ 已暂停（按空格继续）
                </Typography.Text>
              )}
            </div>
          )}
        </div>

        {/* 操作说明 */}
        <div style={{ marginTop: 16, color: '#999', fontSize: 12, textAlign: 'center' }}>
          方向键 / WASD 控制移动 ｜ 空格键 暂停/继续 ｜ 撞墙或撞到自己则游戏结束
        </div>
      </Card>
    </div>
  )
}
