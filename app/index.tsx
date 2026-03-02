import { Redirect } from "expo-router";
import { useAuth } from "@/contexts/auth";
import { View, ActivityIndicator } from "react-native";
import { Colors } from "@/constants/colors";

export default function IndexPage() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: Colors.background }}>
        <ActivityIndicator color={Colors.primary} />
      </View>
    );
  }

  if (!user) return <Redirect href="/login" />;
  return <Redirect href="/(tabs)" />;
}
