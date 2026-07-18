import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useAuth } from "../../hooks/useAuth";
import { usePointsBalance } from "../../hooks/usePointsBalance";

export default function HomeScreen() {
  const { session, signOut } = useAuth();
  const { balance, isLoading, refresh } = usePointsBalance();

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refresh} />}
    >
      <Text style={styles.greeting}>{session?.user.email}</Text>

      <View style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>Points balance</Text>
        <Text style={styles.balanceValue}>{isLoading ? "..." : (balance ?? 0)}</Text>
        <Text style={styles.balanceHint}>1 point = $0.01 cashback</Text>
      </View>

      <Pressable style={styles.signOutButton} onPress={signOut}>
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 24,
    flexGrow: 1,
  },
  greeting: {
    fontSize: 14,
    color: "#666",
    marginBottom: 24,
  },
  balanceCard: {
    backgroundColor: "#111827",
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    marginBottom: 24,
  },
  balanceLabel: {
    color: "#9ca3af",
    fontSize: 14,
    marginBottom: 8,
  },
  balanceValue: {
    color: "#fff",
    fontSize: 48,
    fontWeight: "700",
  },
  balanceHint: {
    color: "#9ca3af",
    fontSize: 12,
    marginTop: 8,
  },
  signOutButton: {
    alignSelf: "center",
    paddingVertical: 12,
    paddingHorizontal: 20,
  },
  signOutText: {
    color: "#dc2626",
    fontSize: 14,
  },
});
