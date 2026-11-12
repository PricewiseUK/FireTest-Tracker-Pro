import { initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import { connectStorageEmulator, getStorage } from "firebase/storage";

// Firebase project configuration
const firebaseConfig = {
  apiKey: "AIzaSyAOa04yxfyHr76fANj2FPG9KtDbFnOQ-is",

  authDomain: "instafire-62d54.firebaseapp.com",

  projectId: "instafire-62d54",

  storageBucket: "instafire-62d54.firebasestorage.app",

  messagingSenderId: "446856780048",

  appId: "1:446856780048:web:ce38fd568e0f77e2f52d95",
};

// Initialise Firebase
const app = initializeApp(import.meta.env.VITE_FIREBASE_EMULATORS === 'true'
  ? { ...firebaseConfig, apiKey: 'demo-api-key', projectId: 'demo-instafire-accounting', authDomain: 'demo-instafire-accounting.firebaseapp.com', storageBucket: 'demo-instafire-accounting.appspot.com' }
  : firebaseConfig);

// Firebase services
export const auth = getAuth(app);
export const db = getFirestore(app);

export const storage = getStorage(app);
if (import.meta.env.VITE_FIREBASE_EMULATORS === 'true') {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
  connectStorageEmulator(storage, '127.0.0.1', 9199);
}

export default app;
