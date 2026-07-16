import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useGifts, type Gift } from "../../hooks/useGifts";
import { usePointsBalance } from "../../hooks/usePointsBalance";
import { supabase } from "../../lib/supabase";
import { getErrorMessage } from "../../lib/errors";

export default function RedeemScreen() {
  const { gifts, isLoading, refresh } = useGifts();
  const { balance, refresh: refreshBalance } = usePointsBalance();
  const [redeemingId, setRedeemingId] = useState<string | null>(null);

  async function handleRedeem(gift: Gift) {
    setRedeemingId(gift.id);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      const { error } = await supabase.functions.invoke("redeem-points", {
        body: { giftId: gift.id },
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
      });

      if (error) throw error;

      Alert.alert("Redeemed!", `${gift.name} has been redeemed.`);
      await refreshBalance();
    } catch (err) {
      Alert.alert("Redemption failed", getErrorMessage(err));
    } finally {
      setRedeemingId(null);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.balanceText}>Balance: {balance ?? 0} points</Text>

      <FlatList
        data={gifts}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        onRefresh={refresh}
        refreshing={isLoading}
        ListEmptyComponent={
          !isLoading ? <Text style={styles.empty}>No gifts available yet.</Text> : null
        }
        renderItem={({ item }) => {
          const canAfford = (balance ?? 0) >= item.points_cost;
          return (
            <View style={styles.card}>
              <View style={{ flex: 1 }}>
                <Text style={styles.giftName}>{item.name}</Text>
                {item.description && <Text style={styles.giftDesc}>{item.description}</Text>}
                <Text style={styles.giftCost}>{item.points_cost} points</Text>
              </View>
              <Pressable
                style={[styles.redeemButton, !canAfford && styles.redeemButtonDisabled]}
                onPress={() => handleRedeem(item)}
                disabled={!canAfford || redeemingId === item.id}
              >
                {redeemingId === item.id ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.redeemButtonText}>Redeem</Text>
                )}
              </Pressable>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  balanceText: {
    textAlign: "center",
    fontSize: 14,
    color: "#666",
    marginVertical: 16,
  },
  list: { paddingHorizontal: 16, paddingBottom: 24 },
  empty: { textAlign: "center", color: "#999", marginTop: 40 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e5e7eb",
    marginBottom: 12,
  },
  giftName: { fontSize: 16, fontWeight: "600" },
  giftDesc: { fontSize: 13, color: "#666", marginTop: 2 },
  giftCost: { fontSize: 13, color: "#111827", marginTop: 6, fontWeight: "600" },
  redeemButton: {
    backgroundColor: "#111827",
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  redeemButtonDisabled: { backgroundColor: "#d1d5db" },
  redeemButtonText: { color: "#fff", fontWeight: "600" },
});
