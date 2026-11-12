import { randomUUID } from "node:crypto";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { Firestore, FieldValue } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { createCataloguePublisher, type CataloguePublicationBackend } from "./publication.ts";

export const CATALOGUE_DEMO_PROJECT = "demo-instafire-catalogue";
/** Never fall back to ADC, production endpoints, arbitrary hosts or another project. */
export function assertCatalogueEmulators(env: NodeJS.ProcessEnv = process.env) {
  if (env.GCLOUD_PROJECT !== CATALOGUE_DEMO_PROJECT || env.GOOGLE_CLOUD_PROJECT !== CATALOGUE_DEMO_PROJECT
    || env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8080" || env.FIREBASE_AUTH_EMULATOR_HOST !== "127.0.0.1:9099") {
    throw new Error("CATALOGUE_LOCAL_EMULATORS_REQUIRED");
  }
}

/** Local trusted bootstrap for tests/scripts only; never a deployed endpoint. */
export function createCatalogueEmulatorRuntime() {
  assertCatalogueEmulators();
  const app = initializeApp({ projectId: CATALOGUE_DEMO_PROJECT,
    credential: { async getAccessToken() { assertCatalogueEmulators(); return { access_token: "owner", expires_in: 3600 }; } },
  }, `catalogue-emulator-${randomUUID()}`);
  // Explicit server Firestore transport: no application-default credential lookup.
  // Local insecure emulator transport uses its emulator-only owner identity.
  const firestore = new Firestore({ projectId: CATALOGUE_DEMO_PROJECT, host: "127.0.0.1:8080", ssl: false });
  const auth = getAuth(app);
  return { firestore, auth, close: async () => { await firestore.terminate(); await deleteApp(app); } };
}

/** Token must come from the local Auth emulator; central grant checked by policy. */
export function createEmulatorCataloguePublisher(idToken: string) {
  assertCatalogueEmulators();
  if (typeof idToken !== "string" || !idToken) throw new Error("PUBLISHER_AUTH_REQUIRED");
  const runtime = createCatalogueEmulatorRuntime();
  const backend: CataloguePublicationBackend = {
    async verifyCaller() {
      assertCatalogueEmulators();
      const decoded = await runtime.auth.verifyIdToken(idToken, true);
      // Emulated tokens are intentionally unsigned, rejected by a production adapter.
      if (decoded.aud !== CATALOGUE_DEMO_PROJECT || decoded.iss !== `https://securetoken.google.com/${CATALOGUE_DEMO_PROJECT}`) throw new Error("PUBLISHER_AUTH_REQUIRED");
      return { uid: decoded.uid };
    },
    serverTimestamp: () => { assertCatalogueEmulators(); return FieldValue.serverTimestamp(); },
    runTransaction: (operation) => {
      assertCatalogueEmulators();
      return runtime.firestore.runTransaction(async (transaction) => {
        assertCatalogueEmulators();
        return operation({
          async get(path) { assertCatalogueEmulators(); const record = await transaction.get(runtime.firestore.doc(path)); assertCatalogueEmulators(); return record.exists ? record.data()! : null; },
          create(path, data) { assertCatalogueEmulators(); transaction.create(runtime.firestore.doc(path), data); },
        });
      });
    },
  };
  return { ...createCataloguePublisher(backend), close: runtime.close };
}
