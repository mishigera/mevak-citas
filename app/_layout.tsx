import { QueryClientProvider } from "@tanstack/react-query";
import { Redirect, Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { queryClient } from "@/lib/query-client";
import { useFonts, Nunito_400Regular, Nunito_600SemiBold, Nunito_700Bold, Nunito_800ExtraBold } from "@expo-google-fonts/nunito";
import { AuthProvider, useAuth } from "@/contexts/auth";
import { SafeAreaProvider } from "react-native-safe-area-context";

SplashScreen.preventAutoHideAsync();

function RootLayoutNav() {
  const { user, isLoading } = useAuth();

  if (isLoading) return null;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="appointment/[id]" options={{ headerShown: false, presentation: "modal" }} />
      <Stack.Screen name="appointment/new" options={{ headerShown: false, presentation: "modal" }} />
      <Stack.Screen name="client/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="client/new" options={{ headerShown: false, presentation: "modal" }} />
      <Stack.Screen name="blocks" options={{ headerShown: false, presentation: "modal" }} />
      <Stack.Screen name="admin/payments" options={{ headerShown: false, presentation: "modal" }} />
      <Stack.Screen name="admin/reports" options={{ headerShown: false, presentation: "modal" }} />
      <Stack.Screen name="admin/services" options={{ headerShown: false, presentation: "modal" }} />
      <Stack.Screen name="admin/packages" options={{ headerShown: false, presentation: "modal" }} />
      <Stack.Screen name="admin/users" options={{ headerShown: false, presentation: "modal" }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Nunito_400Regular,
    Nunito_600SemiBold,
    Nunito_700Bold,
    Nunito_800ExtraBold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <GestureHandlerRootView style={{ flex: 1 }}>
              <KeyboardProvider>
                <RootLayoutNav />
              </KeyboardProvider>
            </GestureHandlerRootView>
          </AuthProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
