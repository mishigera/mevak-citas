import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";
import { apiRequest } from "@/lib/query-client";
import * as Haptics from "expo-haptics";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

export default function NewClientScreen() {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [sex, setSex] = useState<"M" | "F" | "">("");
  const [occupation, setOccupation] = useState("");

  const clearForm = () => {
    setFullName("");
    setPhone("");
    setEmail("");
    setBirthDate("");
    setSex("");
    setOccupation("");
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/clients", {
        fullName: fullName.trim(),
        phone: phone.trim(),
        email: email.trim() || undefined,
        birthDate: birthDate.trim() || undefined,
        sex: sex || undefined,
        occupation: occupation.trim() || undefined,
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      qc.invalidateQueries({ queryKey: ["/api/clients"] });
      clearForm();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert("Cliente generado", `${data.fullName} se creó correctamente.`, [
        {
          text: "Aceptar",
          onPress: () => router.replace("/(tabs)/clients"),
        },
      ]);
    },
    onError: (err: Error) => Alert.alert("Error", `No se pudo generar el cliente. ${err.message}`),
  });

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/clients"))} hitSlop={12}>
          <Ionicons name="close" size={24} color={Colors.text} />
        </Pressable>
        <Text style={styles.title}>Nuevo cliente</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Field label="Nombre completo *">
          <TextInput
            style={styles.input}
            value={fullName}
            onChangeText={setFullName}
            placeholder="Nombre y apellidos"
            placeholderTextColor={Colors.textMuted}
          />
        </Field>

        <Field label="Teléfono *">
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            placeholder="555-1234"
            placeholderTextColor={Colors.textMuted}
            keyboardType="phone-pad"
          />
        </Field>

        <Field label="Correo electrónico">
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="correo@ejemplo.com"
            placeholderTextColor={Colors.textMuted}
            keyboardType="email-address"
            autoCapitalize="none"
          />
        </Field>

        <Field label="Fecha de nacimiento (YYYY-MM-DD)">
          <TextInput
            style={styles.input}
            value={birthDate}
            onChangeText={setBirthDate}
            placeholder="1990-05-15"
            placeholderTextColor={Colors.textMuted}
            keyboardType="numeric"
          />
        </Field>

        <Field label="Sexo">
          <View style={styles.sexRow}>
            {[{ val: "F" as const, label: "Femenino" }, { val: "M" as const, label: "Masculino" }].map((opt) => (
              <Pressable
                key={opt.val}
                style={[styles.sexBtn, sex === opt.val && { backgroundColor: Colors.primary, borderColor: Colors.primary }]}
                onPress={() => setSex((v) => v === opt.val ? "" : opt.val)}
              >
                <Text style={[styles.sexBtnText, sex === opt.val && { color: "#fff" }]}>{opt.label}</Text>
              </Pressable>
            ))}
          </View>
        </Field>

        <Field label="Ocupación">
          <TextInput
            style={styles.input}
            value={occupation}
            onChangeText={setOccupation}
            placeholder="Profesión u ocupación"
            placeholderTextColor={Colors.textMuted}
          />
        </Field>

        <Pressable
          style={({ pressed }) => [styles.saveBtn, (!fullName.trim() || !phone.trim()) && { opacity: 0.5 }, pressed && { opacity: 0.85 }]}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); createMutation.mutate(); }}
          disabled={!fullName.trim() || !phone.trim() || createMutation.isPending}
        >
          {createMutation.isPending ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Guardar cliente</Text>}
        </Pressable>
        <View style={{ height: 60 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingBottom: 16 },
  title: { fontFamily: "Nunito_700Bold", fontSize: 18, color: Colors.text },
  scroll: { flex: 1, paddingHorizontal: 20 },
  field: { marginBottom: 16 },
  fieldLabel: { fontFamily: "Nunito_600SemiBold", fontSize: 13, color: Colors.textSecondary, marginBottom: 6 },
  input: { backgroundColor: Colors.surface, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, borderWidth: 1, borderColor: Colors.border, fontFamily: "Nunito_400Regular", fontSize: 15, color: Colors.text },
  sexRow: { flexDirection: "row", gap: 10 },
  sexBtn: { flex: 1, paddingVertical: 14, borderRadius: 14, borderWidth: 2, borderColor: Colors.border, backgroundColor: Colors.surface, alignItems: "center" },
  sexBtnText: { fontFamily: "Nunito_700Bold", fontSize: 14, color: Colors.textSecondary },
  saveBtn: { backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 16, alignItems: "center", marginTop: 8 },
  saveBtnText: { fontFamily: "Nunito_700Bold", fontSize: 16, color: "#fff" },
});
