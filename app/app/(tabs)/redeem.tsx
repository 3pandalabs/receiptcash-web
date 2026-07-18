import { useMemo, useState } from "react";
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
  const [cart, setCart] = useState<Record<string, number>>({});
  const [isCheckingOut, setIsCheckingOut] = useState(false);

  const cartTotal = useMemo(() => {
    return gifts.reduce((sum, gift) => sum + (cart[gift.id] ?? 0) * gift.points_cost, 0);
  }, [cart, gifts]);

  const cartItemCount = useMemo(
    () => Object.values(cart).reduce((sum, qty) => sum + qty, 0),
    [cart]
  );

  function updateQuantity(gift: Gift, delta: number) {
    setCart((prev) => {
      const current = prev[gift.id] ?? 0;
      const max = gift.stock_level ?? Infinity;
      const next = Math.max(0, Math.min(current + delta, max));
      const updated = { ...prev, [gift.id]: next };
      if (next === 0) delete updated[gift.id];
      return updated;
    });
  }

  async function handleCheckout() {
    const items = Object.entries(cart).map(([giftId, quantity]) => ({ giftId, quantity }));
    if (items.length === 0) return;

    setIsCheckingOut(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      const { error } = await supabase.functions.invoke("redeem-cart", {
        body: { items },
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
      });

      if (error) {
        const context = (error as { context?: Response }).context;
        if (context) {
          const body = await context.json().catch(() => null);
          throw new Error(body?.error ?? "Checkout failed");
        }
        throw error;
      }

      Alert.alert("Order placed!", "Your redemption is being processed.");
      setCart({});
      await Promise.all([refreshBalance(), refresh()]);
    } catch (err) {
      Alert.alert("Checkout failed", getErrorMessage(err));
    } finally {
      setIsCheckingOut(false);
    }
  }

  const canAffordCart = (balance ?? 0) >= cartTotal;

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
          const quantity = cart[item.id] ?? 0;
          const outOfStock = item.stock_level !== null && item.stock_level <= 0;
          const atMax = item.stock_level !== null && quantity >= item.stock_level;
          return (
            <View style={styles.card}>
              <Text style={styles.emoji}>{item.image_emoji ?? "🎁"}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.giftName}>{item.name}</Text>
                {item.description && <Text style={styles.giftDesc}>{item.description}</Text>}
                <Text style={styles.giftCost}>{item.points_cost} points</Text>
                {outOfStock && <Text style={styles.outOfStock}>Out of stock</Text>}
                {!outOfStock && item.stock_level !== null && (
                  <Text style={styles.stock}>{item.stock_level} left</Text>
                )}
              </View>
              {!outOfStock && (
                <View style={styles.stepper}>
                  <Pressable
                    style={styles.stepperButton}
                    onPress={() => updateQuantity(item, -1)}
                    disabled={quantity === 0}
                  >
                    <Text style={styles.stepperButtonText}>-</Text>
                  </Pressable>
                  <Text style={styles.stepperValue}>{quantity}</Text>
                  <Pressable
                    style={styles.stepperButton}
                    onPress={() => updateQuantity(item, 1)}
                    disabled={atMax}
                  >
                    <Text style={styles.stepperButtonText}>+</Text>
                  </Pressable>
                </View>
              )}
            </View>
          );
        }}
      />

      {cartItemCount > 0 && (
        <View style={styles.checkoutBar}>
          <Text style={styles.checkoutSummary}>
            {cartItemCount} item{cartItemCount > 1 ? "s" : ""} · {cartTotal} points
          </Text>
          <Pressable
            style={[styles.checkoutButton, !canAffordCart && styles.checkoutButtonDisabled]}
            onPress={handleCheckout}
            disabled={!canAffordCart || isCheckingOut}
          >
            {isCheckingOut ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.checkoutButtonText}>
                {canAffordCart ? "Checkout" : "Not enough points"}
              </Text>
            )}
          </Pressable>
        </View>
      )}
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
    gap: 12,
  },
  emoji: { fontSize: 28 },
  giftName: { fontSize: 16, fontWeight: "600" },
  giftDesc: { fontSize: 13, color: "#666", marginTop: 2 },
  giftCost: { fontSize: 13, color: "#111827", marginTop: 6, fontWeight: "600" },
  outOfStock: { fontSize: 12, color: "#dc2626", marginTop: 2, fontWeight: "600" },
  stock: { fontSize: 12, color: "#999", marginTop: 2 },
  stepper: { flexDirection: "row", alignItems: "center", gap: 8 },
  stepperButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#111827",
    alignItems: "center",
    justifyContent: "center",
  },
  stepperButtonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  stepperValue: { fontSize: 15, fontWeight: "600", minWidth: 18, textAlign: "center" },
  checkoutBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#e5e7eb",
  },
  checkoutSummary: { fontSize: 14, color: "#374151" },
  checkoutButton: {
    backgroundColor: "#111827",
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  checkoutButtonDisabled: { backgroundColor: "#d1d5db" },
  checkoutButtonText: { color: "#fff", fontWeight: "600" },
});
