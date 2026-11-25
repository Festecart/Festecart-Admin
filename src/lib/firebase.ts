import { initializeApp, getApps } from 'firebase/app'
import { connectAuthEmulator, getAuth } from 'firebase/auth'
import {
  connectFirestoreEmulator,
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  query,
  where,
  orderBy,
  limit,
  startAfter,
  onSnapshot,
  serverTimestamp,
  Timestamp,
  runTransaction,
  type QueryConstraint,
  type Transaction,
} from 'firebase/firestore'
import { connectStorageEmulator, getStorage } from 'firebase/storage'
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions'

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId:     import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
}

// Prevent duplicate initialisation during HMR
export const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0]

export const auth    = getAuth(app)
export const db      = getFirestore(app, 'festecart')
export const storage = getStorage(app)

if (import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true') {
  if (!app.options.projectId?.startsWith('demo-')) {
    throw new Error('Firebase emulators require a demo-* project ID.')
  }
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  connectFirestoreEmulator(db, '127.0.0.1', 8080)
  connectStorageEmulator(storage, '127.0.0.1', 9199)
  connectFunctionsEmulator(getFunctions(app, 'us-central1'), '127.0.0.1', 5001)
}

// Re-export Firestore helpers so callers only import from this file
export {
  collection, doc, getDoc, getDocs, addDoc, setDoc, updateDoc, deleteDoc, writeBatch,
  query, where, orderBy, limit, startAfter, onSnapshot,
  serverTimestamp, Timestamp, runTransaction,
}
export type { QueryConstraint, Transaction }
