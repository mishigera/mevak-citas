import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { Redirect, router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@/contexts/auth";
import { Colors } from "@/constants/colors";
import * as Haptics from "expo-haptics";

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
      Alert.alert("Error", "Ingresa correo y contraseña");
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLoading(true);
    try {
      await login(email.trim().toLowerCase(), password);
      router.replace("/(tabs)");
    } catch (err: any) {
      Alert.alert("Error", err.message || "Credenciales incorrectas");
    } finally {
      setLoading(false);
    }
  };

  return (
    <LinearGradient colors={["#FAF4F0", "#F5E6E8", "#EDD5D8"]} style={styles.gradient}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.logoContainer}>
            <View style={styles.logoCircle}>
              <Ionicons name="flower-outline" size={40} color={Colors.primary} />
            </View>
            <Text style={styles.brandName}>Beauty Center</Text>
            <Text style={styles.brandSub}>Sistema de gestión</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Iniciar sesión</Text>

            <View style={styles.inputWrapper}>
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
            </View>

            <View style={styles.inputWrapper}>
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
              <Pressable onPress={() => setShowPass((v) => !v)} hitSlop={8}>
                <Ionicons name={showPass ? "eye-off-outline" : "eye-outline"} size={20} color={Colors.textMuted} />
              </Pressable>
            </View>

            <Pressable
              style={({ pressed }) => [styles.loginBtn, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]}
              onPress={handleLogin}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.loginBtnText}>Entrar</Text>
              )}
            </Pressable>
          </View>

          <View style={styles.hints}>
            <Text style={styles.hintTitle}>Cuentas demo:</Text>
            {[
              { label: "Admin", email: "admin@beauty.com", pass: "admin123" },
              { label: "Owner (Laserista)", email: "owner@beauty.com", pass: "owner123" },
              { label: "Recepcionista", email: "recep@beauty.com", pass: "recep123" },
              { label: "Facialista", email: "fac@beauty.com", pass: "fac123" },
            ].map((h) => (
              <Pressable
                key={h.email}
                style={({ pressed }) => [styles.hintBtn, pressed && { opacity: 0.7 }]}
                onPress={() => { setEmail(h.email); setPassword(h.pass); }}
              >
                <Text style={styles.hintLabel}>{h.label}</Text>
                <Text style={styles.hintEmail}>{h.email}</Text>
              </Pressable>
            ))}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  scroll: { paddingHorizontal: 24, flexGrow: 1 },
  logoContainer: { alignItems: "center", marginBottom: 32 },
  logoCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
    marginBottom: 16,
  },
  brandName: { fontFamily: "Nunito_800ExtraBold", fontSize: 28, color: Colors.text },
  brandSub: { fontFamily: "Nunito_400Regular", fontSize: 14, color: Colors.textSecondary, marginTop: 4 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 24,
    padding: 24,
    gap: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 4,
  },
  cardTitle: { fontFamily: "Nunito_700Bold", fontSize: 20, color: Colors.text, marginBottom: 4 },
  inputWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: Colors.background,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  inputIcon: { marginRight: 10 },
  input: {
    flex: 1,
    fontFamily: "Nunito_400Regular",
    fontSize: 16,
    color: Colors.text,
  },
  loginBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: "center",
    marginTop: 4,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  loginBtnText: { fontFamily: "Nunito_700Bold", fontSize: 16, color: "#fff" },
  hints: { marginTop: 24, gap: 8 },
  hintTitle: { fontFamily: "Nunito_600SemiBold", fontSize: 13, color: Colors.textSecondary, marginBottom: 4 },
  hintBtn: {
    backgroundColor: "rgba(255,255,255,0.6)",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.border,
  },
  hintLabel: { fontFamily: "Nunito_700Bold", fontSize: 13, color: Colors.text },
  hintEmail: { fontFamily: "Nunito_400Regular", fontSize: 12, color: Colors.textMuted },
});
