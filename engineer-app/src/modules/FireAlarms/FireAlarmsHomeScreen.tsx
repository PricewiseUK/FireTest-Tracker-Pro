import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BackHandler, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import FireAlarmDeviceTestingScreen, { type FireAlarmGuardRegistration, type FireAlarmLeaveGuard } from "./FireAlarmDeviceTestingScreen";
import catalogue from "./fixtures/advancedMxPro5Catalogue.json";
import { backAlarmView, createFireAlarmFixtureRepository, initialAlarmView, recordedAlarmValue, resolvePanelIdentity, type AlarmView, type FixtureScope } from "./fireAlarmRegister";

type Props = FixtureScope & { role: string; goHome: () => void; registerLeaveGuard: FireAlarmGuardRegistration };
function Action({ label, onPress, selected = false }: { label: string; onPress: () => void; selected?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={({ pressed }) => [styles.action, selected && styles.selected, pressed && styles.pressed]}><Text style={styles.actionText}>{label}</Text></Pressable>;
}
export default function FireAlarmsHomeScreen(props: Props) {
  if (!__DEV__ || !props.companyId || !props.userId || !["engineer", "senior_engineer", "owner", "office_admin"].includes(props.role)) {
    return <View style={styles.container}><Action label="Back to dashboard" onPress={props.goHome} /><Text style={styles.title}>Fire Alarms</Text><Text style={styles.text}>Live fire alarm registers are not connected.</Text></View>;
  }
  return <FixtureRegister key={`${props.companyId}:${props.userId}:${props.role}`} {...props} />;
}
function FixtureRegister({ companyId, userId, goHome, registerLeaveGuard }: Props) {
  const scope = useMemo(() => ({ companyId, userId }), [companyId, userId]);
  const repository = useMemo(() => createFireAlarmFixtureRepository(scope), [scope]);
  const [view, setView] = useState<AlarmView>(initialAlarmView);
  const deviceLeave = useRef<FireAlarmLeaveGuard | null>(null);
  const registerDeviceGuard = useCallback<FireAlarmGuardRegistration>((guard) => {
    deviceLeave.current = guard; const unregister = registerLeaveGuard(guard);
    return () => { if (deviceLeave.current === guard) deviceLeave.current = null; unregister(); };
  }, [registerLeaveGuard]);
  const sites = repository.listSites(scope);
  const site = sites.find(({ id }) => id === view.siteId);
  const system = site && view.systemId ? repository.getSystem(scope, site.id, view.systemId) : null;
  const identity = system ? resolvePanelIdentity(system, [catalogue]) : null;
  const back = useCallback(() => {
    const navigate = () => { const next = backAlarmView(view); if (next.exit) goHome(); else setView(next.view); };
    if (deviceLeave.current) void deviceLeave.current(navigate); else navigate();
  }, [view, goHome]);
  useEffect(() => { const listener = BackHandler.addEventListener("hardwareBackPress", () => { back(); return true; }); return () => listener.remove(); }, [back]);
  const heading = system ? "Fire Alarm Inspection" : site ? "Fire Alarm Systems" : "Fire Alarms";
  const header = <>
    <View style={styles.header}><Action label="Back" onPress={back} /><Text accessibilityRole="header" style={styles.title}>{heading}</Text></View>
    <View style={styles.notice}><Text style={styles.example}>EXAMPLE DATA · LOCAL RESULTS</Text><Text style={styles.caption}>Fictional equipment. Local results only; not certified.</Text></View>
  </>;
  if (system && site && identity) {
    const devices = repository.listDevices(scope, site.id, system.id, view);
    return <View style={styles.container}>{header}<FireAlarmDeviceTestingScreen key={system.id} scope={scope} siteId={site.id} systemId={system.id}
      deviceIds={repository.listDevices(scope, site.id, system.id, { loopId: null, zoneId: null }).map((device) => device.id)} devices={devices} registerGuard={registerDeviceGuard}
      listHeader={<>
        <View style={styles.card}>
          <Text style={styles.caption}>{site.name}</Text><Text style={styles.reference}>{system.reference}</Text>
          <Text style={styles.location}>{recordedAlarmValue(system.location)}</Text>
          <Text style={styles.text}>{identity.manufacturer} / {identity.model}</Text><Text style={styles.caption}>{identity.source}</Text>
        </View>
        <Text style={styles.label}>LOOP</Text><View style={styles.options}>
          <Action label="All loops" selected={view.loopId === null} onPress={() => setView((current) => ({ ...current, loopId: null }))} />
          {system.loops.map((loop) => <Action key={loop.id} label={loop.label} selected={view.loopId === loop.id} onPress={() => setView((current) => ({ ...current, loopId: loop.id }))} />)}
        </View>
        <Text style={styles.label}>ZONE</Text><View style={styles.options}>
          <Action label="All zones" selected={view.zoneId === null} onPress={() => setView((current) => ({ ...current, zoneId: null }))} />
          {system.zones.map((zone) => <Action key={zone.id} label={zone.label} selected={view.zoneId === zone.id} onPress={() => setView((current) => ({ ...current, zoneId: zone.id }))} />)}
        </View>
        <View style={styles.options}><Text style={styles.count}>{devices.length} example devices</Text>{(view.loopId || view.zoneId) && <Action label="Clear filters" onPress={() => setView((current) => ({ ...current, loopId: null, zoneId: null }))} />}</View>
      </>}
      renderMetadata={(item) => <>
        <Text style={styles.reference}>{item.reference}</Text><Text style={styles.text}>{item.type}</Text><Text style={styles.location}>{recordedAlarmValue(item.location)}</Text>
        <Text style={styles.caption}>Loop: {system.loops.find(({ id }) => id === item.loopId)?.label ?? "Not Recorded"} · Zone: {system.zones.find(({ id }) => id === item.zoneId)?.label ?? "Not Recorded"}</Text>
        <Text style={styles.caption}>Address: {recordedAlarmValue(item.address)}</Text>
      </>} /></View>;
  }
  if (site) return <View style={styles.container}>{header}<FlatList key={site.id} data={repository.listSystems(scope, site.id)} keyExtractor={(entry) => entry.id} contentContainerStyle={styles.content}
    ListHeaderComponent={<Text style={styles.label}>{site.name}</Text>} ListEmptyComponent={<Text style={styles.text}>No example systems available.</Text>}
    renderItem={({ item }) => { const panel = resolvePanelIdentity(item, [catalogue]); return <Pressable accessibilityRole="button" accessibilityLabel={`Open device register for ${item.reference}`} style={({ pressed }) => [styles.card, styles.cardButton, pressed && styles.pressed]} onPress={() => setView({ siteId: site.id, systemId: item.id, loopId: null, zoneId: null })}>
      <Text style={styles.reference}>{item.reference}</Text><Text style={styles.location}>{recordedAlarmValue(item.location)}</Text><Text style={styles.text}>{panel.manufacturer} / {panel.model}</Text>
      <Text style={styles.caption}>{item.loops.length ? `${item.loops.length} recorded example loops` : "Loops Not Recorded"} · {item.zones.length ? `${item.zones.length} recorded example zones` : "Zones Not Recorded"}</Text><Text style={styles.link}>VIEW DEVICES</Text>
    </Pressable>; }} /></View>;
  return <View style={styles.container}>{header}<FlatList data={sites} keyExtractor={(entry) => entry.id} contentContainerStyle={styles.content}
    ListHeaderComponent={<Text style={styles.label}>CHOOSE AN EXAMPLE SITE</Text>}
    renderItem={({ item }) => <Pressable accessibilityRole="button" style={({ pressed }) => [styles.card, styles.cardButton, pressed && styles.pressed]} onPress={() => setView({ ...initialAlarmView(), siteId: item.id })}>
      <Text style={styles.reference}>{item.name}</Text><Text style={styles.link}>VIEW SYSTEMS</Text>
    </Pressable>} /></View>;
}
const styles = StyleSheet.create({
  container: { flex: 1, width: "100%", maxWidth: 840, alignSelf: "center", backgroundColor: "#0B0D0E", paddingHorizontal: 14 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, flexWrap: "wrap", paddingVertical: 4 },
  title: { color: "#FFFFFF", fontSize: 23, fontWeight: "800", flexShrink: 1 },
  notice: { borderLeftWidth: 3, borderLeftColor: "#FF641C", backgroundColor: "#191D20", padding: 10, marginBottom: 8 },
  example: { color: "#FF9B63", fontWeight: "800", fontSize: 13 }, caption: { color: "#B7BDC5", fontSize: 13, lineHeight: 20 },
  content: { paddingBottom: 20 }, card: { backgroundColor: "#191D20", padding: 13, borderRadius: 8, marginVertical: 6 },
  cardButton: { borderWidth: 1, borderColor: "#FF641C", minHeight: 64 }, pressed: { opacity: 0.7 },
  reference: { color: "#FFFFFF", fontSize: 18, fontWeight: "800", marginBottom: 4 }, location: { color: "#F3F4F6", fontSize: 16, lineHeight: 23 },
  text: { color: "#B7BDC5", fontSize: 15, lineHeight: 22, marginVertical: 4 }, label: { color: "#FF9B63", fontSize: 13, fontWeight: "800", marginVertical: 8 },
  link: { color: "#FF9B63", fontWeight: "800", marginTop: 10, fontSize: 13 }, options: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 },
  action: { minHeight: 48, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: "#75503B", borderRadius: 7, justifyContent: "center" },
  selected: { backgroundColor: "#54270F", borderColor: "#FF641C", borderWidth: 2 }, actionText: { color: "#FF9B63", fontWeight: "700", fontSize: 14 },
  count: { color: "#FFFFFF", fontWeight: "800", fontSize: 19, marginVertical: 12 },
});
