import { useEffect, useState } from 'react'
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInAnonymously,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Timestamp,
} from 'firebase/firestore'
import { auth, db } from './firebase'

export type Question = { id: string; order: number; prompt: string; options: string[] }
export type Player = { id: string; nickname: string; team: string; score: number; joinedAt?: Timestamp }
export type Answer = { id: string; studentUid: string; questionId: string; selectedIndex: number; awarded: boolean }
export type Classroom = {
  code: string
  hostUid: string
  currentQuestionId: string
  currentQuestionIndex: number
  isQuestionOpen: boolean
  revealedAnswers: Record<string, number>
  createdAt?: Timestamp
}

const SESSION_KEY = 'quickclass-session-code-v2'
const CODE_CHARACTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

const questionSeed = [
  { id: 'q1', prompt: '下列哪一項最符合「形成性評量」的目的？', options: ['計算期末總成績', '在學習過程中提供回饋', '決定學校排名', '篩選入學資格'], correctIndex: 1 },
  { id: 'q2', prompt: '在網頁中，哪個 HTML 元素最適合表示主要導覽？', options: ['<section>', '<header>', '<nav>', '<aside>'], correctIndex: 2 },
  { id: 'q3', prompt: '72 ÷ 8 + 6 的答案是多少？', options: ['9', '12', '15', '18'], correctIndex: 2 },
  { id: 'q4', prompt: '哪一種做法最能保護你的網路帳號？', options: ['重複使用同一組密碼', '開啟多因素驗證', '把密碼傳給朋友', '使用生日當密碼'], correctIndex: 1 },
]

export function normalizeCode(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)
}

export function getStoredSessionCode() {
  return localStorage.getItem(SESSION_KEY) ?? ''
}

export function storeSessionCode(code: string) {
  localStorage.setItem(SESSION_KEY, normalizeCode(code))
}

export function getCodeFromHash() {
  const queryString = window.location.hash.split('?')[1]
  return normalizeCode(new URLSearchParams(queryString ?? '').get('session') ?? '')
}

export function useFirebaseUser() {
  const [user, setUser] = useState<User | null>(auth.currentUser)
  const [loading, setLoading] = useState(true)
  useEffect(() => onAuthStateChanged(auth, nextUser => { setUser(nextUser); setLoading(false) }), [])
  return { user, loading, isGoogleUser: Boolean(user && !user.isAnonymous && user.providerData.some(provider => provider.providerId === 'google.com')) }
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

function randomCode() {
  const values = crypto.getRandomValues(new Uint32Array(6))
  return Array.from(values, value => CODE_CHARACTERS[value % CODE_CHARACTERS.length]).join('')
}

export async function createClassroom(user: User) {
  if (user.isAnonymous || !user.providerData.some(provider => provider.providerId === 'google.com')) throw new Error('請先使用 Google 講師帳號登入。')
  let code = ''
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const candidate = randomCode()
    if (!(await getDoc(doc(db, 'sessions', candidate))).exists()) { code = candidate; break }
  }
  if (!code) throw new Error('無法建立唯一課堂代碼，請稍後再試。')

  await setDoc(doc(db, 'sessions', code), {
    code,
    hostUid: user.uid,
    currentQuestionId: questionSeed[0].id,
    currentQuestionIndex: 0,
    isQuestionOpen: false,
    revealedAnswers: {},
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  })

  const batch = writeBatch(db)
  questionSeed.forEach((questionItem, order) => {
    batch.set(doc(db, 'sessions', code, 'questions', questionItem.id), {
      id: questionItem.id, order, prompt: questionItem.prompt, options: questionItem.options,
    })
    batch.set(doc(db, 'sessions', code, 'answerKeys', questionItem.id), {
      questionId: questionItem.id, correctIndex: questionItem.correctIndex,
    })
  })
  await batch.commit()
  storeSessionCode(code)
  return code
}

export async function joinClassroom(codeValue: string, nickname: string) {
  const code = normalizeCode(codeValue)
  const team = '個人'
  const user = await ensureAnonymousUser()
  const sessionSnapshot = await getDoc(doc(db, 'sessions', code))
  if (!sessionSnapshot.exists()) throw new Error('找不到這個課堂代碼，請向講師確認。')
  const playerReference = doc(db, 'sessions', code, 'players', user.uid)
  const playerSnapshot = await getDoc(playerReference)
  if (playerSnapshot.exists()) {
    await updateDoc(playerReference, { nickname, team })
  } else {
    await setDoc(playerReference, { id: user.uid, nickname, team, score: 0, joinedAt: serverTimestamp() })
  }
  storeSessionCode(code)
  return code
}

export function useClassroom(codeValue: string, enabled = true) {
  const code = normalizeCode(codeValue)
  const [session, setSession] = useState<Classroom | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [players, setPlayers] = useState<Player[]>([])
  const [loading, setLoading] = useState(Boolean(code && enabled))
  const [error, setError] = useState('')

  useEffect(() => {
    if (!code || !enabled) { setLoading(false); return }
    setLoading(true); setError('')
    const fail = (reason: Error) => { setError(reason.message); setLoading(false) }
    const unsubSession = onSnapshot(doc(db, 'sessions', code), snapshot => {
      setSession(snapshot.exists() ? snapshot.data() as Classroom : null)
      if (!snapshot.exists()) setError('找不到這個課堂。')
      setLoading(false)
    }, fail)
    const unsubQuestions = onSnapshot(query(collection(db, 'sessions', code, 'questions'), orderBy('order')), snapshot => {
      setQuestions(snapshot.docs.map(item => item.data() as Question))
    }, fail)
    const unsubPlayers = onSnapshot(collection(db, 'sessions', code, 'players'), snapshot => {
      setPlayers(snapshot.docs.map(item => item.data() as Player))
    }, fail)
    return () => { unsubSession(); unsubQuestions(); unsubPlayers() }
  }, [code, enabled])

  return { session, questions, players, loading, error }
}

export function useStudentAnswer(codeValue: string, questionId: string, uid?: string) {
  const [answer, setAnswer] = useState<Answer | null>(null)
  useEffect(() => {
    const code = normalizeCode(codeValue)
    if (!code || !questionId || !uid) { setAnswer(null); return }
    return onSnapshot(doc(db, 'sessions', code, 'answers', `${uid}_${questionId}`), snapshot => {
      setAnswer(snapshot.exists() ? snapshot.data() as Answer : null)
    })
  }, [codeValue, questionId, uid])
  return answer
}

export function useQuestionAnswers(codeValue: string, questionId: string, enabled: boolean) {
  const [answers, setAnswers] = useState<Answer[]>([])
  useEffect(() => {
    const code = normalizeCode(codeValue)
    if (!code || !questionId || !enabled) { setAnswers([]); return }
    const answerQuery = query(collection(db, 'sessions', code, 'answers'), where('questionId', '==', questionId))
    return onSnapshot(answerQuery, snapshot => setAnswers(snapshot.docs.map(item => item.data() as Answer)))
  }, [codeValue, questionId, enabled])
  return answers
}

export async function submitAnswer(codeValue: string, questionId: string, selectedIndex: number, uid: string) {
  const code = normalizeCode(codeValue)
  await setDoc(doc(db, 'sessions', code, 'answers', `${uid}_${questionId}`), {
    id: `${uid}_${questionId}`,
    studentUid: uid,
    questionId,
    selectedIndex,
    awarded: false,
    submittedAt: serverTimestamp(),
  })
}

export async function setQuestionOpen(codeValue: string, isOpen: boolean) {
  await updateDoc(doc(db, 'sessions', normalizeCode(codeValue)), { isQuestionOpen: isOpen, updatedAt: serverTimestamp() })
}

export async function closeQuestionAndScore(codeValue: string, questionId: string) {
  const code = normalizeCode(codeValue)
  const keySnapshot = await getDoc(doc(db, 'sessions', code, 'answerKeys', questionId))
  if (!keySnapshot.exists()) throw new Error('找不到這一題的答案。')
  const correctIndex = keySnapshot.data().correctIndex as number
  const answersSnapshot = await getDocs(query(collection(db, 'sessions', code, 'answers'), where('questionId', '==', questionId)))
  const pendingAnswers = answersSnapshot.docs.filter(item => item.data().awarded !== true)
  if (pendingAnswers.length > 200) throw new Error('單次結算最多支援 200 位學生，請聯絡管理者。')

  const batch = writeBatch(db)
  batch.update(doc(db, 'sessions', code), {
    isQuestionOpen: false,
    [`revealedAnswers.${questionId}`]: correctIndex,
    updatedAt: serverTimestamp(),
  })
  pendingAnswers.forEach(answerDocument => {
    const answerData = answerDocument.data() as Answer
    batch.update(answerDocument.ref, { awarded: true })
    if (answerData.selectedIndex === correctIndex) {
      batch.update(doc(db, 'sessions', code, 'players', answerData.studentUid), { score: increment(1000) })
    }
  })
  await batch.commit()
}

export async function changeQuestion(codeValue: string, questions: Question[], nextIndex: number) {
  const safeIndex = Math.max(0, Math.min(nextIndex, questions.length - 1))
  await updateDoc(doc(db, 'sessions', normalizeCode(codeValue)), {
    currentQuestionIndex: safeIndex,
    currentQuestionId: questions[safeIndex].id,
    isQuestionOpen: false,
    updatedAt: serverTimestamp(),
  })
}
