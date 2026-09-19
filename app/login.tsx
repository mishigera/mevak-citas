import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Image,
} from "react-native";
import { Redirect, router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/contexts/auth";
import { Colors } from "@/constants/colors";
import { Blur, GlassShadow, Radius, Space } from "@/constants/theme";
import { GlassSurface } from "@/components/glass";
import { AmbientBackground } from "@/components/AmbientBackground";
import { Entrar, PressableMotion, Stagger } from "@/components/motion";
import * as Haptics from "expo-haptics";
import { alerta } from "@/lib/alerta";

export default function LoginScreen() {
  const { user, login } = useAuth();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);

  if (user) return <Redirect href="/(tabs)" />;

  const handleLogin = async () => {
    if (!email || !password) {
      alerta("Error", "Ingresa correo y contraseña");
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLoading(true);
    try {
      await login(email.trim().toLowerCase(), password);
      router.replace("/(tabs)");
    } catch (err: any) {
      const message = String(err?.message || "");
      if (message.includes("401") || message.toLowerCase().includes("credenciales incorrectas")) {
        alerta("Inicio de sesión", "Usuario o contraseña no válido");
      } else {
        alerta("Error", "No se pudo iniciar sesión. Intenta de nuevo.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    // Antes había aquí un LinearGradient de blanco a blanco a blanco.
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.contenedor}>
      <AmbientBackground />
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + Space.xxl, paddingBottom: insets.bottom + Space.xl },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Columna con tope de ancho: en iPad el formulario se queda centrado y del
            tamaño de un formulario, no estirado a lo ancho de la pantalla. */}
        {/* La entrada se escalona: logo, tarjeta y pie, uno detrás de otro. */}
        <Stagger style={styles.columna}>
          <Entrar style={styles.logoContainer}>
            <GlassSurface tone="strong" intensity={Blur.panel} radius={40} style={styles.logoCircle}>
              <Image
                source={require("../assets/images/mevak-logo-small.png")}
                style={styles.logoImage}
                resizeMode="contain"
              />
            </GlassSurface>
            <Text style={styles.brandName}>Mevak Beauty Center</Text>
            <Text style={styles.brandSub}>Sistema de gestión</Text>
          </Entrar>

          <GlassSurface tone="neutral" intensity={Blur.panel} radius={Radius.panel} elevation="lifted" style={styles.card}>
            <Text style={styles.cardTitle}>Iniciar sesión</Text>

            <GlassSurface tone="soft" intensity={Blur.control} radius={Radius.control} elevation="none" style={styles.inputWrapper}>
              <Ionicons name="mail-outline" size={20} color={Colors.textMuted} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                placeholder="Correo electrónico"
                placeholderTextColor={Colors.textMuted}
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </GlassSurface>

            <GlassSurface tone="soft" intensity={Blur.control} radius={Radius.control} elevation="none" style={styles.inputWrapper}>
              <Ionicons name="lock-closed-outline" size={20} color={Colors.textMuted} style={styles.inputIcon} />
              <TextInput
                style={[styles.input, { flex: 1 }]}
                placeholder="Contraseña"
                placeholderTextColor={Colors.textMuted}
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPass}
                returnKeyType="done"
                onSubmitEditing={handleLogin}
              />
              <PressableMotion
                gesto="escala"
                accessibilityLabel={showPass ? "Ocultar contraseña" : "Mostrar contraseña"}
                onPress={() => setShowPass((v) => !v)}
                hitSlop={8}
              >
                <Ionicons name={showPass ? "eye-off-outline" : "eye-outline"} size={20} color={Colors.textMuted} />
              </PressableMotion>
            </GlassSurface>

            {/* La accion principal se queda en rosa solido: si también fuera de vidrio
                se perderia cual es el botón que importa. */}
            <PressableMotion
              gesto="elevar"
              accessibilityLabel="Entrar"
              style={styles.loginBtn}
              onPress={handleLogin}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.loginBtnText}>Entrar</Text>
              )}
            </PressableMotion>
          </GlassSurface>

          <View style={styles.hints}>
            <Text style={styles.hintTitle}>Acceso restringido para personal autorizado.</Text>
          </View>
        </Stagger>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  contenedor: { flex: 1 },
  scroll: { paddingHorizontal: Space.xl, flexGrow: 1, justifyContent: "center" },
  columna: { width: "100%", maxWidth: 440, alignSelf: "center" },
  logoContainer: { alignItems: "center", marginBottom: Space.xxl },
  logoCircle: {
    width: 80,
    height: 80,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Space.lg,
  },
  logoImage: { width: 62, height: 62 },
  brandName: { fontFamily: "Nunito_800ExtraBold", fontSize: 28, color: Colors.text, textAlign: "center" },
  brandSub: { fontFamily: "Nunito_400Regular", fontSize: 14, color: Colors.textSecondary, marginTop: 4 },
  card: { padding: Space.xl, gap: Space.lg },
  cardTitle: { fontFamily: "Nunito_700Bold", fontSize: 20, color: Colors.text, marginBottom: Space.xs },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: Space.lg,
    paddingVertical: Space.lg - 2,
  },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, fontFamily: "Nunito_400Regular", fontSize: 16, color: Colors.text },
  loginBtn: {
    backgroundColor: Colors.primary,
    borderRadius: Radius.control,
    paddingVertical: Space.lg,
    alignItems: "center",
    marginTop: Space.xs,
    ...GlassShadow,
    shadowOpacity: 0.28,
  },
  loginBtnText: { fontFamily: "Nunito_700Bold", fontSize: 16, color: "#fff" },
  hints: { marginTop: Space.xl, alignItems: "center" },
  hintTitle: { fontFamily: "Nunito_600SemiBold", fontSize: 13, color: Colors.textSecondary, textAlign: "center" },
});
