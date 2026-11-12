import * as ImagePicker from "expo-image-picker";
import { Directory, File, Paths } from "expo-file-system";
import type { InspectionPhotoAdapter } from "./inspectionPhotoAttachment";

let sequence = 0;
export const inspectionPhotoAdapter: InspectionPhotoAdapter = {
  async pick() {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: false, quality: 0.7, exif: false, base64: false });
    return result.canceled ? null : result.assets[0]?.uri ?? null;
  },
  id: () => `photo_${Date.now()}_${++sequence}`,
  async copy(source, scope, id) {
    const directory = new Directory(Paths.document, "inspection-evidence", ...[scope.projectId, scope.userId, scope.companyId, scope.siteId, scope.inspectionId].map((part) => `id_${encodeURIComponent(part)}`));
    directory.create({ intermediates: true, idempotent: true });
    // An opaque extension avoids claiming JPEG/PNG for a different source format.
    const destination = new File(directory, `${id}.image`);
    new File(source).copy(destination);
    if (!destination.exists || destination.size <= 0) throw new Error("PHOTO_COPY_FAILED");
    return destination.uri;
  },
};
