import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import './App.css'
import {
  changeQuestion,
  closeQuestionAndScore,
  createClassroom,
  ensureAnonymousUser,
  getCodeFromHash,
  getStoredSessionCode,
  joinClassroom,
  normalizeCode,
  setQuestionOpen,
  signInAsHost,
  signOutHost,
  storeSessionCode,
  submitAnswer,
  useClassroom,
  useFirebaseUser,
  useQuestionAnswers,
  useStudentAnswer,
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

function LoadingPanel({ text = '連線到課堂中…' }: { text?: string }) {
  return <section className="panel empty-state"><span className="spinner" /><h2>{text}</h2></section>
}

function JoinPage() {
  const { user } = useFirebaseUser()
  const [code, setCode] = useState(() => getCodeFromHash() || getStoredSessionCode())
  const [nickname, setNickname] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const classroom = useClassroom(code, Boolean(user && code.length === 6))
  const leader = [...classroom.players].sort((a, b) => b.score - a.score)[0]

  async function submit(event: FormEvent) {
    event.preventDefault()
    const cleanName = nickname.trim()
    if (normalizeCode(code).length !== 6) { setError('請輸入 6 碼課堂代碼。'); return }
    if (!cleanName) { setError('請填寫暱稱。'); return }
    try {
      setBusy(true); setError('')
      await joinClassroom(code, cleanName.slice(0, 20))
      window.location.hash = '/play'
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '加入失敗，請稍後再試。')
    } finally { setBusy(false) }
  }

  return <main className="join-layout page-shell">
    <section className="join-intro">
      <span className="eyebrow">LIVE CLASSROOM QUIZ</span><h1>準備好，<br />一起搶答！</h1>
      <p>輸入課堂代碼與暱稱，題目一開放就立即作答。</p>
      {classroom.session && <div className="mini-scoreboard"><span>目前領先</span><strong>{leader?.nickname ?? '等待加入'}</strong><span>{classroom.players.length} 位玩家在線</span></div>}
    </section>
    <section className="panel join-card">
      <div className="step-badge">01</div><h2>加入這場課堂</h2><p className="muted">向講師取得 6 碼課堂代碼。</p>
      <form onSubmit={submit}>
        <label htmlFor="session-code">課堂代碼</label>
        <input className="code-input" id="session-code" inputMode="text" maxLength={6} onChange={event => setCode(normalizeCode(event.target.value))} placeholder="例如：ABC234" value={code} />
        <label htmlFor="nickname">你的暱稱</label>
        <input autoComplete="nickname" id="nickname" maxLength={20} onChange={event => setNickname(event.target.value)} placeholder="例如：小明" value={nickname} />
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="primary-button full" disabled={busy} type="submit">{busy ? '加入中…' : '加入並開始 →'}</button>
      </form>
      <p className="local-note">身分會保存在這台裝置；清除網站資料後將建立新身分。</p>
    </section>
  </main>
}

function PlayPage() {
  const { user, loading: authLoading } = useFirebaseUser()
  const code = getStoredSessionCode()
  const classroom = useClassroom(code, Boolean(user && code))
  const question = classroom.questions.find(item => item.id === classroom.session?.currentQuestionId)
  const player = classroom.players.find(item => item.id === user?.uid)
  const answer = useStudentAnswer(code, question?.id ?? '', user?.uid)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const correctIndex = question ? classroom.session?.revealedAnswers?.[question.id] : undefined
  const hasAnswered = Boolean(answer)
  const isCorrect = answer && correctIndex !== undefined && answer.selectedIndex === correctIndex

  if (authLoading || classroom.loading) return <main className="center-page page-shell"><LoadingPanel /></main>
  if (!code || !user || !player || !classroom.session || !question) return <main className="center-page page-shell"><section className="panel empty-state"><span className="big-icon">👋</span><h1>先加入課堂吧</h1><p>輸入講師提供的課堂代碼與暱稱。</p><a className="primary-button" href="#/join">前往加入</a></section></main>

  async function chooseAnswer(index: number) {
    if (!user || !question) return
    try { setSubmitting(true); setError(''); await submitAnswer(code, question.id, index, user.uid) }
    catch (reason) { setError(reason instanceof Error ? reason.message : '送出失敗，請再試一次。') }
    finally { setSubmitting(false) }
  }

  return <main className="play-page page-shell">
    <div className="page-topline"><div><span className="eyebrow">CLASSROOM · {code}</span><h1>嗨，{player.nickname}</h1></div><div className="score-chip"><span>目前分數</span><strong>{player.score.toLocaleString()}</strong></div></div>
    <section className="panel question-card">
      <div className="question-meta"><span>第 {classroom.session.currentQuestionIndex + 1} / {classroom.questions.length} 題</span><StatusPill open={classroom.session.isQuestionOpen} /></div>
      <h2>{question.prompt}</h2>
      <div className="answer-grid">{question.options.map((option, index) => {
        const selected = answer?.selectedIndex === index
        const revealCorrect = correctIndex !== undefined && index === correctIndex
        const revealWrong = correctIndex !== undefined && selected && !isCorrect
        return <button className={`answer-button ${selected ? 'selected' : ''} ${revealCorrect ? 'correct' : ''} ${revealWrong ? 'wrong' : ''}`} disabled={!classroom.session?.isQuestionOpen || hasAnswered || submitting} key={option} onClick={() => void chooseAnswer(index)} type="button"><span className="answer-letter">{String.fromCharCode(65 + index)}</span><span>{option}</span></button>
      })}</div>
      <div className="answer-feedback" aria-live="polite">
        {error || (!classroom.session.isQuestionOpen && !hasAnswered && '等待講師開放題目…')}
        {!error && classroom.session.isQuestionOpen && !hasAnswered && '選擇一個答案，送出後無法更改。'}
        {!error && classroom.session.isQuestionOpen && hasAnswered && '已送出！等待講師公布答案。'}
        {!error && correctIndex !== undefined && hasAnswered && (isCorrect ? '答對了！獲得 1,000 分 🎉' : `正確答案是 ${question.options[correctIndex]}`)}
      </div>
    </section>
  </main>
}

function HostPage() {
  const { user, loading: authLoading, isGoogleUser } = useFirebaseUser()
  const [code, setCode] = useState(getStoredSessionCode)
  const classroom = useClassroom(code, Boolean(user && isGoogleUser && code))
  const question = classroom.questions.find(item => item.id === classroom.session?.currentQuestionId)
  const answers = useQuestionAnswers(code, question?.id ?? '', Boolean(isGoogleUser && classroom.session?.hostUid === user?.uid))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const revealedIndex = question ? classroom.session?.revealedAnswers?.[question.id] : undefined

  async function run(action: () => Promise<void>) {
    try { setBusy(true); setError(''); await action() }
    catch (reason) { setError(reason instanceof Error ? reason.message : '操作失敗，請稍後再試。') }
    finally { setBusy(false) }
  }

  async function createNewClassroom() {
    if (!user) return
    await run(async () => { const nextCode = await createClassroom(user); setCode(nextCode) })
  }

  if (authLoading) return <main className="center-page page-shell"><LoadingPanel text="確認登入狀態…" /></main>
  if (!isGoogleUser) return <main className="center-page page-shell"><section className="panel login-card"><span className="eyebrow">INSTRUCTOR ACCESS</span><h1>講師登入</h1><p>使用 Google 帳號建立並控制自己的課堂。</p>{error && <p className="form-error">{error}</p>}<button className="google-button" onClick={() => void run(async () => { await signInAsHost() })}><span>G</span> 使用 Google 登入</button></section></main>
  if (!code || (!classroom.loading && (!classroom.session || classroom.session.hostUid !== user?.uid))) return <main className="center-page page-shell"><section className="panel login-card"><span className="eyebrow">NEW CLASSROOM</span><h1>建立新課堂</h1><p>系統會產生 6 碼代碼，學生可從自己的裝置加入。</p>{error && <p className="form-error">{error}</p>}<button className="primary-button" disabled={busy} onClick={() => void createNewClassroom()}>{busy ? '建立中…' : '建立課堂'}</button><button className="text-button" onClick={() => void signOutHost()}>登出 Google 帳號</button></section></main>
  if (classroom.loading || !classroom.session || !question) return <main className="center-page page-shell"><LoadingPanel /></main>

  const correct = revealedIndex === undefined ? 0 : answers.filter(answer => answer.selectedIndex === revealedIndex).length
  const joinUrl = `${window.location.origin}${window.location.pathname}#/join?session=${code}`
  return <main className="host-page page-shell">
    <div className="page-topline"><div><span className="eyebrow">INSTRUCTOR CONTROL</span><h1>講師控制台</h1></div><StatusPill open={classroom.session.isQuestionOpen} /></div>
    <section className="session-banner"><div><span>課堂代碼</span><strong>{code}</strong></div><button className="secondary-button" onClick={() => void navigator.clipboard.writeText(joinUrl)}>複製加入連結</button><button className="text-button" onClick={() => void signOutHost()}>登出</button></section>
    {error && <p className="form-error panel inline-error" role="alert">{error}</p>}
    <div className="host-grid">
      <section className="panel host-question">
        <div className="question-meta"><span>題目 {classroom.session.currentQuestionIndex + 1} / {classroom.questions.length}</span><span>{answers.length} 人已作答</span></div><h2>{question.prompt}</h2>
        <ol className="host-options">{question.options.map((option, index) => { const count = answers.filter(answer => answer.selectedIndex === index).length; return <li className={revealedIndex === index ? 'correct' : ''} key={option}><span>{String.fromCharCode(65 + index)}. {option}</span><strong>{count}</strong></li> })}</ol>
        <div className="host-actions"><button className="secondary-button" disabled={busy || classroom.session.currentQuestionIndex === 0} onClick={() => void run(() => changeQuestion(code, classroom.questions, classroom.session!.currentQuestionIndex - 1))}>← 上一題</button>{classroom.session.isQuestionOpen ? <button className="danger-button" disabled={busy} onClick={() => void run(() => closeQuestionAndScore(code, question.id))}>{busy ? '結算中…' : '關閉並公布答案'}</button> : <button className="primary-button" disabled={busy} onClick={() => void run(() => setQuestionOpen(code, true))}>開放作答</button>}<button className="secondary-button" disabled={busy || classroom.session.currentQuestionIndex === classroom.questions.length - 1} onClick={() => void run(() => changeQuestion(code, classroom.questions, classroom.session!.currentQuestionIndex + 1))}>下一題 →</button></div>
      </section>
      <aside className="host-sidebar">
        <section className="panel metric-card"><span>線上玩家</span><strong>{classroom.players.length}</strong><small>跨裝置即時同步</small></section>
        <section className="panel metric-card"><span>本題正確率</span><strong>{revealedIndex === undefined || !answers.length ? '—' : `${Math.round(correct / answers.length * 100)}%`}</strong><small>{revealedIndex === undefined ? '公布後顯示' : `${correct} / ${answers.length} 人答對`}</small></section>
        <a className="panel projector-link" href={`#/scoreboard?session=${code}`}><span>開啟投影排行榜</span><strong>↗</strong></a>
        <button className="text-button" onClick={() => void createNewClassroom()}>建立另一個課堂</button>
      </aside>
    </div>
  </main>
}

function ScoreboardPage() {
  const { user } = useFirebaseUser()
  const [code, setCode] = useState(() => getCodeFromHash() || getStoredSessionCode())
  const [draftCode, setDraftCode] = useState(code)
  const classroom = useClassroom(code, Boolean(user && code))
  const leaders = useMemo(() => [...classroom.players].sort((a, b) => b.score - a.score || a.nickname.localeCompare(b.nickname)), [classroom.players])
  const topScore = Math.max(leaders[0]?.score ?? 0, 1)

  function selectClassroom(event: FormEvent) {
    event.preventDefault(); const nextCode = normalizeCode(draftCode)
    if (nextCode.length !== 6) return
    storeSessionCode(nextCode); setCode(nextCode); window.location.hash = `/scoreboard?session=${nextCode}`
  }

  if (!code || (!classroom.loading && !classroom.session)) return <main className="center-page page-shell"><section className="panel login-card"><span className="eyebrow">LIVE SCOREBOARD</span><h1>選擇課堂</h1><form onSubmit={selectClassroom}><label htmlFor="scoreboard-code">6 碼課堂代碼</label><input className="code-input" id="scoreboard-code" maxLength={6} onChange={event => setDraftCode(normalizeCode(event.target.value))} value={draftCode} /><button className="primary-button full">開啟排行榜</button></form>{classroom.error && <p className="form-error">{classroom.error}</p>}</section></main>
  if (classroom.loading || !classroom.session) return <main className="center-page page-shell"><LoadingPanel /></main>

  return <main className="scoreboard-page page-shell">
    <div className="scoreboard-heading"><div><span className="eyebrow">LIVE SCOREBOARD · {code}</span><h1>個人排行榜</h1></div><div className="scoreboard-live"><div className="live-indicator"><span /> 即時更新</div><small>第 {classroom.session.currentQuestionIndex + 1} / {classroom.questions.length} 題</small><StatusPill open={classroom.session.isQuestionOpen} /></div></div>
    <div className="scoreboard-grid">
      <section className="panel leaderboard">{leaders.length ? leaders.map((player, index) => <div className={`leader-row rank-${index + 1}`} key={player.id}><span className="rank">{index + 1}</span><span className="avatar">{player.nickname.slice(0, 1).toUpperCase()}</span><div className="leader-info"><strong>{player.nickname}</strong><div className="score-bar"><span style={{ width: `${Math.max(player.score / topScore * 100, 4)}%` }} /></div></div><strong className="leader-score">{player.score.toLocaleString()}</strong></div>) : <div className="waiting-players">等待學生加入…</div>}</section>
    </div>
  </main>
}

function App() {
  const route = useRoute()
  useEffect(() => { void ensureAnonymousUser().catch(() => undefined) }, [])
  return <div className="app"><Header route={route} />{route === '/join' && <JoinPage />}{route === '/play' && <PlayPage />}{route === '/host' && <HostPage />}{route === '/scoreboard' && <ScoreboardPage />}<footer>QuickClass · Firebase live classroom</footer></div>
}

export default App
