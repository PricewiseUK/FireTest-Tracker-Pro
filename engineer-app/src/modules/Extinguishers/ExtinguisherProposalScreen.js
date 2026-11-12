import React, { useEffect, useRef, useState } from "react";

import {
  View,
  BackHandler,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Keyboard,
  Image,
} from "react-native";

import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";

import { MaterialCommunityIcons } from "@expo/vector-icons";

import {
  collection,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";
import { ref as storageRef, getMetadata, uploadBytes } from "firebase/storage";
import { File } from "expo-file-system";

import { auth, db, storage } from "../../firebaseConfig";

import InstafireDialog from "../../components/InstafireDialog";
import AssetIdInput from "../../components/AssetIdInput";

const COLORS = {
  background: "#0B0D0E",
  card: "#191D20",
  orange: "#FF641C",
  white: "#FFFFFF",
  grey: "#9CA3AF",
  border: "#30363B",
  green: "#22C55E",
  red: "#EF4444",
};

const EXTINGUISHER_TYPES = [
  "Water",
  "Foam",
  "CO₂",
  "Dry Powder",
  "Wet Chemical",
  "Water Mist",
  "Other",
];

export default function ExtinguisherProposalScreen({
  companyId,
  building,
  goBack,
}) {
  const [type, setType] = useState("");
  const [location, setLocation] = useState("");
  const [reason, setReason] = useState("");
  const [assetIdentification, setAssetIdentification] = useState({
    prefix: "",
    number: "",
    assetNumber: "",
  });
  const [photo, setPhoto] = useState(null);

  const [submitting, setSubmitting] = useState(false);
  useEffect(() => {
    const back = BackHandler.addEventListener("hardwareBackPress", () => {
      if (!submitting) goBack(); // Match the existing fixed Back control during upload/submission.
      return true;
    });
    return () => back.remove();
  }, [goBack, submitting]);

  const [dialog, setDialog] = useState({
    visible: false,
    title: "",
    message: "",
    type: "info",
  });

  const [submitted, setSubmitted] = useState(false);
  const [proposalStarted, setProposalStarted] = useState(false);
  const [submitStage, setSubmitStage] = useState("");

  // Retain IDs during retries. A retry must NEVER create another proposal.
  const proposalRef = useRef(null);
  const photoRef = useRef(null);

  const showDialog = (title, message, type = "info") => {
    setDialog({
      visible: true,
      title,
      message,
      type,
    });
  };

  const takePhoto = async () => {
    if (proposalStarted || submitting || submitted) return;
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();

      if (!permission.granted) {
        showDialog(
          "CAMERA PERMISSION",
          "Please allow Instafire to access your camera.",
          "warning",
        );
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ["images"],
        allowsEditing: false,
        quality: 0.75,
      });

      if (!result.canceled && result.assets?.length > 0) {
        const capturedPhoto = result.assets[0];

        // Convert the captured photograph to genuine WebP.
        const manipulator = ImageManipulator.ImageManipulator.manipulate(
          capturedPhoto.uri,
        );

        // Keep good detail for equipment labels and identification.
        const longestSide = Math.max(
          capturedPhoto.width || 0,
          capturedPhoto.height || 0,
        );

        if (longestSide > 2400) {
          if (capturedPhoto.width >= capturedPhoto.height) {
            manipulator.resize({ width: 2400, height: null });
          } else {
            manipulator.resize({ width: null, height: 2400 });
          }
        }

        const rendered = await manipulator.renderAsync();

        const converted = await rendered.saveAsync({
          format: ImageManipulator.SaveFormat.WEBP,
          compress: 0.82,
        });

        // Verify the file is actually WebP, not a renamed JPEG.
        const convertedFile = new File(converted.uri);
        const header = await convertedFile.bytes();

        const isWebP =
          header.length >= 12 &&
          String.fromCharCode(...header.slice(0, 4)) === "RIFF" &&
          String.fromCharCode(...header.slice(8, 12)) === "WEBP";

        if (!isWebP) {
          throw new Error("WebP conversion did not produce a valid WebP file.");
        }

        setPhoto({
          uri: converted.uri,
          width: converted.width,
          height: converted.height,
          fileName: "extinguisher.webp",
          mimeType: "image/webp",
        });
      }
    } catch (error) {
      console.error("Camera error:", error);

      showDialog(
        "CAMERA ERROR",
        "Unable to open your camera. Please try again.",
        "error",
      );
    }
  };

  const submitProposal = async () => {
    Keyboard.dismiss();
    if (submitting || submitted) return;

    if (!type) {
      showDialog(
        "EXTINGUISHER TYPE REQUIRED",
        "Select the extinguisher type.",
        "warning",
      );
      return;
    }
    if (!assetIdentification.number.trim()) {
      showDialog(
        "ASSET NUMBER REQUIRED",
        "Enter the equipment asset number.",
        "warning",
      );
      return;
    }
    if (!location.trim()) {
      showDialog(
        "LOCATION REQUIRED",
        "Enter the equipment location.",
        "warning",
      );
      return;
    }
    if (!reason.trim()) {
      showDialog(
        "REASON REQUIRED",
        "Explain why the asset needs adding.",
        "warning",
      );
      return;
    }
    if (location.trim().length > 200 || reason.trim().length > 1000) {
      showDialog("TEXT TOO LONG", "Shorten the location or reason.", "warning");
      return;
    }

    const engineer = auth.currentUser;
    if (!engineer || !companyId || !building?.id) {
      showDialog(
        "WORKSPACE ERROR",
        "Engineer, company or building details are unavailable.",
        "error",
      );
      return;
    }

    // Never label a HEIC/HEIF photo as JPEG: our Storage rules prohibit HEIC.
    // Convert to WebP/JPEG in a subsequent stage, not by changing a filename.
    let contentType = null;
    if (photo) {
      const filename = photo.fileName || photo.uri || "";
      const suffix = filename.split("?")[0].toLowerCase();
      const extensionType = /\.(jpg|jpeg)$/.test(suffix)
        ? "image/jpeg"
        : /\.png$/.test(suffix)
          ? "image/png"
          : /\.webp$/.test(suffix)
            ? "image/webp"
            : null;
      contentType = photo.mimeType || extensionType;
      if (!["image/jpeg", "image/png", "image/webp"].includes(contentType)) {
        showDialog(
          "UNSUPPORTED PHOTO FORMAT",
          "Please retake the photograph in JPEG, PNG or WebP format. HEIC conversion will be added later.",
          "warning",
        );
        return;
      }
    }

    try {
      setSubmitting(true);
      const proposalsRef = collection(
        db,
        "companies",
        companyId,
        "sites",
        building.id,
        "extinguisherProposals",
      );

      // Generate once: the ID remains the same if the photo upload fails.
      if (!proposalRef.current) {
        proposalRef.current = doc(proposalsRef);
      }

      const pendingProposal = proposalRef.current;
      console.log("INSTAFIRE PROPOSAL ID:", pendingProposal.id);
      console.log("INSTAFIRE BUILDING ID:", building.id);
      console.log("INSTAFIRE COMPANY ID:", companyId);
      setProposalStarted(true);
      setSubmitStage("Saving proposal...");

      // A write can succeed but its acknowledgement be lost. Read before retrying.
      const existingProposal = await getDoc(pendingProposal);
      if (!existingProposal.exists()) {
        await setDoc(pendingProposal, {
          createdBy: engineer.uid,
          createdAt: serverTimestamp(),

          status: "pending",

          type,
          location: location.trim(),
          reason: reason.trim(),

          // Company's asset identification
          assetPrefix: assetIdentification.prefix.trim(),
          assetNumber: assetIdentification.number.trim(),

          assetId:
            assetIdentification.prefix.trim() +
            assetIdentification.number.trim(),

          // Development record
          testData: true,
        });
      }

      if (photo) {
        if (!photoRef.current) {
          photoRef.current = doc(collection(pendingProposal, "photos"));
        }
        const photoDocument = photoRef.current;
        const path =
          `companies/${companyId}/sites/${building.id}/` +
          `extinguisherProposals/${pendingProposal.id}/photos/${photoDocument.id}`;
        const imageObject = storageRef(storage, path);

        setSubmitStage("Checking photograph...");
        const existingPhotoRecord = await getDoc(photoDocument);

        if (!existingPhotoRecord.exists()) {
          let imageAlreadyUploaded = false;
          try {
            const metadata = await getMetadata(imageObject);
            if (metadata.contentType !== contentType) {
              throw new Error("Existing photo has a different file format.");
            }
            imageAlreadyUploaded = true;
          } catch (error) {
            if (error?.code !== "storage/object-not-found") throw error;
          }

          if (!imageAlreadyUploaded) {
            setSubmitStage("Uploading photograph...");
            const imageFile = new File(photo.uri);
            if (
              !imageFile.exists ||
              imageFile.size <= 0 ||
              imageFile.size > 10 * 1024 * 1024
            ) {
              throw new Error(
                "Photo is missing, empty or exceeds the 10 MB limit.",
              );
            }
            const response = await fetch(photo.uri);
            const imageBlob = await response.blob();

            await uploadBytes(imageObject, imageBlob, {
              contentType,
            });
          }

          setSubmitStage("Linking photograph to proposal...");
          await setDoc(photoDocument, {
            companyId,
            siteId: building.id,
            proposalId: pendingProposal.id,
            photoId: photoDocument.id,
            uploadedBy: engineer.uid,
            uploadedAt: serverTimestamp(),
            storagePath: path,
            contentType,
            photoType: "equipment",
          });
        }
      }

      setSubmitted(true);
      showDialog(
        "PROPOSAL SUBMITTED",
        photo
          ? "The proposal and its equipment photograph are saved under the same building and proposal ID. Awaiting office approval."
          : "The proposal was saved without a photograph. Awaiting office approval.",
        "success",
      );
    } catch (error) {
      console.error("Proposal/photo save failed:", error);
      showDialog(
        "SAVE INCOMPLETE",
        `The proposal may already be saved, but the photograph/link was not confirmed. Stay on this screen and press SUBMIT again to retry without creating another proposal.\n\n${error?.message || "Check your connection."}`,
        "error",
      );
    } finally {
      setSubmitStage("");
      setSubmitting(false);
    }
  };

  const closeDialog = () => {
    setDialog((previous) => ({
      ...previous,
      visible: false,
    }));

    if (submitted) {
      goBack();
    }
  };

  return (
    <View style={styles.container}>
      {/* FIXED HEADER */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={goBack}
          disabled={submitting}
          accessibilityRole="button"
          accessibilityLabel="Back to building details"
        >
          <MaterialCommunityIcons
            name="arrow-left"
            size={26}
            color={COLORS.white}
          />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>PROPOSE NEW ASSET</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* BUILDING INFORMATION */}
        <View style={styles.buildingCard}>
          <Text style={styles.sectionLabel}>BUILDING</Text>

          <Text style={styles.buildingName}>
            {building?.name || "Unknown Building"}
          </Text>

          <Text style={styles.buildingAddress}>{building?.address || ""}</Text>
        </View>

        {/* APPROVAL NOTICE */}
        <View style={styles.notice}>
          <MaterialCommunityIcons
            name="shield-check-outline"
            size={27}
            color={COLORS.orange}
          />

          <Text style={styles.noticeText}>
            New equipment must be verified by the office before entering the
            official asset register.
          </Text>
        </View>

        {/* EXTINGUISHER TYPE */}
        <Text style={styles.sectionLabel}>EXTINGUISHER TYPE *</Text>

        <View style={styles.typeContainer}>
          {EXTINGUISHER_TYPES.map((item) => (
            <TouchableOpacity
              key={item}
              style={[
                styles.typeButton,
                type === item && styles.typeButtonSelected,
              ]}
              onPress={() => !proposalStarted && setType(item)}
            >
              <Text
                style={[
                  styles.typeText,
                  type === item && styles.typeTextSelected,
                ]}
              >
                {item}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        {/* ASSET IDENTIFICATION */}
        <AssetIdInput
          key={`${companyId}:${building?.id}:extinguishers`}
          companyId={companyId}
          siteId={building?.id}
          discipline="extinguishers"
          onChange={setAssetIdentification}
          disabled={proposalStarted || submitting || submitted}
        />
        {/* LOCATION */}
        <Text style={styles.sectionLabel}>EQUIPMENT LOCATION *</Text>

        <TextInput
          style={styles.input}
          placeholder="e.g. Ground Floor Reception"
          placeholderTextColor={COLORS.grey}
          value={location}
          onChangeText={setLocation}
          editable={!proposalStarted && !submitting}
          maxLength={200}
        />

        {/* REASON */}
        <Text style={styles.sectionLabel}>REASON FOR PROPOSAL *</Text>

        <TextInput
          style={[styles.input, styles.notesInput]}
          placeholder="e.g. Extinguisher found on-site but missing from office asset register"
          placeholderTextColor={COLORS.grey}
          multiline
          textAlignVertical="top"
          value={reason}
          onChangeText={setReason}
          editable={!proposalStarted && !submitting}
          maxLength={1000}
        />

        <Text style={styles.helperText}>* Required fields</Text>

        {/* EQUIPMENT PHOTOGRAPH */}
        <Text style={styles.sectionLabel}>EQUIPMENT PHOTOGRAPH</Text>

        <TouchableOpacity
          style={styles.cameraButton}
          onPress={takePhoto}
          disabled={submitting || submitted || proposalStarted}
          accessibilityRole="button"
          accessibilityLabel="Take extinguisher photograph"
        >
          <MaterialCommunityIcons
            name="camera"
            size={25}
            color={COLORS.orange}
          />

          <Text style={styles.cameraButtonText}>
            {photo ? "RETAKE PHOTO" : "TAKE PHOTO"}
          </Text>
        </TouchableOpacity>

        {photo && (
          <View style={styles.photoPreviewContainer}>
            <Image
              source={{ uri: photo.uri }}
              style={styles.photoPreview}
              resizeMode="contain"
            />

            <View style={styles.photoConfirmation}>
              <MaterialCommunityIcons
                name="check-circle"
                size={20}
                color={COLORS.green}
              />

              <Text style={styles.photoConfirmationText}>
                Photograph captured — not yet uploaded
              </Text>
            </View>
          </View>
        )}

        <View style={styles.testNotice}>
          <MaterialCommunityIcons
            name="flask-outline"
            size={20}
            color={COLORS.orange}
          />

          <Text style={styles.testNoticeText}>
            DEVELOPMENT MODE — This proposal will be marked as test data.
          </Text>
        </View>

        {proposalStarted && !submitted && (
          <Text style={styles.helperText}>
            Proposal reserved. Details and photograph are locked to prevent
            mismatches. If saving failed, retry below without leaving this
            screen.
          </Text>
        )}

        {!!submitStage && <Text style={styles.helperText}>{submitStage}</Text>}

        {/* SUBMIT BUTTON */}
        <TouchableOpacity
          style={[
            styles.submitButton,
            submitting && styles.submitButtonDisabled,
          ]}
          onPress={submitProposal}
          disabled={submitting || submitted}
          activeOpacity={0.85}
        >
          {submitting ? (
            <ActivityIndicator color={COLORS.white} />
          ) : (
            <>
              <MaterialCommunityIcons
                name="send-check"
                size={21}
                color={COLORS.white}
              />

              <Text style={styles.submitText}>SUBMIT FOR OFFICE APPROVAL</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>

      <InstafireDialog
        visible={dialog.visible}
        title={dialog.title}
        message={dialog.message}
        type={dialog.type}
        confirmText="OK"
        showCancel={false}
        onConfirm={closeDialog}
        onCancel={closeDialog}
      />
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
    flexShrink: 1,
  },

  scroll: {
    flex: 1,
  },

  scrollContent: {
    padding: 15,
    paddingBottom: 50,
  },

  buildingCard: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 18,
    marginBottom: 18,
  },

  buildingName: {
    color: COLORS.white,
    fontSize: 19,
    fontWeight: "900",
    marginBottom: 5,
  },

  buildingAddress: {
    color: COLORS.grey,
    fontSize: 13,
  },

  sectionLabel: {
    color: COLORS.grey,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1,
    marginBottom: 12,
  },

  notice: {
    backgroundColor: COLORS.card,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.orange,
    borderRadius: 8,
    padding: 15,
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 25,
    gap: 12,
  },

  noticeText: {
    flex: 1,
    color: COLORS.white,
    fontSize: 12,
    lineHeight: 19,
  },

  typeContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 9,
    marginBottom: 24,
  },

  typeButton: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 7,
    paddingHorizontal: 15,
    paddingVertical: 12,
  },

  typeButtonSelected: {
    borderColor: COLORS.orange,
    backgroundColor: "#38241B",
  },

  typeText: {
    color: COLORS.grey,
    fontSize: 13,
    fontWeight: "700",
  },

  typeTextSelected: {
    color: COLORS.white,
  },

  input: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    color: COLORS.white,
    fontSize: 15,
    padding: 15,
    marginBottom: 23,
  },

  notesInput: {
    minHeight: 125,
  },

  helperText: {
    color: COLORS.grey,
    fontSize: 11,
    marginBottom: 20,
  },

  testNotice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 22,
  },

  testNoticeText: {
    flex: 1,
    color: COLORS.orange,
    fontSize: 11,
    fontWeight: "700",
  },

  submitButton: {
    backgroundColor: COLORS.orange,
    borderRadius: 8,
    height: 58,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },

  submitButtonDisabled: {
    opacity: 0.6,
  },

  submitText: {
    color: COLORS.white,
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 0.4,
  },
  cameraButton: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.orange,
    borderRadius: 8,
    minHeight: 65,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    marginBottom: 15,
  },

  cameraButtonText: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: "900",
  },

  photoPreviewContainer: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 12,
    marginBottom: 25,
  },

  photoPreview: {
    width: "100%",
    height: 280,
    borderRadius: 6,
  },

  photoConfirmation: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 12,
  },

  photoConfirmationText: {
    color: COLORS.green,
    fontSize: 12,
    fontWeight: "700",
  },
});
