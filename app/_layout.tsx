import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { queryClient } from "@/lib/query-client";
import { Motion } from "@/constants/motion";
import { useFonts, Nunito_400Regular, Nunito_600SemiBold, Nunito_700Bold, Nunito_800ExtraBold } from "@expo-google-fonts/nunito";
import { AuthProvider, useAuth } from "@/contexts/auth";
import { SafeAreaProvider } from "react-native-safe-area-context";

SplashScreen.preventAutoHideAsync();

function RootLayoutNav() {
  const { isLoading } = useAuth();

  if (isLoading) return null;

  // `contentStyle` transparente para que la escena no pinte encima del fondo
  // ambiental que monta cada pantalla.
  //
  // El fundido entre rutas lo pone el propio navegador de pila: es lo que hace que
  // cambiar de pantalla se lea como una transición y no como un corte. Las pantallas
  // no tienen que animarse por su cuenta para eso; ellas solo animan su contenido.
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: "transparent" },
        animation: "fade",
        animationDuration: Motion.duracionCorta,
      }}
    >
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="appointment/[id]" options={{ headerShown: false, presentation: "modal" }} />
      <Stack.Screen name="appointment/new" options={{ headerShown: false, presentation: "modal" }} />
      {/* La ficha de cliente no es modal: entra lateralmente, como una navegación
          hacia dentro, y no como una hoja que sube. */}
      <Stack.Screen name="client/[id]" options={{ headerShown: false, animation: "slide_from_right" }} />
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
