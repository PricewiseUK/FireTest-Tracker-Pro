import React from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Linking,
} from "react-native";

import { MaterialCommunityIcons } from "@expo/vector-icons";

const COLORS = {
  background: "#0B0D0E",
  card: "#191D20",
  orange: "#FF641C",
  white: "#FFFFFF",
  grey: "#9CA3AF",
  border: "#30363B",
};

const MENU_ITEMS = [
  {
    id: "assets",
    title: "ASSET REGISTER",
    description: "View registered fire extinguishers",
    icon: "format-list-bulleted",
  },
  {
    id: "create",
    title: "PROPOSE NEW ASSET",
    description: "Submit equipment for office approval",
    icon: "plus-circle-outline",
  },
  {
    id: "inspection",
    title: "START / RESUME INSPECTION",
    description: "Record or continue extinguisher servicing",
    icon: "clipboard-check-outline",
  },
  {
    id: "history",
    title: "REPORTS & HISTORY",
    description: "View previous inspections and reports",
    icon: "history",
  },
];

export default function ExtinguisherDetailsScreen({
  building,
  goBack,
  onSelectFeature,
}) {
  if (!building) {
    return (
      <View style={styles.container}>
        <Text style={styles.emptyText}>No building selected.</Text>
      </View>
    );
  }

  const contactName = building.contactName || "";
  const contactPhone = building.contactPhone || "";
  const contactEmail = building.contactEmail || "";

  const openPhone = () => {
    if (contactPhone) {
      Linking.openURL(`tel:${contactPhone.replace(/[^\d+]/g, "")}`);
    }
  };

  return (
    <View style={styles.container}>
      {/* FIXED HEADER */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={goBack}
          accessibilityRole="button"
          accessibilityLabel="Back to building search"
        >
          <MaterialCommunityIcons
            name="arrow-left"
            size={26}
            color={COLORS.white}
          />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>BUILDING DETAILS</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* BUILDING INFORMATION */}
        <View style={styles.card}>
          <Text style={styles.buildingName}>
            {building.name || "Unnamed Building"}
          </Text>

          <Text style={styles.detailText}>
            {building.address || "Address not recorded"}
          </Text>

          {!!building.postcode && (
            <Text style={styles.detailText}>{building.postcode}</Text>
          )}

          {!!building.reference && (
            <Text style={styles.reference}>SITE REF: {building.reference}</Text>
          )}
        </View>

        {/* CUSTOMER CONTACT */}
        <Text style={styles.sectionTitle}>CUSTOMER CONTACT</Text>

        <View style={styles.card}>
          <Text style={styles.contactName}>
            {contactName || "No contact recorded"}
          </Text>

          {contactPhone ? (
            <TouchableOpacity
              style={styles.contactRow}
              onPress={openPhone}
              accessibilityRole="button"
              accessibilityLabel={`Call ${contactName || "customer"}`}
            >
              <MaterialCommunityIcons
                name="phone"
                size={20}
                color={COLORS.orange}
              />

              <Text style={styles.contactLink}>{contactPhone}</Text>
            </TouchableOpacity>
          ) : (
            <Text style={styles.detailText}>Telephone not recorded</Text>
          )}

          {!!contactEmail && (
            <Text style={styles.detailText}>{contactEmail}</Text>
          )}
        </View>

        {/* ASSET OVERVIEW */}
        <Text style={styles.sectionTitle}>FIRE EXTINGUISHERS</Text>

        <View style={styles.card}>
          <Text style={styles.detailText}>
            Registered extinguishers: Not yet loaded
          </Text>

          <Text style={styles.detailText}>
            Service status: Not yet recorded
          </Text>
        </View>

        {/* MODULE OPTIONS */}
        <Text style={styles.sectionTitle}>EQUIPMENT MANAGEMENT</Text>

        {MENU_ITEMS.map((item) => (
          <TouchableOpacity
            key={item.id}
            style={styles.menuCard}
            activeOpacity={0.85}
            onPress={() => onSelectFeature?.(item)}
          >
            <View style={styles.orangeStrip} />

            <MaterialCommunityIcons
              name={item.icon}
              size={30}
              color={COLORS.orange}
            />

            <View style={styles.menuText}>
              <Text style={styles.menuTitle}>{item.title}</Text>

              <Text style={styles.menuDescription}>{item.description}</Text>
            </View>

            <MaterialCommunityIcons
              name="chevron-right"
              size={25}
              color={COLORS.white}
            />
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
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
    width: 44,
    height: 44,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 10,
  },

  headerTitle: {
    color: COLORS.white,
    fontSize: 18,
    fontWeight: "900",
  },

  scroll: {
    flex: 1,
  },

  scrollContent: {
    paddingHorizontal: 12,
    paddingTop: 20,
    paddingBottom: 35,
  },

  card: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 18,
    marginBottom: 22,
  },

  buildingName: {
    color: COLORS.white,
    fontSize: 20,
    fontWeight: "900",
    marginBottom: 10,
  },

  detailText: {
    color: COLORS.grey,
    fontSize: 14,
    lineHeight: 23,
  },

  reference: {
    color: COLORS.orange,
    fontSize: 12,
    fontWeight: "800",
    marginTop: 12,
  },

  sectionTitle: {
    color: COLORS.grey,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.2,
    marginBottom: 12,
  },

  contactName: {
    color: COLORS.white,
    fontSize: 17,
    fontWeight: "800",
    marginBottom: 10,
  },

  contactRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 8,
    minHeight: 44,
  },

  contactLink: {
    color: COLORS.orange,
    fontSize: 15,
    fontWeight: "700",
  },

  menuCard: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    minHeight: 95,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    marginBottom: 12,
    overflow: "hidden",
  },

  orangeStrip: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: COLORS.orange,
  },

  menuText: {
    flex: 1,
    marginHorizontal: 15,
  },

  menuTitle: {
    color: COLORS.white,
    fontSize: 15,
    fontWeight: "900",
    marginBottom: 5,
  },

  menuDescription: {
    color: COLORS.grey,
    fontSize: 12,
    lineHeight: 18,
  },

  emptyText: {
    color: COLORS.grey,
    textAlign: "center",
    marginTop: 40,
  },
});
