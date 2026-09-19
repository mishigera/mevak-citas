import React, { useState } from "react";
import { View, Text, StyleSheet, Alert } from "react-native";
import { router } from "expo-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Colors } from "@/constants/colors";
import { Radius, Space } from "@/constants/theme";
import { Screen, ScreenScroll } from "@/components/Screen";
import { Stagger, PressableMotion } from "@/components/motion";
import { BotonPrimario, CampoTexto } from "@/components/Formulario";
import { apiRequest } from "@/lib/query-client";
import * as Haptics from "expo-haptics";

export default function NewClientScreen() {
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
    <Screen
      title="Nuevo cliente"
      hasTabBar={false}
      backIcon="close"
      onBack={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/clients"))}
    >
      <ScreenScroll>
        {/* Los campos entran escalonados: el formulario se despliega en vez de
            aparecer entero de golpe. */}
        <Stagger style={styles.campos}>
          <CampoTexto
            etiqueta="Nombre completo *"
            value={fullName}
            onChangeText={setFullName}
            placeholder="Nombre y apellidos"
          />
          <CampoTexto
            etiqueta="Teléfono *"
            value={phone}
            onChangeText={setPhone}
            placeholder="555-1234"
            keyboardType="phone-pad"
          />
          <CampoTexto
            etiqueta="Correo electrónico"
            value={email}
            onChangeText={setEmail}
            placeholder="correo@ejemplo.com"
            keyboardType="email-address"
            autoCapitalize="none"
          />
          <CampoTexto
            etiqueta="Fecha de nacimiento (YYYY-MM-DD)"
            value={birthDate}
            onChangeText={setBirthDate}
            placeholder="1990-05-15"
            keyboardType="numeric"
          />

          <View style={styles.grupo}>
            <Text style={styles.etiqueta}>Sexo</Text>
            <View style={styles.sexoFila}>
              {[{ val: "F" as const, label: "Femenino" }, { val: "M" as const, label: "Masculino" }].map((opt) => (
                <PressableMotion
                  key={opt.val}
                  gesto="sutil"
                  accessibilityLabel={opt.label}
                  accessibilityState={{ selected: sex === opt.val }}
                  style={[
                    styles.sexoBoton,
                    sex === opt.val && { backgroundColor: Colors.primary, borderColor: Colors.primary },
                  ]}
                  onPress={() => setSex((v) => (v === opt.val ? "" : opt.val))}
                >
                  <Text style={[styles.sexoTexto, sex === opt.val && { color: "#fff" }]}>{opt.label}</Text>
                </PressableMotion>
              ))}
            </View>
          </View>

          <CampoTexto
            etiqueta="Ocupación"
            value={occupation}
            onChangeText={setOccupation}
            placeholder="Profesión u ocupación"
          />

          <BotonPrimario
            titulo="Guardar cliente"
            style={styles.guardar}
            cargando={createMutation.isPending}
            disabled={!fullName.trim() || !phone.trim()}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              createMutation.mutate();
            }}
          />
        </Stagger>
      </ScreenScroll>
    </Screen>
  );
}

const styles = StyleSheet.create({
  campos: { gap: Space.lg },
  grupo: { gap: 6 },
  etiqueta: { fontFamily: "Nunito_600SemiBold", fontSize: 12, color: Colors.textSecondary, marginLeft: Space.xs },
  sexoFila: { flexDirection: "row", gap: Space.md - 2 },
  sexoBoton: {
    flex: 1,
    paddingVertical: Space.md + 2,
    borderRadius: Radius.tile,
    borderWidth: 2,
    borderColor: Colors.glass.strokeSoft,
    backgroundColor: Colors.glass.fillSolidStrong,
    alignItems: "center",
  },
  sexoTexto: { fontFamily: "Nunito_700Bold", fontSize: 14, color: Colors.textSecondary },
  guardar: { marginTop: Space.sm, paddingVertical: Space.lg },
});
