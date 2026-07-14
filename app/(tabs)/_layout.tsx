import { Tabs } from "expo-router";

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: true }}>
      <Tabs.Screen name="index" options={{ title: "Home" }} />
      <Tabs.Screen name="receipts" options={{ title: "Receipts" }} />
      <Tabs.Screen name="redeem" options={{ title: "Redeem" }} />
    </Tabs>
  );
}
