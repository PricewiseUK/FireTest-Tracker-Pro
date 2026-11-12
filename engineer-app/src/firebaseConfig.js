import { initializeApp } from "firebase/app";
import { initializeAuth, getReactNativePersistence } from "firebase/auth";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

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
const app = initializeApp(firebaseConfig);

// Firebase services
export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
});
export const db = getFirestore(app);

export const storage = getStorage(app);

export default app;
