import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import QRCode from 'qrcode'
import './App.css'
import {
  closeQuestionAndScore, ensureAnonymousUser, getCodeFromHash, getStoredNickname,
  getStoredQuestionCode, isValidQuestionCode, joinQuestion, normalizeCode,
  prepareQuestion, setQuestionOpen, signInAsHost, signOutHost,
  startNewScoreboardRound, submitAnswer, useAnswerKey, useFirebaseUser,
  useQuestion, useQuestionAnswers, useScoreboard, useStudentAnswer,
} from './gameStore'

type Route = '/join' | '/play' | '/host' | '/scoreboard'
const routes: Route[] = ['/join', '/play', '/host', '/scoreboard']
const labels: Record<Route, string> = { '/join': '加入', '/play': '作答', '/host': '講師台', '/scoreboard': '排行榜' }
const optionLabels = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']

function getRoute(): Route {
  const value = window.location.hash.slice(1).split('?')[0]
  return routes.includes(value as Route) ? value as Route : '/join'
}

function useRoute() {
  const [route, setRoute] = useState(getRoute)
  useEffect(() => {
    if (!window.location.hash) window.location.replace('#/join')
    const update = () => setRoute(getRoute())
    window.addEventListener('hashchange', update)
    return () => window.removeEventListener('hashchange', update)
  }, [])
  return route
}

function Header({ route }: { route: Route }) {
  return <header className="site-header">
    <a className="brand" href="#/join" aria-label="QC scoreboard 首頁"><span className="brand-mark">QC</span><span>QC scoreboard</span></a>
    <nav aria-label="主要導覽">{routes.map(item => <a className={route === item ? 'active' : ''} href={`#${item}`} key={item}>{labels[item]}</a>)}</nav>
  </header>
}

function StatusPill({ open }: { open: boolean }) {
  return <span className={`status-pill ${open ? 'open' : 'closed'}`}><span className="status-dot" />{open ? '開放作答中' : '目前已關閉'}</span>
}

function LoadingPanel({ text = '連線中…' }: { text?: string }) {
  return <section className="panel empty-state"><span className="spinner" /><h2>{text}</h2></section>
}

function OptionCheckboxes({ selected, onChange, disabled = false, legend = '選擇答案', revealedOptions = [] }: { selected: number[]; onChange: (next: number[]) => void; disabled?: boolean; legend?: string; revealedOptions?: number[] }) {
  function toggle(index: number) {
    onChange(selected.includes(index) ? selected.filter(value => value !== index) : [...selected, index].sort((a, b) => a - b))
  }
  return <fieldset className="option-fieldset" disabled={disabled}>
    <legend>{legend}</legend>
    <div className="multi-option-grid">{optionLabels.map((label, index) => {
      const isSelected = selected.includes(index)
      const isRevealedCorrect = revealedOptions.includes(index)
      const isRevealedWrong = Boolean(revealedOptions.length && isSelected && !isRevealedCorrect)
      return <label className={`multi-option ${isSelected ? 'checked' : ''} ${isRevealedCorrect ? 'revealed-correct' : ''} ${isRevealedWrong ? 'revealed-wrong' : ''}`} key={label}><input checked={isSelected} onChange={() => toggle(index)} type="checkbox" /><span>{label}</span>{isRevealedCorrect && <small>正確</small>}{isRevealedWrong && <small>誤選</small>}</label>
    })}</div>
  </fieldset>
}

function JoinPage() {
  const { user } = useFirebaseUser()
  const [deepLinkCode] = useState(getCodeFromHash)
  const [code, setCode] = useState(() => deepLinkCode || getStoredQuestionCode())
  const [nickname, setNickname] = useState(getStoredNickname)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const attemptedAutoJoin = useRef(false)
  const questionState = useQuestion(code, Boolean(user && isValidQuestionCode(code)))
  const scoreboard = useScoreboard(Boolean(user))
  const leader = [...scoreboard.players].sort((a, b) => b.score - a.score)[0]

  async function join(codeValue: string, nicknameValue: string) {
    setBusy(true); setError('')
    try { await joinQuestion(codeValue, nicknameValue); window.location.hash = '/play' }
    catch (reason) { setError(reason instanceof Error ? reason.message : '加入失敗，請稍後再試。') }
    finally { setBusy(false) }
  }

  useEffect(() => {
    if (!user || attemptedAutoJoin.current || !isValidQuestionCode(deepLinkCode) || !getStoredNickname()) return
    attemptedAutoJoin.current = true
    void join(deepLinkCode, getStoredNickname())
  }, [deepLinkCode, user])

  function submit(event: FormEvent) {
    event.preventDefault()
    if (!isValidQuestionCode(code)) { setError('題目代碼格式應為 0S1Q01。'); return }
    void join(code, nickname)
  }

  return <main className="join-layout page-shell">
    <section className="join-intro"><span className="eyebrow">LIVE CLASSROOM QUIZ</span><h1>準備好，<br />一起作答！</h1><p>掃描投影片上的 QR code，或輸入題目代碼。</p>{scoreboard.config && <div className="mini-scoreboard"><span>目前領先</span><strong>{leader?.nickname ?? '等待加入'}</strong><span>{scoreboard.players.length} 位玩家</span></div>}</section>
    <section className="panel join-card"><div className="step-badge">01</div><h2>進入題目</h2><p className="muted">代碼格式：0S1Q01</p>
      <form onSubmit={submit}><label htmlFor="question-code">題目代碼</label><input className="code-input" id="question-code" maxLength={6} onChange={event => setCode(normalizeCode(event.target.value))} placeholder="0S1Q01" value={code} /><label htmlFor="nickname">你的暱稱</label><input autoComplete="nickname" id="nickname" maxLength={20} onChange={event => setNickname(event.target.value)} placeholder="例如：小明" value={nickname} />{error && <p className="form-error" role="alert">{error}</p>}<button className="primary-button full" disabled={busy} type="submit">{busy ? '進入中…' : '進入題目 →'}</button></form>
      {questionState.question && <div className="join-status"><StatusPill open={questionState.question.isOpen} /></div>}<p className="local-note">同一裝置會沿用暱稱；清除網站資料後將建立新身分。</p>
    </section>
  </main>
}

function PlayPage() {
  const { user, loading: authLoading } = useFirebaseUser()
  const code = getStoredQuestionCode()
  const questionState = useQuestion(code, Boolean(user && code))
  const scoreboard = useScoreboard(Boolean(user))
  const question = questionState.question
  const player = scoreboard.players.find(item => item.id === user?.uid)
  const answer = useStudentAnswer(code, question?.roundId ?? '', user?.uid)
  const [selections, setSelections] = useState<number[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => setSelections(answer?.selections ?? []), [answer, code])

  if (authLoading || questionState.loading || scoreboard.loading) return <main className="center-page page-shell"><LoadingPanel /></main>
  if (!code || !user || !question || !player || question.roundId !== scoreboard.config?.activeRoundId) return <main className="center-page page-shell"><section className="panel empty-state"><span className="big-icon">👋</span><h1>先進入題目吧</h1><p>掃描 QR code，或輸入題目代碼與暱稱。</p><a className="primary-button" href="#/join">前往加入</a></section></main>

  const roundId = question.roundId
  const sessionKey = question.sessionKey
  const userId = user.uid
  const revealed = question.revealedOptions ?? []
  const correct = Boolean(answer && revealed.length && answer.selections.length === revealed.length && [...answer.selections].sort().every((value, index) => value === [...revealed].sort()[index]))
  async function sendAnswer() {
    try { setSubmitting(true); setError(''); await submitAnswer(code, roundId, sessionKey, selections, userId) }
    catch (reason) { setError(reason instanceof Error ? reason.message : '送出失敗，請再試一次。') }
    finally { setSubmitting(false) }
  }

  return <main className="play-page page-shell"><div className="page-topline"><div><span className="eyebrow">QUESTION · {code}</span><h1>嗨，{player.nickname}</h1></div><div className="score-chip"><span>總分</span><strong>{player.score.toLocaleString()}</strong></div></div>
    <section className="panel question-card"><div className="question-meta"><span>Session {question.sessionNumber} · Question {String(question.questionNumber).padStart(2, '0')}</span><StatusPill open={question.isOpen} /></div><h2 className="slide-prompt">題目請見投影片<br /><small>See slides for the question</small></h2>
      <OptionCheckboxes disabled={!question.isOpen || Boolean(answer)} onChange={setSelections} revealedOptions={answer ? revealed : []} selected={selections} legend="選擇所有正確答案 Select all that apply" />
      <button className="primary-button submit-answer" disabled={!question.isOpen || Boolean(answer) || !selections.length || submitting} onClick={() => void sendAnswer()}>{submitting ? '送出中…' : answer ? '答案已送出' : `送出答案${selections.length ? ` (${selections.map(value => optionLabels[value]).join('、')})` : ''}`}</button>
      <div className="answer-feedback" aria-live="polite">{error || (!question.isOpen && !answer && '等待講師開放題目…')}{!error && question.isOpen && !answer && '送出前可以自由勾選或取消；送出後無法修改。'}</div>
      {answer && <section className={`answer-status ${revealed.length ? (correct ? 'success' : 'incorrect') : 'pending'}`} aria-live="polite"><div className="answer-status-heading"><span>{revealed.length ? (correct ? '✓' : '!') : '…'}</span><div><small>作答狀況</small><h3>{revealed.length ? (correct ? '完全答對！' : '答案不完全正確') : '已送出，等待公布'}</h3></div></div><dl><div><dt>你的答案</dt><dd>{answer.selections.map(value => optionLabels[value]).join('、')}</dd></div>{answer.scoringMode !== 'standard' && answer.multiplier !== 1 && <div><dt>信心倍率</dt><dd>×{answer.multiplier}</dd></div>}{revealed.length > 0 && <><div><dt>正確答案</dt><dd>{revealed.map(value => optionLabels[value]).join('、')}</dd></div><div><dt>本題得分</dt><dd className={(answer.points ?? 0) >= 0 ? 'positive-points' : 'negative-points'}>{answer.points === undefined ? '結算中…' : `${answer.points > 0 ? '+' : ''}${answer.points.toLocaleString()}`}</dd></div></>}</dl></section>}
    </section>
  </main>
}

function useQrCode(url: string) {
  const [dataUrl, setDataUrl] = useState('')
  useEffect(() => { if (!url) return; void QRCode.toDataURL(url, { width: 220, margin: 1, color: { dark: '#29495e', light: '#ffffff' } }).then(setDataUrl) }, [url])
  return dataUrl
}

function HostPage() {
  const { user, loading: authLoading, isGoogleUser } = useFirebaseUser()
  const scoreboard = useScoreboard(Boolean(user && isGoogleUser))
  const [code, setCode] = useState(() => getStoredQuestionCode() || '0S1Q01')
  const [correctOptions, setCorrectOptions] = useState<number[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const questionState = useQuestion(code, Boolean(user && isGoogleUser && isValidQuestionCode(code)))
  const question = questionState.question
  const answerKey = useAnswerKey(code, Boolean(question && question.hostUid === user?.uid))
  const answers = useQuestionAnswers(code, question?.roundId ?? '', Boolean(question && question.hostUid === user?.uid))
  useEffect(() => setCorrectOptions(answerKey?.correctOptions ?? []), [answerKey, code])
  const isCurrentRound = Boolean(question && question.roundId === scoreboard.config?.activeRoundId)
  const joinUrl = isValidQuestionCode(code) && isCurrentRound ? `${window.location.origin}${window.location.pathname}#/join?code=${code}` : ''
  const qrCode = useQrCode(joinUrl)

  async function run(action: () => Promise<void>) {
    try { setBusy(true); setError(''); await action() }
    catch (reason) { setError(reason instanceof Error ? reason.message : '操作失敗，請稍後再試。') }
    finally { setBusy(false) }
  }
  if (authLoading) return <main className="center-page page-shell"><LoadingPanel text="確認登入狀態…" /></main>
  if (!isGoogleUser) return <main className="center-page page-shell"><section className="panel login-card"><span className="eyebrow">INSTRUCTOR ACCESS</span><h1>講師登入</h1><p>使用 Google 帳號設定題目與控制計分板。</p>{error && <p className="form-error">{error}</p>}<button className="google-button" onClick={() => void run(async () => { await signInAsHost() })}><span>G</span> 使用 Google 登入</button></section></main>

  const revealed = question?.revealedOptions ?? []
  const correctCount = revealed.length ? answers.filter(answer => answer.selections.length === revealed.length && [...answer.selections].sort().every((value, index) => value === [...revealed].sort()[index])).length : 0
  return <main className="host-page page-shell"><div className="page-topline"><div><span className="eyebrow">INSTRUCTOR CONTROL</span><h1>題目控制台</h1></div>{question && isCurrentRound && <StatusPill open={question.isOpen} />}</div>
    {error && <p className="form-error panel inline-error" role="alert">{error}</p>}
    <div className="host-builder-grid"><section className="panel question-builder"><h2>設定題目</h2><label htmlFor="host-code">題目代碼</label><input className="code-input" id="host-code" maxLength={6} onChange={event => setCode(normalizeCode(event.target.value))} placeholder="0S1Q01" value={code} /><OptionCheckboxes onChange={setCorrectOptions} selected={correctOptions} legend="設定正確答案（可複選）" /><button className="primary-button full" disabled={busy || !isValidQuestionCode(code) || !correctOptions.length} onClick={() => user && void run(async () => { await prepareQuestion(user, code, correctOptions) })}>{question && isCurrentRound ? '更新題目設定' : '建立／加入本輪計分板'}</button><p className="local-note">格式固定為 0S#Q##，例如 0S1Q01。</p></section>
      <aside className="panel qr-card"><span className="eyebrow">STUDENT ACCESS</span><h2>{code}</h2>{qrCode ? <img alt={`${code} 加入題目的 QR code`} src={qrCode} /> : <div className="qr-placeholder">完成題目設定後<br />顯示 QR code</div>}<button className="secondary-button" disabled={!joinUrl} onClick={() => void navigator.clipboard.writeText(joinUrl)}>複製加入連結</button></aside></div>
    {question && isCurrentRound && <div className="host-grid question-control-grid"><section className="panel host-question"><div className="question-meta"><span>{code}</span><span>{answers.length} 人已作答</span></div><h2>題目請見投影片</h2><ol className="host-options eight-options">{optionLabels.map((label, index) => <li className={revealed.includes(index) ? 'correct' : ''} key={label}><span>{label}</span><strong>{answers.filter(answer => answer.selections.includes(index)).length}</strong></li>)}</ol><div className="host-actions">{question.isOpen ? <button className="danger-button" disabled={busy} onClick={() => void run(() => closeQuestionAndScore(code))}>{busy ? '結算中…' : '關閉並公布答案'}</button> : <button className="primary-button" disabled={busy} onClick={() => void run(() => setQuestionOpen(code, true))}>開放作答</button>}</div></section>
      <aside className="host-sidebar"><section className="panel metric-card"><span>本題作答</span><strong>{answers.length}</strong><small>每位學生限一次</small></section><section className="panel metric-card"><span>完全答對</span><strong>{revealed.length ? correctCount : '—'}</strong><small>{revealed.length ? '答對 +1,000 分' : '公布後顯示'}</small></section><a className="panel projector-link" href="#/scoreboard"><span>開啟全域排行榜</span><strong>↗</strong></a><button className="text-button" onClick={() => window.confirm('開始新的計分板後，後續題目將從 0 分重新累積。確定繼續？') && user && void run(async () => { await startNewScoreboardRound(user) })}>開始新一輪計分板</button><button className="text-button" onClick={() => void signOutHost()}>登出</button></aside></div>}
  </main>
}

function ScoreboardPage() {
  const { user } = useFirebaseUser()
  const scoreboard = useScoreboard(Boolean(user))
  const leaders = useMemo(() => [...scoreboard.players].sort((a, b) => b.score - a.score || a.nickname.localeCompare(b.nickname)), [scoreboard.players])
  const topScore = Math.max(leaders[0]?.score ?? 0, 1)
  if (scoreboard.loading) return <main className="center-page page-shell"><LoadingPanel /></main>
  if (!scoreboard.config) return <main className="center-page page-shell"><section className="panel empty-state"><h1>尚未建立計分板</h1><p>請先由講師建立第一道題目。</p></section></main>
  return <main className="scoreboard-page page-shell"><div className="scoreboard-heading"><div><span className="eyebrow">GLOBAL LIVE SCOREBOARD</span><h1>個人總積分</h1></div><div className="live-indicator"><span /> 即時更新</div></div><div className="scoreboard-grid"><section className="panel leaderboard">{leaders.length ? leaders.map((player, index) => <div className={`leader-row rank-${index + 1}`} key={player.id}><span className="rank">{index + 1}</span><span className="avatar">{player.nickname.slice(0, 1).toUpperCase()}</span><div className="leader-info"><strong>{player.nickname}</strong><div className="score-bar"><span style={{ width: `${Math.max(player.score / topScore * 100, 4)}%` }} /></div></div><strong className="leader-score">{player.score.toLocaleString()}</strong></div>) : <div className="waiting-players">等待學生加入…</div>}</section></div></main>
}

function App() {
  const route = useRoute()
  useEffect(() => { void ensureAnonymousUser().catch(() => undefined) }, [])
  return <div className="app"><Header route={route} />{route === '/join' && <JoinPage />}{route === '/play' && <PlayPage />}{route === '/host' && <HostPage />}{route === '/scoreboard' && <ScoreboardPage />}<footer>QC scoreboard · Firebase live classroom</footer></div>
}

export default App
