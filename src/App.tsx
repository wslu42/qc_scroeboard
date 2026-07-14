import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import QRCode from 'qrcode'
import './App.css'
import {
  closeQuestionAndScore, ensureAnonymousUser, getCodeFromHash, getStoredNickname,
  getStoredQuestionCode, isValidQuestionCode, joinQuestion, normalizeCode,
  prepareQuestion, setQuestionOpen, signInAsHost, signOutHost,
  startNewScoreboardRound, submitAnswer, useAnswerKey, useFirebaseUser,
  useHostRecords, useQuestion, useQuestionAnswers, useScoreboard, useStudentAnswer,
} from './gameStore'
import type { Player } from './gameStore'

type Route = '/join' | '/play' | '/host' | '/scoreboard'
const routes: Route[] = ['/join', '/play', '/host', '/scoreboard']
const labels: Record<Route, string> = { '/join': 'Join', '/play': 'Play', '/host': 'Host', '/scoreboard': 'Scoreboard' }
const optionLabels = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']

function comparePlayers(first: Player, second: Player) {
  return second.score - first.score
    || (first.tieBreakTimeMs ?? Number.MAX_SAFE_INTEGER) - (second.tieBreakTimeMs ?? Number.MAX_SAFE_INTEGER)
    || first.nickname.localeCompare(second.nickname)
}

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
    <a className="brand" href="#/join" aria-label="QC scoreboard home"><span className="brand-mark">QC</span><span>QC scoreboard</span></a>
    <nav aria-label="Main navigation">{routes.map(item => <a className={route === item ? 'active' : ''} href={`#${item}`} key={item}>{labels[item]}</a>)}</nav>
  </header>
}

function StatusPill({ open }: { open: boolean }) {
  return <span className={`status-pill ${open ? 'open' : 'closed'}`}><span className="status-dot" />{open ? 'Open for answers' : 'Closed'}</span>
}

function LoadingPanel({ text = 'Connecting…' }: { text?: string }) {
  return <section className="panel empty-state"><span className="spinner" /><h2>{text}</h2></section>
}

function OptionCheckboxes({ selected, onChange, disabled = false, legend = 'Choose your answer', revealedOptions = [] }: { selected: number[]; onChange: (next: number[]) => void; disabled?: boolean; legend?: string; revealedOptions?: number[] }) {
  function toggle(index: number) {
    onChange(selected.includes(index) ? selected.filter(value => value !== index) : [...selected, index].sort((a, b) => a - b))
  }
  return <fieldset className="option-fieldset" disabled={disabled}>
    <legend>{legend}</legend>
    <div className="multi-option-grid">{optionLabels.map((label, index) => {
      const isSelected = selected.includes(index)
      const isRevealedCorrect = revealedOptions.includes(index)
      const isRevealedWrong = Boolean(revealedOptions.length && isSelected && !isRevealedCorrect)
      return <label className={`multi-option ${isSelected ? 'checked' : ''} ${isRevealedCorrect ? 'revealed-correct' : ''} ${isRevealedWrong ? 'revealed-wrong' : ''}`} key={label}><input checked={isSelected} onChange={() => toggle(index)} type="checkbox" /><span>{label}</span>{isRevealedCorrect && <small>Correct</small>}{isRevealedWrong && <small>Incorrect</small>}</label>
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
  const leader = [...scoreboard.players].sort(comparePlayers)[0]

  async function join(codeValue: string, nicknameValue: string) {
    setBusy(true); setError('')
    try { await joinQuestion(codeValue, nicknameValue); window.location.hash = '/play' }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to join. Please try again.') }
    finally { setBusy(false) }
  }

  useEffect(() => {
    if (!user || attemptedAutoJoin.current || !isValidQuestionCode(deepLinkCode) || !getStoredNickname()) return
    attemptedAutoJoin.current = true
    void join(deepLinkCode, getStoredNickname())
  }, [deepLinkCode, user])

  function submit(event: FormEvent) {
    event.preventDefault()
    if (!isValidQuestionCode(code)) { setError('Question codes must follow the format 0S1Q01.'); return }
    void join(code, nickname)
  }

  return <main className="join-layout page-shell">
    <section className="join-intro"><span className="eyebrow">LIVE CLASSROOM QUIZ</span><h1>Ready?<br />Let's play!</h1><p>Scan the QR code on the slide, or enter the question code.</p>{scoreboard.config && <div className="mini-scoreboard"><span>Current leader</span><strong>{leader?.nickname ?? 'Waiting for players'}</strong><span>{scoreboard.players.length} {scoreboard.players.length === 1 ? 'player' : 'players'}</span></div>}</section>
    <section className="panel join-card"><div className="step-badge">01</div><h2>Join a question</h2><p className="muted">Code format: 0S1Q01</p>
      <form onSubmit={submit}><label htmlFor="question-code">Question code</label><input className="code-input" id="question-code" maxLength={6} onChange={event => setCode(normalizeCode(event.target.value))} placeholder="0S1Q01" value={code} /><label htmlFor="nickname">Your nickname</label><input autoComplete="nickname" id="nickname" maxLength={20} onChange={event => setNickname(event.target.value)} placeholder="For example, Alex" value={nickname} />{error && <p className="form-error" role="alert">{error}</p>}<button className="primary-button full" disabled={busy} type="submit">{busy ? 'Joining…' : 'Join question →'}</button></form>
      {questionState.question && <div className="join-status"><StatusPill open={questionState.question.isOpen} /></div>}<p className="local-note">Your nickname is remembered on this device. Clearing site data creates a new identity.</p>
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
  if (!code || !user || !question || !player || question.roundId !== scoreboard.config?.activeRoundId) return <main className="center-page page-shell"><section className="panel empty-state"><span className="big-icon">👋</span><h1>Join a question first</h1><p>Scan the QR code, or enter the question code and your nickname.</p><a className="primary-button" href="#/join">Go to Join</a></section></main>

  const roundId = question.roundId
  const sessionKey = question.sessionKey
  const userId = user.uid
  const revealed = question.revealedOptions ?? []
  const correct = Boolean(answer && revealed.length && answer.selections.length === revealed.length && [...answer.selections].sort().every((value, index) => value === [...revealed].sort()[index]))
  async function sendAnswer() {
    try { setSubmitting(true); setError(''); await submitAnswer(code, roundId, sessionKey, selections, userId) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to submit your answer. Please try again.') }
    finally { setSubmitting(false) }
  }

  return <main className="play-page page-shell"><div className="page-topline"><div><span className="eyebrow">QUESTION · {code}</span><h1>Hi, {player.nickname}</h1></div><div className="score-chip"><span>Total score</span><strong>{player.score.toLocaleString('en-US')}</strong></div></div>
    <section className="panel question-card"><div className="question-meta"><span>Session {question.sessionNumber} · Question {String(question.questionNumber).padStart(2, '0')}</span><StatusPill open={question.isOpen} /></div><h2 className="slide-prompt">See the slide for the question</h2>
      <OptionCheckboxes disabled={!question.isOpen || Boolean(answer)} onChange={setSelections} revealedOptions={answer ? revealed : []} selected={selections} legend="Select all correct answers" />
      <button className="primary-button submit-answer" disabled={!question.isOpen || Boolean(answer) || !selections.length || submitting} onClick={() => void sendAnswer()}>{submitting ? 'Submitting…' : answer ? 'Answer submitted' : `Submit answer${selections.length ? ` (${selections.map(value => optionLabels[value]).join(', ')})` : ''}`}</button>
      <div className="answer-feedback" aria-live="polite">{error || (!question.isOpen && !answer && 'Waiting for the instructor to open the question…')}{!error && question.isOpen && !answer && 'You can change your selections before submitting. Submitted answers cannot be changed.'}</div>
      {answer && <section className={`answer-status ${revealed.length ? (correct ? 'success' : 'incorrect') : 'pending'}`} aria-live="polite"><div className="answer-status-heading"><span>{revealed.length ? (correct ? '✓' : '!') : '…'}</span><div><small>Answer status</small><h3>{revealed.length ? (correct ? 'Completely correct!' : 'Not completely correct') : 'Submitted — waiting for results'}</h3></div></div><dl><div><dt>Your answer</dt><dd>{answer.selections.map(value => optionLabels[value]).join(', ')}</dd></div>{answer.scoringMode !== 'standard' && answer.multiplier !== 1 && <div><dt>Confidence multiplier</dt><dd>×{answer.multiplier}</dd></div>}{revealed.length > 0 && <><div><dt>Correct answer</dt><dd>{revealed.map(value => optionLabels[value]).join(', ')}</dd></div><div><dt>Points earned</dt><dd className={(answer.points ?? 0) >= 0 ? 'positive-points' : 'negative-points'}>{answer.points === undefined ? 'Calculating…' : `${answer.points > 0 ? '+' : ''}${answer.points.toLocaleString('en-US')}`}</dd></div></>}</dl></section>}
    </section>
  </main>
}

function useQrCode(url: string) {
  const [dataUrl, setDataUrl] = useState('')
  useEffect(() => { if (!url) return; void QRCode.toDataURL(url, { width: 220, margin: 1, color: { dark: '#29495e', light: '#ffffff' } }).then(setDataUrl) }, [url])
  return dataUrl
}

function formatDate(timestamp?: { toDate: () => Date }) {
  return timestamp?.toDate().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) ?? '—'
}

function HostRecordsPanel({ hostUid, activeRoundId }: { hostUid: string; activeRoundId?: string }) {
  const records = useHostRecords(hostUid, true)
  const playerNames = useMemo(() => new Map(records.rounds.flatMap(round => round.players.map(player => [`${round.id}:${player.id}`, player.nickname]))), [records.rounds])
  const playerCount = records.rounds.reduce((total, round) => total + round.players.length, 0)
  const answerCount = records.questions.reduce((total, question) => total + question.answers.length, 0)

  return <section className="host-records" aria-labelledby="class-records-heading">
    <div className="records-heading"><div><span className="eyebrow">HOST-ONLY ARCHIVE</span><h2 id="class-records-heading">Class records</h2><p>Review every scoreboard round, player, question key, and submitted answer owned by this instructor account.</p></div><button className="secondary-button" disabled={records.loading} onClick={records.refresh}>{records.loading ? 'Loading…' : 'Refresh records'}</button></div>
    {records.error && <p className="form-error panel inline-error" role="alert">{records.error}</p>}
    <div className="records-summary"><div className="panel"><span>Scoreboard rounds</span><strong>{records.rounds.length}</strong></div><div className="panel"><span>Player records</span><strong>{playerCount}</strong></div><div className="panel"><span>Question codes</span><strong>{records.questions.length}</strong></div><div className="panel"><span>Submitted answers</span><strong>{answerCount}</strong></div></div>
    {records.loading ? <LoadingPanel text="Loading class records…" /> : <div className="records-columns">
      <section><h3>Scoreboard rounds and players</h3>{records.rounds.length ? records.rounds.map(round => <details className="panel record-card" key={round.id}><summary><div><strong>{round.id === activeRoundId ? 'Active round' : 'Archived round'}</strong><small>{formatDate(round.createdAt)}</small></div><span>{round.players.length} {round.players.length === 1 ? 'player' : 'players'}</span></summary><div className="records-table-wrap"><table><thead><tr><th>Player</th><th>Player ID</th><th>Score</th><th>Correct-answer time</th><th>Joined</th></tr></thead><tbody>{round.players.length ? [...round.players].sort(comparePlayers).map(player => <tr key={player.id}><td><strong>{player.nickname}</strong></td><td><code>{player.id}</code></td><td>{player.score.toLocaleString('en-US')}</td><td>{player.tieBreakTimeMs === undefined ? '—' : `${(player.tieBreakTimeMs / 1000).toFixed(1)} sec`}</td><td>{formatDate(player.joinedAt)}</td></tr>) : <tr><td colSpan={5}>No players in this round.</td></tr>}</tbody></table></div></details>) : <div className="panel records-empty">No scoreboard rounds have been created.</div>}</section>
      <section><h3>Questions, answer keys, and submissions</h3>{records.questions.length ? records.questions.map(question => <details className="panel record-card" key={question.code}><summary><div><strong>{question.code}</strong><small>{question.isOpen ? 'Open for answers' : 'Closed'} · Round {question.roundId}</small></div><span>{question.answers.length} {question.answers.length === 1 ? 'answer' : 'answers'}</span></summary><div className="question-record-meta"><span>Answer key</span><strong>{question.answerKey.length ? question.answerKey.map(value => optionLabels[value]).join(', ') : 'Not set'}</strong><span>Session {question.sessionNumber} · Question {String(question.questionNumber).padStart(2, '0')}</span></div><div className="records-table-wrap"><table><thead><tr><th>Player</th><th>Submitted answer</th><th>Status</th><th>Points</th><th>Response time</th><th>Submitted</th></tr></thead><tbody>{question.answers.length ? [...question.answers].sort((first, second) => (first.submittedAt?.toMillis() ?? 0) - (second.submittedAt?.toMillis() ?? 0)).map(answer => <tr key={answer.id}><td><strong>{playerNames.get(`${answer.roundId}:${answer.studentUid}`) ?? 'Unknown player'}</strong><small><code>{answer.studentUid}</code></small></td><td>{answer.selections.map(value => optionLabels[value]).join(', ')}</td><td>{answer.awarded ? 'Scored' : 'Pending'}</td><td>{answer.points === undefined ? '—' : answer.points.toLocaleString('en-US')}</td><td>{answer.responseTimeMs === undefined ? '—' : `${(answer.responseTimeMs / 1000).toFixed(1)} sec`}</td><td>{formatDate(answer.submittedAt)}</td></tr>) : <tr><td colSpan={6}>No answers submitted for this question.</td></tr>}</tbody></table></div></details>) : <div className="panel records-empty">No question codes have been created.</div>}</section>
    </div>}
  </section>
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
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Something went wrong. Please try again.') }
    finally { setBusy(false) }
  }
  if (authLoading) return <main className="center-page page-shell"><LoadingPanel text="Checking sign-in status…" /></main>
  if (!isGoogleUser) return <main className="center-page page-shell"><section className="panel login-card"><span className="eyebrow">INSTRUCTOR ACCESS</span><h1>Instructor sign-in</h1><p>Use your Google account to set up questions and control the scoreboard.</p>{error && <p className="form-error">{error}</p>}<button className="google-button" onClick={() => void run(async () => { await signInAsHost() })}><span>G</span> Sign in with Google</button></section></main>

  const revealed = question?.revealedOptions ?? []
  const correctCount = revealed.length ? answers.filter(answer => answer.selections.length === revealed.length && [...answer.selections].sort().every((value, index) => value === [...revealed].sort()[index])).length : 0
  return <main className="host-page page-shell"><div className="page-topline"><div><span className="eyebrow">INSTRUCTOR CONTROL</span><h1>Question dashboard</h1></div>{question && isCurrentRound && <StatusPill open={question.isOpen} />}</div>
    {error && <p className="form-error panel inline-error" role="alert">{error}</p>}
    <div className="host-builder-grid"><section className="panel question-builder"><h2>Set up a question</h2><label htmlFor="host-code">Question code</label><input className="code-input" id="host-code" maxLength={6} onChange={event => setCode(normalizeCode(event.target.value))} placeholder="0S1Q01" value={code} /><OptionCheckboxes onChange={setCorrectOptions} selected={correctOptions} legend="Set the correct answer (select all that apply)" /><button className="primary-button full" disabled={busy || !isValidQuestionCode(code) || !correctOptions.length} onClick={() => user && void run(async () => { await prepareQuestion(user, code, correctOptions) })}>{question && isCurrentRound ? 'Update question settings' : 'Create or join this scoreboard round'}</button><p className="local-note">Use the format 0S#Q##, such as 0S1Q01.</p></section>
      <aside className="panel qr-card"><span className="eyebrow">STUDENT ACCESS</span><h2>{code}</h2>{qrCode ? <img alt={`QR code to join question ${code}`} src={qrCode} /> : <div className="qr-placeholder">Set up the question<br />to display a QR code</div>}<button className="secondary-button" disabled={!joinUrl} onClick={() => void navigator.clipboard.writeText(joinUrl)}>Copy join link</button></aside></div>
    {question && isCurrentRound && <div className="host-grid question-control-grid"><section className="panel host-question"><div className="question-meta"><span>{code}</span><span>{answers.length} {answers.length === 1 ? 'response' : 'responses'}</span></div><h2>See the slide for the question</h2><ol className="host-options eight-options">{optionLabels.map((label, index) => <li className={revealed.includes(index) ? 'correct' : ''} key={label}><span>{label}</span><strong>{answers.filter(answer => answer.selections.includes(index)).length}</strong></li>)}</ol><div className="host-actions">{question.isOpen ? <button className="danger-button" disabled={busy} onClick={() => void run(() => closeQuestionAndScore(code))}>{busy ? 'Calculating…' : 'Close and reveal answer'}</button> : <button className="primary-button" disabled={busy} onClick={() => void run(() => setQuestionOpen(code, true))}>Open for answers</button>}</div></section>
      <aside className="host-sidebar"><section className="panel metric-card"><span>Responses</span><strong>{answers.length}</strong><small>One answer per student</small></section><section className="panel metric-card"><span>Completely correct</span><strong>{revealed.length ? correctCount : '—'}</strong><small>{revealed.length ? '+1,000 points each' : 'Shown after results'}</small></section><a className="panel projector-link" href="#/scoreboard"><span>Open global scoreboard</span><strong>↗</strong></a><button className="text-button" onClick={() => window.confirm('Starting a new scoreboard round resets future questions to 0 points. Continue?') && user && void run(async () => { await startNewScoreboardRound(user) })}>Start a new scoreboard round</button><button className="text-button" onClick={() => void signOutHost()}>Sign out</button></aside></div>}
    {user && <HostRecordsPanel activeRoundId={scoreboard.config?.activeRoundId} hostUid={user.uid} />}
  </main>
}

function ScoreboardPage() {
  const { user } = useFirebaseUser()
  const scoreboard = useScoreboard(Boolean(user))
  const leaders = useMemo(() => [...scoreboard.players].sort(comparePlayers), [scoreboard.players])
  const topScore = Math.max(leaders[0]?.score ?? 0, 1)
  if (scoreboard.loading) return <main className="center-page page-shell"><LoadingPanel /></main>
  if (!scoreboard.config) return <main className="center-page page-shell"><section className="panel empty-state"><h1>No scoreboard yet</h1><p>Ask the instructor to set up the first question.</p></section></main>
  return <main className="scoreboard-page page-shell"><div className="scoreboard-heading"><div><span className="eyebrow">GLOBAL LIVE SCOREBOARD</span><h1>Individual scores</h1><p className="muted">Ties are ranked by the shortest cumulative response time on correct answers.</p></div><div className="live-indicator"><span /> Live updates</div></div><div className="scoreboard-grid"><section className="panel leaderboard">{leaders.length ? leaders.map((player, index) => <div className={`leader-row rank-${index + 1}`} key={player.id}><span className="rank">{index + 1}</span><span className="avatar">{player.nickname.slice(0, 1).toUpperCase()}</span><div className="leader-info"><strong>{player.nickname}</strong><div className="score-bar"><span style={{ width: `${Math.max(player.score / topScore * 100, 4)}%` }} /></div></div><strong className="leader-score">{player.score.toLocaleString('en-US')}</strong></div>) : <div className="waiting-players">Waiting for players…</div>}</section></div></main>
}

function App() {
  const route = useRoute()
  useEffect(() => { void ensureAnonymousUser().catch(() => undefined) }, [])
  return <div className="app"><Header route={route} />{route === '/join' && <JoinPage />}{route === '/play' && <PlayPage />}{route === '/host' && <HostPage />}{route === '/scoreboard' && <ScoreboardPage />}<footer>QC scoreboard · Firebase live classroom</footer></div>
}

export default App
