/** Stored data must never override the authoritative Firestore document ID. */
export function mapFirestoreDocument(document) {
  return { ...document.data(), id: document.id };
}
