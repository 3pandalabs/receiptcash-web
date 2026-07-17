import { useMemo, useState } from "react";
import { FlatList, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { useRedemptionOrders, type RedemptionOrder } from "../../hooks/useRedemptionOrders";

const STATUS_LABEL: Record<RedemptionOrder["status"], string> = {
  pending: "Pending",
  fulfilled: "Fulfilled",
  failed: "Failed",
  cancelled: "Cancelled",
};

const STATUS_COLOR: Record<RedemptionOrder["status"], string> = {
  pending: "#d97706",
  fulfilled: "#16a34a",
  failed: "#dc2626",
  cancelled: "#6b7280",
};

export default function OrdersScreen() {
  const { orders, isLoading, refresh } = useRedemptionOrders();
  const [tab, setTab] = useState<"active" | "history">("active");

  const activeOrders = useMemo(() => orders.filter((o) => o.status === "pending"), [orders]);
  const historyOrders = useMemo(() => orders.filter((o) => o.status !== "pending"), [orders]);
  const shown = tab === "active" ? activeOrders : historyOrders;

  return (
    <View style={styles.container}>
      <View style={styles.tabRow}>
        <Pressable
          style={[styles.tabButton, tab === "active" && styles.tabButtonActive]}
          onPress={() => setTab("active")}
        >
          <Text style={[styles.tabButtonText, tab === "active" && styles.tabButtonTextActive]}>
            Active ({activeOrders.length})
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tabButton, tab === "history" && styles.tabButtonActive]}
          onPress={() => setTab("history")}
        >
          <Text style={[styles.tabButtonText, tab === "history" && styles.tabButtonTextActive]}>
            History ({historyOrders.length})
          </Text>
        </Pressable>
      </View>

      <FlatList
        data={shown}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        onRefresh={refresh}
        refreshing={isLoading}
        ListEmptyComponent={
          !isLoading ? (
            <Text style={styles.empty}>
              {tab === "active" ? "No pending orders." : "No past orders yet."}
            </Text>
          ) : null
        }
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.orderId}>Order #{item.id.slice(0, 8)}</Text>
              <Text style={[styles.status, { color: STATUS_COLOR[item.status] }]}>
                {STATUS_LABEL[item.status]}
              </Text>
            </View>

            {item.items.map((line, i) => (
              <Text key={i} style={styles.itemLine}>
                {line.image_emoji ?? "🎁"} {line.quantity}x {line.gift_name}
              </Text>
            ))}

            <Text style={styles.total}>{item.total_points_cost} points</Text>

            {item.tracking_number && (
              <Pressable
                onPress={() => {
                  if (/^https?:\/\//i.test(item.tracking_number ?? "")) {
                    Linking.openURL(item.tracking_number!);
                  }
                }}
              >
                <Text style={styles.tracking}>
                  Tracking: {item.tracking_number}
                  {/^https?:\/\//i.test(item.tracking_number) ? " (tap to track) 🚚" : ""}
                </Text>
              </Pressable>
            )}

            <Text style={styles.date}>{new Date(item.created_at).toLocaleDateString()}</Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  tabRow: { flexDirection: "row", gap: 8, paddingHorizontal: 16, marginVertical: 16 },
  tabButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    alignItems: "center",
    backgroundColor: "#f3f4f6",
  },
  tabButtonActive: { backgroundColor: "#111827" },
  tabButtonText: { fontSize: 13, fontWeight: "600", color: "#374151" },
  tabButtonTextActive: { color: "#fff" },
  list: { paddingHorizontal: 16, paddingBottom: 24 },
  empty: { textAlign: "center", color: "#999", marginTop: 40 },
  card: {
    padding: 16,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e5e7eb",
    marginBottom: 12,
  },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  orderId: { fontSize: 13, color: "#6b7280", fontWeight: "600" },
  status: { fontSize: 12, fontWeight: "700", textTransform: "uppercase" },
  itemLine: { fontSize: 14, color: "#111827", marginTop: 2 },
  total: { fontSize: 13, fontWeight: "600", color: "#111827", marginTop: 8 },
  tracking: { fontSize: 12, color: "#2563eb", marginTop: 6 },
  date: { fontSize: 11, color: "#9ca3af", marginTop: 6 },
});
