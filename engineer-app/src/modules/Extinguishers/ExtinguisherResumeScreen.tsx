import React, { useEffect, useState } from "react";
import { ActivityIndicator, BackHandler, FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../../firebaseConfig";
import { engineerNavigationStorage } from "./engineerNavigationStorage";
import { canStartInspection } from "./approvedInspectionAsset";
import type { ResumeEntry } from "./engineerNavigation";
import ExtinguisherInspectionScreen, { type LeaveGuard } from "./ExtinguisherInspectionScreen";

export default function ExtinguisherResumeScreen({ companyId, userId, role, assignedSites, goBack, registerLeaveGuard }: {
  companyId: string; userId: string; role: string; assignedSites: string[]; goBack: () => void;
  registerLeaveGuard: (guard: LeaveGuard) => () => void;
}) {
  const [entries, setEntries] = useState<ResumeEntry[]>([]);
  const [selected, setSelected] = useState<ResumeEntry | null>(null);
  const [loadedKey, setLoadedKey] = useState("");
  const [warning, setWarning] = useState("");
  const [refresh, setRefresh] = useState(0);
  const requestKey = JSON.stringify([companyId, userId, role, assignedSites, refresh]);
  const loading = loadedKey !== requestKey;
  useEffect(() => {
    let active = true;
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user?.uid !== userId && active) { active = false; setEntries([]); setSelected(null); setWarning("The signed-in user changed. Return to Fire Extinguishers."); setLoadedKey(requestKey); }
    });
    void (async () => {
      try {
        if (auth.currentUser?.uid !== userId) throw new Error("AUTH_SESSION_CHANGED");
        const result = await engineerNavigationStorage.forCompany(companyId).listDrafts(role, assignedSites);
        if (!active || auth.currentUser?.uid !== userId) return;
        setEntries(result.drafts);
        setWarning(result.problems.map((entry) => `${entry.siteId ? `Site ${entry.siteId}: ` : ""}${entry.message}`).join("\n"));
      } catch { if (active) { setEntries([]); setWarning("Unable to read local drafts safely. Nothing was removed. Retry, or use the approved list to review recovery."); } }
      finally { if (active) setLoadedKey(requestKey); }
    })();
    return () => { active = false; unsubscribe(); };
  }, [companyId, userId, role, assignedSites, refresh, requestKey]);
  useEffect(() => {
    if (selected) return;
    const back = BackHandler.addEventListener("hardwareBackPress", () => { goBack(); return true; });
    return () => back.remove();
  }, [selected, goBack]);
  if (selected) return <ExtinguisherInspectionScreen key={selected.inspectionId} companyId={companyId} siteId={selected.siteId} assetDocId={selected.assetDocId}
    resumeInspectionId={selected.inspectionId} backLabel="RESUME DRAFTS" userId={userId} role={role} assignedSites={assignedSites} registerLeaveGuard={registerLeaveGuard}
    goBack={() => { setSelected(null); setRefresh((value) => value + 1); }} />;
  const visible = entries.filter((entry) => canStartInspection(role, assignedSites, entry.siteId));
  return <View style={styles.container}>
    <View style={styles.header}><TouchableOpacity accessibilityRole="button" accessibilityLabel="Back to Fire Extinguishers" style={styles.back} onPress={goBack}><Text style={styles.action}>‹ Back</Text></TouchableOpacity><Text style={styles.title}>RESUME INSPECTION</Text></View>
    <Text style={styles.text}>Your device drafts only · Pending Sync. Site names use your safely cached labels where available.</Text>
    {!loading && !!warning && <Text style={styles.warning} accessibilityRole="alert">{warning}</Text>}
    <TouchableOpacity style={styles.back} accessibilityRole="button" onPress={() => setRefresh((value) => value + 1)}><Text style={styles.action}>Refresh local drafts</Text></TouchableOpacity>
    {loading ? <ActivityIndicator color="#FF641C" accessibilityLabel="Loading your local drafts" /> : <FlatList data={visible} keyExtractor={(entry) => `${entry.siteId}:${entry.inspectionId}`} contentContainerStyle={styles.content}
      ListEmptyComponent={<Text style={styles.text}>No local inspection drafts available for your current company, user and site access.</Text>}
      renderItem={({ item }) => <View style={styles.card}>
        <Text style={styles.title}>{item.assetReference}</Text><Text style={styles.text}>{item.siteName}</Text>
        <Text style={styles.text}>{item.label} · {item.checks} checks</Text>
        <Text style={styles.text}>{new Date(item.createdAtMs).toLocaleString()}</Text>
        {!item.compatible && <Text style={styles.warning}>Earlier draft format retained. This editor cannot safely open it.</Text>}
        {item.recovery && <Text style={styles.warning}>A damaged copy needs explicit recovery review.</Text>}
        <TouchableOpacity style={[styles.resume, !item.compatible && styles.disabled]} disabled={!item.compatible} accessibilityRole="button" accessibilityState={{ disabled: !item.compatible }}
          accessibilityLabel={`Resume ${item.assetReference} at ${item.siteName}`} onPress={() => { if (auth.currentUser?.uid === userId && canStartInspection(role, assignedSites, item.siteId)) setSelected((current) => current ?? item); }}>
          <Text style={styles.action}>{item.recovery ? "RESUME / REVIEW RECOVERY" : "RESUME"}</Text>
        </TouchableOpacity>
      </View>} />}
  </View>;
}
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0B0D0E", paddingHorizontal: 14 }, header: { flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" },
  back: { minHeight: 48, justifyContent: "center", paddingHorizontal: 8 }, title: { color: "white", fontWeight: "800", fontSize: 18, flexShrink: 1 },
  action: { color: "#FF9B63", fontWeight: "800" }, text: { color: "#B7BDC5", lineHeight: 22, marginVertical: 4 }, warning: { color: "#FDBA74", lineHeight: 22, marginVertical: 6 },
  content: { paddingBottom: 20 }, card: { padding: 14, borderRadius: 8, backgroundColor: "#191D20", marginVertical: 6 }, resume: { minHeight: 52, justifyContent: "center", padding: 12, borderWidth: 1, borderColor: "#FF641C", borderRadius: 8, marginTop: 8 }, disabled: { opacity: 0.45 },
});
