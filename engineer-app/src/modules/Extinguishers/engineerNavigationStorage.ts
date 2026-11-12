import AsyncStorage from "@react-native-async-storage/async-storage";
import app from "../../firebaseConfig";
import { currentDraftSession, inspectionDraftStorage } from "../../services/inspectionDraftStorage";
import { createEngineerNavigation } from "./engineerNavigation";

export const engineerNavigationStorage = createEngineerNavigation({ storage: AsyncStorage, projectId: app.options.projectId!, getSession: currentDraftSession, draftStore: inspectionDraftStorage });
