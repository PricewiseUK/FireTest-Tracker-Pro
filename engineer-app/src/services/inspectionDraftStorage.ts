import AsyncStorage from "@react-native-async-storage/async-storage";
import { onAuthStateChanged } from "firebase/auth";
import { collection, doc } from "firebase/firestore";
import app, { auth, db } from "../firebaseConfig";
import { createLocalInspectionDraftStore } from "./localInspectionDraftStore";

// One store/queue per application JS runtime. No Firebase writes or token access.
let currentUserId = auth.currentUser?.uid ?? null;
let epoch = 0;
function observeUser(userId: string | null) {
  if (userId !== currentUserId) { currentUserId = userId; epoch++; }
}
onAuthStateChanged(auth, (user) => observeUser(user?.uid ?? null));

export function currentDraftSession() {
  observeUser(auth.currentUser?.uid ?? null);
  return { userId: currentUserId, epoch };
}
export const inspectionDraftStorage = createLocalInspectionDraftStore({
  storage: AsyncStorage,
  projectId: app.options.projectId!,
  getSession: currentDraftSession,
  allowDevelopmentChecklistReplacement: __DEV__,
  // Firestore auto-ID generation is local; it does not create a document.
  generateId: () => doc(collection(db, "_localInspectionIds")).id,
});
