import { useEffect, useState } from 'react'
import {
  GoogleAuthProvider, onAuthStateChanged, signInAnonymously, signInWithPopup,
  signOut, type User,
} from 'firebase/auth'
import {
  collection, doc, getDoc, getDocs, increment, onSnapshot, query,
  serverTimestamp, setDoc, updateDoc, where, writeBatch, type Timestamp,
} from 'firebase/firestore'
import { auth, db } from './firebase'

export type QuestionActivity = {
  code: string
  hostUid: string
  sessionNumber: number
  sessionKey: string
  questionNumber: number
  roundId: string
  isOpen: boolean
  revealedOptions: number[]
  openedAt?: Timestamp
  createdAt?: Timestamp
}
export type ScoreboardConfig = { activeRoundId: string; hostUid: string }
export type Player = { id: string; nickname: string; score: number; tieBreakTimeMs?: number; joinedAt?: Timestamp }
export type ScoreboardRound = { id: string; hostUid: string; createdAt?: Timestamp }
export type Multiplier = 0.5 | 1 | 1.5
export type Answer = { id: string; studentUid: string; roundId: string; sessionKey: string; selections: number[]; multiplier: Multiplier; scoringMode?: 'standard' | 'confidence'; awarded: boolean; points?: number; submittedAt?: Timestamp; responseTimeMs?: number }
export type AnswerKey = { correctOptions: number[] }
export type MultiplierUsage = { usedHalf: boolean; usedBoost: boolean }
export type HostRoundRecord = ScoreboardRound & { players: Player[] }
export type HostQuestionRecord = QuestionActivity & { answerKey: number[]; answers: Answer[] }

const CODE_KEY = 'qc-scoreboard-question-code-v1'
const NICKNAME_KEY = 'qc-scoreboard-nickname-v1'
const LEGACY_CODE_KEY = 'quickclass-session-code-v2'

export function normalizeCode(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
}

export function isValidQuestionCode(value: string) {
  return /^0S\dQ\d{2}$/.test(normalizeCode(value))
}

export function parseQuestionCode(value: string) {
  const code = normalizeCode(value)
  const match = /^0S(\d)Q(\d{2})$/.exec(code)
  return match ? { code, sessionNumber: Number(match[1]), sessionKey: `S${match[1]}`, questionNumber: Number(match[2]) } : null
}

export function getStoredQuestionCode() {
  const code = localStorage.getItem(CODE_KEY) || localStorage.getItem(LEGACY_CODE_KEY) || ''
  return isValidQuestionCode(code) ? normalizeCode(code) : ''
}

export function storeQuestionCode(code: string) {
  localStorage.setItem(CODE_KEY, normalizeCode(code))
}

export function getStoredNickname() {
  return localStorage.getItem(NICKNAME_KEY) ?? ''
}

export function storeNickname(nickname: string) {
  localStorage.setItem(NICKNAME_KEY, nickname)
}

export function getCodeFromHash() {
  const queryString = window.location.hash.split('?')[1]
  const params = new URLSearchParams(queryString ?? '')
  return normalizeCode(params.get('code') ?? params.get('session') ?? '')
}

export function useFirebaseUser() {
  const [user, setUser] = useState<User | null>(auth.currentUser)
  const [loading, setLoading] = useState(true)
  useEffect(() => onAuthStateChanged(auth, next => { setUser(next); setLoading(false) }), [])
  return {
    user,
    loading,
    isGoogleUser: Boolean(user && !user.isAnonymous && user.providerData.some(provider => provider.providerId === 'google.com')),
  }
}

export async function ensureAnonymousUser() {
  if (auth.currentUser) return auth.currentUser
  return (await signInAnonymously(auth)).user
}

export async function signInAsHost() {
  const provider = new GoogleAuthProvider()
  provider.setCustomParameters({ prompt: 'select_account' })
  return (await signInWithPopup(auth, provider)).user
}

export async function signOutHost() {
  await signOut(auth)
  await ensureAnonymousUser()
}

export function useQuestion(codeValue: string, enabled = true) {
  const code = normalizeCode(codeValue)
  const [question, setQuestion] = useState<QuestionActivity | null>(null)
  const [loading, setLoading] = useState(Boolean(code && enabled))
  const [error, setError] = useState('')
  useEffect(() => {
    if (!isValidQuestionCode(code) || !enabled) { setQuestion(null); setLoading(false); return }
    setLoading(true); setError('')
    return onSnapshot(doc(db, 'questions', code), snapshot => {
      if (snapshot.exists()) {
        const data = snapshot.data() as QuestionActivity
        const fallbackSessionKey = parseQuestionCode(code)?.sessionKey ?? ''
        setQuestion({ ...data, sessionKey: data.sessionKey ?? fallbackSessionKey })
      } else {
        setQuestion(null)
      }
      if (!snapshot.exists()) setError('Question code not found.')
      setLoading(false)
    }, reason => { setError(reason.message); setLoading(false) })
  }, [code, enabled])
  return { question, loading, error }
}

export function useScoreboard(enabled = true) {
  const [config, setConfig] = useState<ScoreboardConfig | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!enabled) { setLoading(false); return }
    return onSnapshot(doc(db, 'config', 'scoreboard'), snapshot => {
      setConfig(snapshot.exists() ? snapshot.data() as ScoreboardConfig : null)
      setLoading(false)
    }, reason => { setError(reason.message); setLoading(false) })
  }, [enabled])
  useEffect(() => {
    if (!enabled || !config?.activeRoundId) { setPlayers([]); return }
    return onSnapshot(collection(db, 'scoreboardRounds', config.activeRoundId, 'players'), snapshot => {
      setPlayers(snapshot.docs.map(item => item.data() as Player))
    }, reason => setError(reason.message))
  }, [config?.activeRoundId, enabled])
  return { config, players, loading, error }
}

export function useAnswerKey(codeValue: string, enabled: boolean) {
  const code = normalizeCode(codeValue)
  const [answerKey, setAnswerKey] = useState<AnswerKey | null>(null)
  useEffect(() => {
    if (!isValidQuestionCode(code) || !enabled) { setAnswerKey(null); return }
    return onSnapshot(doc(db, 'questions', code, 'private', 'answerKey'), snapshot => {
      setAnswerKey(snapshot.exists() ? snapshot.data() as AnswerKey : null)
    })
  }, [code, enabled])
  return answerKey
}

export function useStudentAnswer(codeValue: string, roundId: string, uid?: string) {
  const code = normalizeCode(codeValue)
  const [answer, setAnswer] = useState<Answer | null>(null)
  useEffect(() => {
    if (!isValidQuestionCode(code) || !roundId || !uid) { setAnswer(null); return }
    return onSnapshot(doc(db, 'questions', code, 'answers', `${roundId}_${uid}`), snapshot => {
      setAnswer(snapshot.exists() ? snapshot.data() as Answer : null)
    })
  }, [code, roundId, uid])
  return answer
}

export function useQuestionAnswers(codeValue: string, roundId: string, enabled: boolean) {
  const code = normalizeCode(codeValue)
  const [answers, setAnswers] = useState<Answer[]>([])
  useEffect(() => {
    if (!isValidQuestionCode(code) || !roundId || !enabled) { setAnswers([]); return }
    const answerQuery = query(collection(db, 'questions', code, 'answers'), where('roundId', '==', roundId))
    return onSnapshot(answerQuery, snapshot => setAnswers(snapshot.docs.map(item => item.data() as Answer)))
  }, [code, roundId, enabled])
  return answers
}

export function useHostRecords(hostUid: string | undefined, enabled: boolean) {
  const [rounds, setRounds] = useState<HostRoundRecord[]>([])
  const [questions, setQuestions] = useState<HostQuestionRecord[]>([])
  const [loading, setLoading] = useState(enabled)
  const [error, setError] = useState('')
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    if (!enabled || !hostUid) { setRounds([]); setQuestions([]); setLoading(false); return }
    let cancelled = false
    setLoading(true); setError('')
    async function load() {
      try {
        const [roundsSnapshot, questionsSnapshot] = await Promise.all([
          getDocs(query(collection(db, 'scoreboardRounds'), where('hostUid', '==', hostUid))),
          getDocs(query(collection(db, 'questions'), where('hostUid', '==', hostUid))),
        ])
        const [roundRecords, questionRecords] = await Promise.all([
          Promise.all(roundsSnapshot.docs.map(async roundDocument => ({
            ...(roundDocument.data() as ScoreboardRound),
            id: roundDocument.id,
            players: (await getDocs(collection(db, 'scoreboardRounds', roundDocument.id, 'players'))).docs.map(item => item.data() as Player),
          }))),
          Promise.all(questionsSnapshot.docs.map(async questionDocument => {
            const [keySnapshot, answersSnapshot] = await Promise.all([
              getDoc(doc(db, 'questions', questionDocument.id, 'private', 'answerKey')),
              getDocs(collection(db, 'questions', questionDocument.id, 'answers')),
            ])
            return {
              ...(questionDocument.data() as QuestionActivity),
              code: questionDocument.id,
              answerKey: keySnapshot.exists() ? (keySnapshot.data() as AnswerKey).correctOptions : [],
              answers: answersSnapshot.docs.map(item => item.data() as Answer),
            }
          })),
        ])
        if (cancelled) return
        setRounds(roundRecords.sort((first, second) => (second.createdAt?.toMillis() ?? 0) - (first.createdAt?.toMillis() ?? 0)))
        setQuestions(questionRecords.sort((first, second) => first.code.localeCompare(second.code)))
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : 'Unable to load class records.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [enabled, hostUid, revision])
  return { rounds, questions, loading, error, refresh: () => setRevision(value => value + 1) }
}

function multiplierTokenId(uid: string, sessionKey: string, multiplier: Multiplier) {
  const kind = multiplier === 0.5 ? 'half' : 'boost'
  return `${uid}_${sessionKey}_${kind}`
}

export function useMultiplierUsage(roundId: string, uid: string | undefined, sessionKey: string) {
  const [usage, setUsage] = useState<MultiplierUsage>({ usedHalf: false, usedBoost: false })
  useEffect(() => {
    if (!roundId || !uid || !sessionKey) { setUsage({ usedHalf: false, usedBoost: false }); return }
    const halfId = multiplierTokenId(uid, sessionKey, 0.5)
    const boostId = multiplierTokenId(uid, sessionKey, 1.5)
    let half = false, boost = false
    const publish = () => setUsage({ usedHalf: half, usedBoost: boost })
    const unsubscribeHalf = onSnapshot(doc(db, 'scoreboardRounds', roundId, 'multiplierUses', halfId), snapshot => { half = snapshot.exists(); publish() })
    const unsubscribeBoost = onSnapshot(doc(db, 'scoreboardRounds', roundId, 'multiplierUses', boostId), snapshot => { boost = snapshot.exists(); publish() })
    return () => { unsubscribeHalf(); unsubscribeBoost() }
  }, [roundId, sessionKey, uid])
  return usage
}

async function ensureScoreboard(user: User) {
  const configReference = doc(db, 'config', 'scoreboard')
  const configSnapshot = await getDoc(configReference)
  if (configSnapshot.exists()) {
    const config = configSnapshot.data() as ScoreboardConfig
    if (config.hostUid !== user.uid) throw new Error('This scoreboard is managed by another instructor account.')
    return config
  }
  const roundId = `round-${Date.now().toString(36)}`
  const batch = writeBatch(db)
  batch.set(doc(db, 'scoreboardRounds', roundId), { id: roundId, hostUid: user.uid, createdAt: serverTimestamp() })
  batch.set(configReference, { activeRoundId: roundId, hostUid: user.uid, updatedAt: serverTimestamp() })
  await batch.commit()
  return { activeRoundId: roundId, hostUid: user.uid }
}

export async function startNewScoreboardRound(user: User) {
  const config = await ensureScoreboard(user)
  if (config.hostUid !== user.uid) throw new Error('You do not have permission to reset this scoreboard.')
  const roundId = `round-${Date.now().toString(36)}`
  const batch = writeBatch(db)
  batch.set(doc(db, 'scoreboardRounds', roundId), { id: roundId, hostUid: user.uid, createdAt: serverTimestamp() })
  batch.update(doc(db, 'config', 'scoreboard'), { activeRoundId: roundId, updatedAt: serverTimestamp() })
  await batch.commit()
  return roundId
}

export async function prepareQuestion(user: User, codeValue: string, options: number[]) {
  if (user.isAnonymous) throw new Error('Sign in with your instructor Google account first.')
  const parsed = parseQuestionCode(codeValue)
  if (!parsed) throw new Error('Question codes must follow the format 0S1Q01.')
  const correctOptions = [...new Set(options)].sort((a, b) => a - b)
  if (!correctOptions.length) throw new Error('Select at least one correct answer.')
  const config = await ensureScoreboard(user)
  const reference = doc(db, 'questions', parsed.code)
  const existing = await getDoc(reference)
  if (existing.exists() && existing.data().hostUid !== user.uid) throw new Error('Another instructor already created this question code.')
  await setDoc(reference, {
    ...parsed,
    hostUid: user.uid,
    roundId: config.activeRoundId,
    isOpen: false,
    revealedOptions: [],
    createdAt: existing.exists() ? existing.data().createdAt : serverTimestamp(),
    updatedAt: serverTimestamp(),
  })
  await setDoc(doc(db, 'questions', parsed.code, 'private', 'answerKey'), { correctOptions, updatedAt: serverTimestamp() })
  storeQuestionCode(parsed.code)
  return parsed.code
}

export async function joinQuestion(codeValue: string, nicknameValue: string) {
  const code = normalizeCode(codeValue)
  if (!isValidQuestionCode(code)) throw new Error('Question codes must follow the format 0S1Q01.')
  const nickname = nicknameValue.trim().slice(0, 20)
  if (!nickname) throw new Error('Enter a nickname.')
  const user = await ensureAnonymousUser()
  const [questionSnapshot, configSnapshot] = await Promise.all([
    getDoc(doc(db, 'questions', code)), getDoc(doc(db, 'config', 'scoreboard')),
  ])
  if (!questionSnapshot.exists()) throw new Error('Question code not found.')
  if (!configSnapshot.exists()) throw new Error('There is no active scoreboard.')
  const question = questionSnapshot.data() as QuestionActivity
  const config = configSnapshot.data() as ScoreboardConfig
  if (question.roundId !== config.activeRoundId) throw new Error('This question is not part of the active scoreboard.')
  const playerReference = doc(db, 'scoreboardRounds', question.roundId, 'players', user.uid)
  const playerSnapshot = await getDoc(playerReference)
  if (playerSnapshot.exists()) await updateDoc(playerReference, { nickname })
  else await setDoc(playerReference, { id: user.uid, nickname, score: 0, tieBreakTimeMs: 0, joinedAt: serverTimestamp() })
  storeQuestionCode(code); storeNickname(nickname)
  return code
}

export async function submitAnswer(codeValue: string, roundId: string, sessionKey: string, selectionsValue: number[], uid: string) {
  const code = normalizeCode(codeValue)
  const selections = [...new Set(selectionsValue)].sort((a, b) => a - b)
  if (!selections.length || selections.some(value => value < 0 || value > 7)) throw new Error('Select at least one option from A–H.')
  if (!/^S\d$/.test(sessionKey)) throw new Error('This question has an invalid session setting. Ask the instructor to save it again.')
  const answerId = `${roundId}_${uid}`
  const batch = writeBatch(db)
  batch.set(doc(db, 'questions', code, 'answers', answerId), {
    id: answerId, studentUid: uid, roundId, sessionKey, selections, multiplier: 1, scoringMode: 'standard', awarded: false, submittedAt: serverTimestamp(),
  })
  await batch.commit()
}

export async function setQuestionOpen(codeValue: string, isOpen: boolean) {
  const updates = isOpen
    ? { isOpen: true, revealedOptions: [], openedAt: serverTimestamp(), updatedAt: serverTimestamp() }
    : { isOpen: false, updatedAt: serverTimestamp() }
  await updateDoc(doc(db, 'questions', normalizeCode(codeValue)), updates)
}

function arraysEqual(first: number[], second: number[]) {
  return first.length === second.length && first.every((value, index) => value === second[index])
}

export async function closeQuestionAndScore(codeValue: string) {
  const code = normalizeCode(codeValue)
  const [questionSnapshot, keySnapshot] = await Promise.all([
    getDoc(doc(db, 'questions', code)), getDoc(doc(db, 'questions', code, 'private', 'answerKey')),
  ])
  if (!questionSnapshot.exists() || !keySnapshot.exists()) throw new Error('Question or answer settings not found.')
  const question = questionSnapshot.data() as QuestionActivity
  const openedAtMs = question.openedAt?.toMillis()
  const correctOptions = [...(keySnapshot.data().correctOptions as number[])].sort((a, b) => a - b)
  const answersSnapshot = await getDocs(query(collection(db, 'questions', code, 'answers'), where('roundId', '==', question.roundId)))
  const pending = answersSnapshot.docs.filter(item => item.data().awarded !== true)
  if (pending.length > 200) throw new Error('A single question can score up to 200 students at a time.')
  const batch = writeBatch(db)
  batch.update(doc(db, 'questions', code), { isOpen: false, revealedOptions: correctOptions, updatedAt: serverTimestamp() })
  pending.forEach(answerDocument => {
    const answer = answerDocument.data() as Answer
    const isCorrect = arraysEqual([...answer.selections].sort((a, b) => a - b), correctOptions)
    const points = answer.scoringMode === 'standard'
      ? (isCorrect ? 1000 : 0)
      : (isCorrect ? 1000 : -500) * (answer.multiplier ?? 1)
    const submittedAtMs = answer.submittedAt?.toMillis()
    const responseTimeMs = openedAtMs !== undefined && submittedAtMs !== undefined
      ? Math.max(0, submittedAtMs - openedAtMs)
      : undefined
    batch.update(answerDocument.ref, {
      awarded: true,
      points,
      ...(responseTimeMs !== undefined ? { responseTimeMs } : {}),
    })
    batch.update(doc(db, 'scoreboardRounds', question.roundId, 'players', answer.studentUid), {
      score: increment(points),
      ...(isCorrect && responseTimeMs !== undefined ? { tieBreakTimeMs: increment(responseTimeMs) } : {}),
    })
  })
  await batch.commit()
}
