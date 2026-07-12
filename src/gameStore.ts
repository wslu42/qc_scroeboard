import { useSyncExternalStore } from 'react'

export type Question = { id: string; prompt: string; options: string[]; correctIndex: number }
export type Player = { id: string; nickname: string; team: string; score: number; answers: Record<string, number> }
export type GameState = { questions: Question[]; players: Player[]; questionIndex: number; isQuestionOpen: boolean; revision: number }

const STORAGE_KEY = 'quickclass-game-v1', STUDENT_KEY = 'quickclass-student-v1', CHANNEL_NAME = 'quickclass-live'
const questions: Question[] = [
  { id: 'q1', prompt: '下列哪一項最符合「形成性評量」的目的？', options: ['計算期末總成績', '在學習過程中提供回饋', '決定學校排名', '篩選入學資格'], correctIndex: 1 },
  { id: 'q2', prompt: '在網頁中，哪個 HTML 元素最適合表示主要導覽？', options: ['<section>', '<header>', '<nav>', '<aside>'], correctIndex: 2 },
  { id: 'q3', prompt: '72 ÷ 8 + 6 的答案是多少？', options: ['9', '12', '15', '18'], correctIndex: 2 },
  { id: 'q4', prompt: '哪一種做法最能保護你的網路帳號？', options: ['重複使用同一組密碼', '開啟多因素驗證', '把密碼傳給朋友', '使用生日當密碼'], correctIndex: 1 },
]

function initialState(): GameState { return { questions, players: [
  { id: 'demo-1', nickname: 'Mia', team: '藍隊', score: 3000, answers: {} },
  { id: 'demo-2', nickname: 'Leo', team: '橘隊', score: 2000, answers: {} },
  { id: 'demo-3', nickname: 'Ava', team: '藍隊', score: 1000, answers: {} },
  { id: 'demo-4', nickname: 'Noah', team: '綠隊', score: 0, answers: {} },
], questionIndex: 0, isQuestionOpen: false, revision: 0 } }

function readState(): GameState { try { const stored = localStorage.getItem(STORAGE_KEY); return stored ? JSON.parse(stored) as GameState : initialState() } catch { return initialState() } }
let snapshot = readState()
const listeners = new Set<() => void>()
const channel = 'BroadcastChannel' in window ? new BroadcastChannel(CHANNEL_NAME) : null
function emit(nextState?: GameState) { snapshot = nextState ?? readState(); listeners.forEach(listener => listener()) }
window.addEventListener('storage', event => { if (event.key === STORAGE_KEY && event.newValue) { try { emit(JSON.parse(event.newValue) as GameState) } catch { /* Ignore malformed local demo data. */ } } })
channel?.addEventListener('message', (event: MessageEvent<GameState>) => emit(event.data))
function commit(mutator: (draft: GameState) => void) { const draft = structuredClone(readState()); mutator(draft); draft.revision += 1; localStorage.setItem(STORAGE_KEY, JSON.stringify(draft)); emit(draft); channel?.postMessage(draft) }
function subscribe(listener: () => void) { listeners.add(listener); return () => listeners.delete(listener) }
export function useGameState() { return useSyncExternalStore(subscribe, () => snapshot) }
export function getStudentId() { return sessionStorage.getItem(STUDENT_KEY) }
export function setStudentId(id: string) { sessionStorage.setItem(STUDENT_KEY, id) }
export function joinGame(player: Pick<Player, 'id' | 'nickname' | 'team'>) { commit(draft => { draft.players.push({ ...player, score: 0, answers: {} }) }) }
export function answerQuestion(playerId: string, questionId: string, optionIndex: number) { commit(draft => { if (!draft.isQuestionOpen || draft.questions[draft.questionIndex]?.id !== questionId) return; const player = draft.players.find(item => item.id === playerId); if (!player || player.answers[questionId] !== undefined) return; player.answers[questionId] = optionIndex; const question = draft.questions.find(item => item.id === questionId); if (question?.correctIndex === optionIndex) player.score += 1000 }) }
export function openQuestion() { commit(draft => { draft.isQuestionOpen = true }) }
export function closeQuestion() { commit(draft => { draft.isQuestionOpen = false }) }
export function nextQuestion() { commit(draft => { draft.questionIndex = Math.min(draft.questionIndex + 1, draft.questions.length - 1); draft.isQuestionOpen = false }) }
export function previousQuestion() { commit(draft => { draft.questionIndex = Math.max(draft.questionIndex - 1, 0); draft.isQuestionOpen = false }) }
export function resetDemo() { const fresh = initialState(); localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh)); emit(fresh); channel?.postMessage(fresh) }
