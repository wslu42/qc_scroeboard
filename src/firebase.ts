import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

// Firebase Web configuration is a public project identifier, not a server secret.
// Access is enforced by Firebase Authentication and firestore.rules.
const firebaseConfig = {
  apiKey: 'AIzaSyAdsgFuawwooxnyQJehAzRltjrfIZkrqjk',
  authDomain: 'qc-scoreboard-69c7b.firebaseapp.com',
  projectId: 'qc-scoreboard-69c7b',
  storageBucket: 'qc-scoreboard-69c7b.firebasestorage.app',
  messagingSenderId: '550155593386',
  appId: '1:550155593386:web:e63930740471e90cd452d3',
}

export const firebaseApp = initializeApp(firebaseConfig)
export const auth = getAuth(firebaseApp)
export const db = getFirestore(firebaseApp)
