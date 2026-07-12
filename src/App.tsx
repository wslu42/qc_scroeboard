import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import './App.css'
import {
  answerQuestion, closeQuestion, getStudentId, joinGame, nextQuestion,
  openQuestion, previousQuestion, resetDemo, setStudentId, useGameState,
} from './gameStore'

type Route = '/join' | '/play' | '/host' | '/scoreboard'
const routes: Route[] = ['/join', '/play', '/host', '/scoreboard']
const routeLabels: Record<Route, string> = { '/join': '加入', '/play': '作答', '/host': '講師台', '/scoreboard': '排行榜' }

function getRoute(): Route {
  const value = window.location.hash.slice(1).split('?')[0]
  return routes.includes(value as Route) ? value as Route : '/join'
}

function useRoute() {
  const [route, setRoute] = useState(getRoute)
  useEffect(() => {
    if (!window.location.hash) window.location.replace('#/join')
    const onHashChange = () => setRoute(getRoute())
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])
  return route
}

function Header({ route }: { route: Route }) {
  return <header className="site-header">
    <a className="brand" href="#/join" aria-label="QuickClass 首頁"><span className="brand-mark">Q</span><span>QuickClass</span></a>
    <nav aria-label="主要導覽">{routes.map(item => <a className={route === item ? 'active' : ''} href={`#${item}`} key={item}>{routeLabels[item]}</a>)}</nav>
  </header>
}

function StatusPill({ open }: { open: boolean }) {
  return <span className={`status-pill ${open ? 'open' : 'closed'}`}><span className="status-dot" />{open ? '開放作答中' : '目前已關閉'}</span>
}

function JoinPage() {
  const state = useGameState()
  const [nickname, setNickname] = useState('')
  const [team, setTeam] = useState('藍隊')
  const [error, setError] = useState('')
  const leader = [...state.players].sort((a, b) => b.score - a.score)[0]

  function submit(event: FormEvent) {
    event.preventDefault()
    const cleanName = nickname.trim(), cleanTeam = team.trim()
    if (!cleanName || !cleanTeam) { setError('請填寫暱稱與隊伍。'); return }
    const id = crypto.randomUUID()
    joinGame({ id, nickname: cleanName.slice(0, 20), team: cleanTeam.slice(0, 20) })
    setStudentId(id)
    window.location.hash = '/play'
  }

  return <main className="join-layout page-shell">
    <section className="join-intro">
      <span className="eyebrow">LIVE CLASSROOM QUIZ</span>
      <h1>準備好，<br />一起搶答！</h1>
      <p>加入課堂、選擇隊伍，題目一開放就立即作答。</p>
      <div className="mini-scoreboard"><span>目前領先</span><strong>{leader?.team ?? '等待加入'}</strong><span>{state.players.length} 位玩家在線</span></div>
    </section>
    <section className="panel join-card">
      <div className="step-badge">01</div><h2>加入這場課堂</h2><p className="muted">輸入一個大家認得你的名字。</p>
      <form onSubmit={submit}>
        <label htmlFor="nickname">你的暱稱</label>
        <input autoComplete="nickname" autoFocus id="nickname" maxLength={20} onChange={e => setNickname(e.target.value)} placeholder="例如：小明" value={nickname} />
        <label htmlFor="team">選擇隊伍</label>
        <select id="team" onChange={e => setTeam(e.target.value)} value={team}><option>藍隊</option><option>橘隊</option><option>綠隊</option><option>紫隊</option></select>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="primary-button full" type="submit">加入並開始 <span>→</span></button>
      </form>
      <p className="local-note">此版本僅在同一瀏覽器中同步，不會上傳資料。</p>
    </section>
  </main>
}

function PlayPage() {
  const state = useGameState()
  const [studentId] = useState(getStudentId)
  const question = state.questions[state.questionIndex]
  const player = state.players.find(item => item.id === studentId)
  const answer = player?.answers[question.id]
  const hasAnswered = answer !== undefined
  const isCorrect = answer === question.correctIndex

  if (!player) return <main className="center-page page-shell"><section className="panel empty-state"><span className="big-icon">👋</span><h1>先加入課堂吧</h1><p>每個作答分頁都需要自己的暱稱與隊伍。</p><a className="primary-button" href="#/join">前往加入</a></section></main>

  return <main className="play-page page-shell">
    <div className="page-topline"><div><span className="eyebrow">{player.team}</span><h1>嗨，{player.nickname}</h1></div><div className="score-chip"><span>目前分數</span><strong>{player.score.toLocaleString()}</strong></div></div>
    <section className="panel question-card">
      <div className="question-meta"><span>第 {state.questionIndex + 1} / {state.questions.length} 題</span><StatusPill open={state.isQuestionOpen} /></div>
      <h2>{question.prompt}</h2>
      <div className="answer-grid">{question.options.map((option, index) => {
        const selected = answer === index
        const revealCorrect = !state.isQuestionOpen && hasAnswered && index === question.correctIndex
        const revealWrong = !state.isQuestionOpen && selected && !isCorrect
        return <button className={`answer-button ${selected ? 'selected' : ''} ${revealCorrect ? 'correct' : ''} ${revealWrong ? 'wrong' : ''}`} disabled={!state.isQuestionOpen || hasAnswered} key={option} onClick={() => answerQuestion(player.id, question.id, index)} type="button"><span className="answer-letter">{String.fromCharCode(65 + index)}</span><span>{option}</span></button>
      })}</div>
      <div className="answer-feedback" aria-live="polite">
        {!state.isQuestionOpen && !hasAnswered && '等待講師開放題目…'}
        {state.isQuestionOpen && !hasAnswered && '選擇一個答案，送出後無法更改。'}
        {state.isQuestionOpen && hasAnswered && '已送出！等待講師公布答案。'}
        {!state.isQuestionOpen && hasAnswered && (isCorrect ? '答對了！獲得 1,000 分 🎉' : `正確答案是 ${question.options[question.correctIndex]}`)}
      </div>
    </section>
  </main>
}

function HostPage() {
  const state = useGameState(), question = state.questions[state.questionIndex]
  const answered = state.players.filter(player => player.answers[question.id] !== undefined)
  const correct = answered.filter(player => player.answers[question.id] === question.correctIndex)
  return <main className="host-page page-shell">
    <div className="page-topline"><div><span className="eyebrow">INSTRUCTOR CONTROL</span><h1>講師控制台</h1></div><StatusPill open={state.isQuestionOpen} /></div>
    <div className="host-grid">
      <section className="panel host-question">
        <div className="question-meta"><span>題目 {state.questionIndex + 1} / {state.questions.length}</span><span>{answered.length} 人已作答</span></div><h2>{question.prompt}</h2>
        <ol className="host-options">{question.options.map((option, index) => { const count = answered.filter(player => player.answers[question.id] === index).length; return <li className={!state.isQuestionOpen && index === question.correctIndex ? 'correct' : ''} key={option}><span>{String.fromCharCode(65 + index)}. {option}</span><strong>{count}</strong></li> })}</ol>
        <div className="host-actions"><button className="secondary-button" disabled={state.questionIndex === 0} onClick={previousQuestion}>← 上一題</button>{state.isQuestionOpen ? <button className="danger-button" onClick={closeQuestion}>關閉並公布答案</button> : <button className="primary-button" onClick={openQuestion}>開放作答</button>}<button className="secondary-button" disabled={state.questionIndex === state.questions.length - 1} onClick={nextQuestion}>下一題 →</button></div>
      </section>
      <aside className="host-sidebar">
        <section className="panel metric-card"><span>線上玩家</span><strong>{state.players.length}</strong><small>同一瀏覽器的分頁</small></section>
        <section className="panel metric-card"><span>本題正確率</span><strong>{answered.length ? Math.round(correct.length / answered.length * 100) : 0}%</strong><small>{correct.length} / {answered.length} 人答對</small></section>
        <a className="panel projector-link" href="#/scoreboard"><span>開啟投影排行榜</span><strong>↗</strong></a>
        <button className="text-button" onClick={() => window.confirm('確定要重設題目、玩家與分數嗎？') && resetDemo()}>重設示範資料</button>
      </aside>
    </div>
  </main>
}

function ScoreboardPage() {
  const state = useGameState()
  const leaders = useMemo(() => [...state.players].sort((a, b) => b.score - a.score || a.nickname.localeCompare(b.nickname)), [state.players])
  const topScore = Math.max(leaders[0]?.score ?? 0, 1)
  const teamTotals = useMemo(() => { const totals = new Map<string, number>(); state.players.forEach(player => totals.set(player.team, (totals.get(player.team) ?? 0) + player.score)); return [...totals.entries()].sort((a, b) => b[1] - a[1]) }, [state.players])
  return <main className="scoreboard-page page-shell">
    <div className="scoreboard-heading"><div><span className="eyebrow">LIVE SCOREBOARD</span><h1>課堂排行榜</h1></div><div className="live-indicator"><span /> 即時更新</div></div>
    <div className="scoreboard-grid">
      <section className="panel leaderboard">{leaders.map((player, index) => <div className={`leader-row rank-${index + 1}`} key={player.id}><span className="rank">{index + 1}</span><span className="avatar">{player.nickname.slice(0, 1).toUpperCase()}</span><div className="leader-info"><strong>{player.nickname}</strong><small>{player.team}</small><div className="score-bar"><span style={{ width: `${Math.max(player.score / topScore * 100, 4)}%` }} /></div></div><strong className="leader-score">{player.score.toLocaleString()}</strong></div>)}</section>
      <aside className="panel team-board"><span className="eyebrow">TEAM TOTALS</span><h2>隊伍積分</h2>{teamTotals.map(([team, score], index) => <div className="team-row" key={team}><span className={`team-color color-${index}`} /><strong>{team}</strong><span>{score.toLocaleString()}</span></div>)}<div className="current-question"><span>目前題目</span><strong>{state.questionIndex + 1} / {state.questions.length}</strong><StatusPill open={state.isQuestionOpen} /></div></aside>
    </div>
  </main>
}

function App() {
  const route = useRoute()
  return <div className="app"><Header route={route} />{route === '/join' && <JoinPage />}{route === '/play' && <PlayPage />}{route === '/host' && <HostPage />}{route === '/scoreboard' && <ScoreboardPage />}<footer>QuickClass · Local demo</footer></div>
}

export default App
