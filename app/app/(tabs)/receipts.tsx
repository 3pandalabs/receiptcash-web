import { useState } from "react";
import * as ImagePicker from "expo-image-picker";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useAuth } from "../../hooks/useAuth";
import { useReceipts, type Receipt } from "../../hooks/useReceipts";
import { uploadReceipt } from "../../lib/uploadReceipt";
import { getErrorMessage } from "../../lib/errors";

export default function ReceiptsScreen() {
  const { session } = useAuth();
  const { receipts, isLoading, refresh } = useReceipts();
  const [isUploading, setIsUploading] = useState(false);

  async function handlePickAndUpload() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Camera permission is required to scan a receipt.");
      return;
    }

    const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    if (result.canceled || !result.assets?.[0] || !session) return;

    setIsUploading(true);
    try {
      await uploadReceipt(session.user.id, result.assets[0].uri);
      await refresh();
    } catch (err) {
      Alert.alert("Upload failed", getErrorMessage(err));
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <View style={styles.container}>
      <Pressable style={styles.uploadButton} onPress={handlePickAndUpload} disabled={isUploading}>
        {isUploading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.uploadButtonText}>+ Scan a receipt</Text>
        )}
      </Pressable>

      <FlatList
        data={receipts}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        onRefresh={refresh}
        refreshing={isLoading}
        ListEmptyComponent={
          !isLoading ? <Text style={styles.empty}>No receipts yet.</Text> : null
        }
        renderItem={({ item }) => <ReceiptRow receipt={item} />}
      />
    </View>
  );
}

function ReceiptRow({ receipt }: { receipt: Receipt }) {
  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.merchant}>{receipt.merchant_name ?? "Processing..."}</Text>
        <Text style={styles.date}>{new Date(receipt.created_at).toLocaleDateString()}</Text>
        {receipt.status_reason && (
          <Text style={styles.reason}>{receipt.status_reason}</Text>
        )}
      </View>
      <View style={{ alignItems: "flex-end" }}>
        {receipt.receipt_total != null && (
          <Text style={styles.total}>${receipt.receipt_total.toFixed(2)}</Text>
        )}
        <Text style={[styles.status, statusStyle(receipt.status)]}>{statusLabel(receipt.status)}</Text>
      </View>
    </View>
  );
}

function statusLabel(status: Receipt["status"]) {
  if (status === "flagged_for_review") return "In review";
  return status;
}

function statusStyle(status: Receipt["status"]) {
  switch (status) {
    case "processed":
      return { color: "#16a34a" };
    case "rejected":
    case "duplicate":
      return { color: "#dc2626" };
    case "flagged_for_review":
      return { color: "#2563eb" };
    default:
      return { color: "#d97706" };
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  uploadButton: {
    backgroundColor: "#111827",
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
    margin: 16,
  },
  uploadButtonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  list: { paddingHorizontal: 16, paddingBottom: 24 },
  empty: { textAlign: "center", color: "#999", marginTop: 40 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#e5e7eb",
  },
  merchant: { fontSize: 16, fontWeight: "600" },
  date: { fontSize: 12, color: "#999", marginTop: 2 },
  reason: { fontSize: 12, color: "#dc2626", marginTop: 4 },
  total: { fontSize: 16, fontWeight: "600" },
  status: { fontSize: 12, marginTop: 2, textTransform: "capitalize" },
});
