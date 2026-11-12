import assert from "node:assert/strict";
import test from "node:test";
import { mapFirestoreDocument } from "../../engineer-app/src/utils/firestoreDocument.mjs";

test("asset identity comes from Firestore even when stored data contains id", () => {
  const data = { id: "forged-id", assetId: "EXT001", location: "Lobby" };
  const asset = mapFirestoreDocument({ id: "actual-document-id", data: () => data });
  assert.equal(asset.id, "actual-document-id");
  assert.equal(asset.assetId, "EXT001");
  assert.equal(asset.location, "Lobby");
  assert.equal(data.id, "forged-id");
});

test("legacy assets without a stored id retain their fields", () => {
  assert.deepEqual(mapFirestoreDocument({ id: "legacy", data: () => ({ type: "Water" }) }), {
    type: "Water", id: "legacy",
  });
});
