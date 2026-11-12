import AsyncStorage from "@react-native-async-storage/async-storage";
import { collection, doc } from "firebase/firestore";
import app, { db } from "../firebaseConfig";
import { currentDraftSession } from "./inspectionDraftStorage";
import { createLocalFireAlarmDraftStore } from "./localFireAlarmDraftStore";

// Reuse the existing auth epoch/storage backend; namespace and schema stay separate.
export const fireAlarmDraftStorage = createLocalFireAlarmDraftStore({ storage: AsyncStorage, projectId: app.options.projectId!,
  getSession: currentDraftSession, generateId: () => doc(collection(db, "_localFireAlarmIds")).id });
// doc(collection(...)) allocates only a local ID. No Firebase reads/writes/transport.
