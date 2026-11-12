import type { Timestamp } from "firebase/firestore";

/** No servicing questions are shipped here. Definitions require technical approval. */
export interface ExtinguisherInspectionTemplateV1 {
  schemaVersion: 1;
  version: number;
  status: "approved";
  equipmentType: string;
  serviceType: string;
  /** One to eight unique, ordered questions; never edit a published version. */
  questions: { id: string; label: string; allowNA: boolean }[];
}

export interface ExtinguisherInspectionAnswerV1 {
  questionId: string;
  result: null | "pass" | "fail" | "na";
  /** Fail and N/A require non-whitespace notes; maximum 2,000 characters. */
  notes: string;
}

/** Persisted server record, not the future local draft/outbox format. */
export interface ExtinguisherInspectionV1 {
  schemaVersion: 1;
  companyId: string;
  siteId: string;
  /** Firestore document ID, never a display reference or stored `id` field. */
  assetDocId: string;
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  equipmentType: string;
  serviceType: string;
  templateId: string;
  templateVersion: number;
  assetSnapshot: { type: string; location: string; assetReference: string };
  revision: number;
  /** Exact template order and IDs. All results start null, with empty notes. */
  answers: ExtinguisherInspectionAnswerV1[];
  status: "draft" | "submitted";
  submittedAt: Timestamp | null;
}
