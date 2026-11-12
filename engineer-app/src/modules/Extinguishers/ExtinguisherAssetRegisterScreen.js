import React, { useEffect, useState } from "react";

import {
  View,
  BackHandler,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  FlatList,
} from "react-native";

import { MaterialCommunityIcons } from "@expo/vector-icons";

import { collection, getDocs } from "firebase/firestore";

import { auth, db } from "../../firebaseConfig";
import { mapFirestoreDocument } from "../../utils/firestoreDocument.mjs";
import ExtinguisherInspectionScreen from "./ExtinguisherInspectionScreen";
import { canStartInspection } from "./approvedInspectionAsset";
import { inspectionDraftStorage } from "../../services/inspectionDraftStorage";
import { assetCardDetails, inspectionStatus, readAssetDeviceProgress, siteDeviceProgress, UNKNOWN_PROGRESS } from "./extinguisherAssetPresentation";

const COLORS = {
  background: "#0B0D0E",
  card: "#191D20",
  orange: "#FF641C",
  white: "#FFFFFF",
  grey: "#9CA3AF",
  border: "#30363B",
  red: "#EF4444",
};

export default function ExtinguisherAssetRegisterScreen({
  companyId,
  building,
  goBack,
  userId,
  role,
  assignedSites,
  registerLeaveGuard,
  routine = false,
}) {
  const [assets, setAssets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [inspectionAssetId, setInspectionAssetId] = useState(null);
  const [draftRefresh, setDraftRefresh] = useState(0);
  const [deviceProgress, setDeviceProgress] = useState(null);
  const progressKey = JSON.stringify([companyId, building?.id, userId, role, assignedSites, draftRefresh]);
  const currentProgress = deviceProgress?.key === progressKey ? deviceProgress : UNKNOWN_PROGRESS;
  const summary = siteDeviceProgress(assets, currentProgress);
  useEffect(() => {
    if (inspectionAssetId || !companyId || !building?.id || !userId) return;
    let active = true;
    void (async () => {
      try {
        if (auth.currentUser?.uid !== userId) throw new Error("AUTH_SESSION_CHANGED");
        const result = await readAssetDeviceProgress(inspectionDraftStorage, { companyId, siteId: building.id, userId, role, assignedSites: assignedSites ?? [] });
        if (active && auth.currentUser?.uid === userId) setDeviceProgress({ ...result, key: progressKey });
      } catch { if (active && auth.currentUser?.uid === userId) setDeviceProgress({ ...UNKNOWN_PROGRESS, key: progressKey }); }
    })();
    return () => { active = false; };
  }, [companyId, building?.id, userId, role, assignedSites, progressKey, inspectionAssetId]);
  useEffect(() => {
    if (inspectionAssetId) return;
    const back = BackHandler.addEventListener("hardwareBackPress", () => { goBack(); return true; });
    return () => back.remove();
  }, [inspectionAssetId, goBack]);

  useEffect(() => {
    let active = true;

    async function loadAssets() {
      if (!companyId || !building?.id) {
        setError("Company or building information is missing.");
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError("");

        if (auth.currentUser?.uid !== userId) throw new Error("AUTH_SESSION_CHANGED");
        const assetsRef = collection(
          db,
          "companies",
          companyId,
          "sites",
          building.id,
          "extinguishers",
        );

        const snapshot = await getDocs(assetsRef);

        const results = snapshot.docs.map(mapFirestoreDocument);

        if (active && auth.currentUser?.uid === userId) {
          setAssets(routine ? results.filter((item) => [undefined, "approved", "active"].includes(item.status)) : results);
        }
      } catch (err) {
        console.error("Unable to load extinguisher assets:", err);

        if (active) {
          setError(
            "Unable to load assets. Check your connection or database permissions.",
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadAssets();

    return () => {
      active = false;
    };
  }, [companyId, building?.id, routine, userId]);

  if (inspectionAssetId) return <ExtinguisherInspectionScreen
    key={`${companyId}:${building.id}:${userId}:${inspectionAssetId}`}
    companyId={companyId} siteId={building.id} assetDocId={inspectionAssetId} userId={userId}
    role={role} assignedSites={assignedSites} registerLeaveGuard={registerLeaveGuard}
    backLabel={routine ? "APPROVED EXTINGUISHERS" : "ASSET REGISTER"}
    goBack={() => { setInspectionAssetId(null); setDraftRefresh((value) => value + 1); }} />;

  return (
    <View style={styles.container}>
      {/* FIXED HEADER */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={goBack}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel={routine ? "Back to site selection" : "Back to building details"}
        >
          <MaterialCommunityIcons
            name="arrow-left"
            size={26}
            color={COLORS.white}
          />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>{routine ? "CHOOSE AN EXTINGUISHER" : "EXTINGUISHER ASSETS"}</Text>
      </View>

      {/* FIXED BUILDING INFORMATION */}
      <View style={styles.buildingHeader}>
        <Text style={styles.buildingName}>
          {building?.name || "Not Recorded"}
        </Text>

        <Text style={styles.buildingAddress}>
          {building?.address || "Not Recorded"}
        </Text>
      </View>

      <View style={styles.summary} accessibilityLiveRegion="polite">
        <Text style={styles.summaryLabel}>SITE PROGRESS - DEVICE DRAFTS</Text>
        <View style={styles.summaryCounts}>
          <Text style={styles.summaryValue}>{loading || error ? "—" : summary.total}<Text style={styles.summaryCaption}> assets</Text></Text>
          <Text style={styles.summaryValue}>{loading || error ? "—" : summary.inProgress ?? "—"}<Text style={styles.summaryCaption}> In Progress</Text></Text>
          <Text style={styles.summaryValue}>{loading || error ? "—" : summary.notStarted ?? "—"}<Text style={styles.summaryCaption}> Not Started</Text></Text>
        </View>
        <Text style={styles.summaryCaption}>{currentProgress.known ? "Saved drafts are not completed services." : "Draft status unavailable. No completion is inferred."}</Text>
      </View>

      {/* ASSET LIST */}
      {loading ? (
        <View style={styles.messageArea}>
          <ActivityIndicator color={COLORS.orange} size="large" />

          <Text style={styles.messageText}>Loading extinguisher assets...</Text>
        </View>
      ) : error ? (
        <View style={styles.messageArea}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : (
        <FlatList
          style={styles.list}
          contentContainerStyle={styles.listContent}
          data={assets}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            const details = assetCardDetails(item);
            const reference = details.reference;
            const status = inspectionStatus(item.id, currentProgress);
            const canInspect = Boolean(companyId && building?.id && userId)
              && canStartInspection(role, assignedSites ?? [], building.id)
              && [undefined, "approved", "active"].includes(item.status);
            return (
            <TouchableOpacity
              style={[styles.assetCard, canInspect && styles.tappableAssetCard]}
              activeOpacity={0.7}
              disabled={!canInspect}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canInspect }}
              accessibilityLabel={`${reference}. ${details.type}. Capacity: ${details.capacity}. Location: ${details.location}. Manufacturer: ${details.manufacturer}. Model: ${details.model}. ${status.label}. ${status.detail}. Last verified service: ${details.lastVerifiedServiceDate}. Result: ${details.lastVerifiedServiceResult}. ${canInspect ? "Start or resume inspection" : "Inspection unavailable"}.`}
              accessibilityHint={canInspect ? "Opens the selected extinguisher's inspection draft" : undefined}
              onPress={() => {
                if (canInspect) setInspectionAssetId((current) => current || item.id);
              }}
            >
              <View style={styles.assetInformation}>
                <View style={styles.assetTop}>
                  <Text style={styles.assetTitle}>{reference}</Text>
                  <Text style={[styles.statusBadge, status.inProgress && styles.started]}>{status.label}</Text>
                </View>
                <Text style={styles.locationLabel}>LOCATION</Text>
                <Text style={styles.location}>{details.location}</Text>
                <Text style={styles.equipment}>{details.type} · Capacity: {details.capacity}</Text>
                <View style={styles.assetFacts}>
                  <View style={styles.fact}><Text style={styles.factLabel}>Manufacturer</Text><Text style={styles.factValue}>{details.manufacturer}</Text></View>
                  <View style={styles.fact}><Text style={styles.factLabel}>Model</Text><Text style={styles.factValue}>{details.model}</Text></View>
                </View>
                <Text style={styles.serviceHistory}>Last verified service: {details.lastVerifiedServiceDate} · Result: {details.lastVerifiedServiceResult}</Text>
                <View style={styles.assetTop}>
                  <Text style={styles.assetDescription}>{status.detail}</Text>
                  {canInspect && <MaterialCommunityIcons name="chevron-right" size={24} color={COLORS.orange} />}
                </View>
                <Text style={styles.openHint}>{canInspect ? "TAP TO START / RESUME" : "Inspection unavailable for your role or this asset."}</Text>
              </View>
            </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <View style={styles.messageArea}>
              <MaterialCommunityIcons
                name="clipboard-text-outline"
                size={50}
                color={COLORS.grey}
              />

              <Text style={styles.emptyTitle}>NO REGISTERED EXTINGUISHERS</Text>

              <Text style={styles.messageText}>
                No approved extinguisher assets have been registered for this
                building.
              </Text>

              <Text style={styles.messageText}>
                Engineers will be able to propose new equipment for office
                verification.
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  tappableAssetCard: { borderColor: COLORS.orange },
  inspectionButton: { minHeight: 48, padding: 10, borderWidth: 1, borderColor: COLORS.orange, borderRadius: 7, marginTop: 10, justifyContent: "center" },
  inspectionButtonText: { color: COLORS.orange, fontWeight: "800", fontSize: 12 },
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },

  backButton: {
    minWidth: 48,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },

  headerTitle: {
    color: COLORS.white,
    fontSize: 18,
    fontWeight: "900",
    flexShrink: 1,
  },

  buildingHeader: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },

  buildingName: {
    color: COLORS.white,
    fontSize: 17,
    fontWeight: "800",
    marginBottom: 5,
  },

  buildingAddress: {
    color: COLORS.grey,
    fontSize: 12,
  },

  summary: { paddingHorizontal: 14, paddingVertical: 10, backgroundColor: COLORS.card, borderBottomWidth: 1, borderBottomColor: COLORS.border },
  summaryCounts: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginVertical: 5 },
  summaryValue: { color: "#FFFFFF", fontSize: 23, fontWeight: "800" }, summaryCaption: { color: "#B7BDC5", fontSize: 12, fontWeight: "400", lineHeight: 18 },
  summaryLabel: { color: "#FF9B63", fontSize: 11, fontWeight: "800" },

  list: {
    flex: 1,
  },

  listContent: {
    padding: 12,
    flexGrow: 1,
  },

  assetCard: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },

  assetInformation: { flex: 1, minWidth: 0 },
  assetTop: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8 },
  statusBadge: { color: "#D1D5DB", fontSize: 12, fontWeight: "700", paddingVertical: 4 }, started: { color: "#FBBF24" },
  locationLabel: { color: "#FF9B63", fontSize: 10, fontWeight: "800", marginTop: 5 },
  location: { color: "white", fontSize: 18, fontWeight: "700", lineHeight: 25, marginVertical: 3 },
  equipment: { color: "#D1D5DB", fontSize: 15, lineHeight: 22, marginBottom: 5 },
  assetFacts: { flexDirection: "row", flexWrap: "wrap", gap: 12 }, fact: { flexGrow: 1, flexBasis: 120, minWidth: 0 },
  factLabel: { color: "#9CA3AF", fontSize: 11 }, factValue: { color: "#E5E7EB", fontSize: 14, lineHeight: 20 },
  serviceHistory: { color: "#B7BDC5", fontSize: 12, lineHeight: 19, marginVertical: 6 },
  openHint: { color: "#FF9B63", fontSize: 11, fontWeight: "800", marginTop: 4 },

  assetTitle: {
    flexShrink: 1,
    maxWidth: "100%",
    color: COLORS.white,
    fontSize: 22,
    fontWeight: "800",
    marginBottom: 5,
  },

  assetDescription: {
    color: COLORS.grey,
    fontSize: 12,
    marginBottom: 4,
  },

  messageArea: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 25,
  },

  messageText: {
    color: COLORS.grey,
    fontSize: 13,
    textAlign: "center",
    marginTop: 12,
    lineHeight: 20,
  },

  emptyTitle: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: "800",
    marginTop: 15,
    textAlign: "center",
  },

  errorText: {
    color: COLORS.red,
    fontSize: 13,
    textAlign: "center",
    lineHeight: 21,
  },
});
