import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  TextInput,
  RefreshControl,
} from "react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";
import { Blur, Radius, Space } from "@/constants/theme";
import { useBreakpoint } from "@/lib/responsive";
import { Screen, useScreenLayout } from "@/components/Screen";
import { GlassCard, GlassIconButton, GlassSurface } from "@/components/glass";
import { CargandoLista, EstadoVacio } from "@/components/Estados";
import * as Haptics from "expo-haptics";
import { getApiUrl, getAuthToken } from "@/lib/query-client";
import { fetch } from "expo/fetch";

function getInitials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || "")
    .join("");
}

function ClientRow({ item, onPress }: { item: any; onPress: () => void }) {
  return (
    <GlassCard onPress={onPress} radius={Radius.card} style={styles.rowContenedor}>
      <View style={styles.row}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{getInitials(item.fullName)}</Text>
        </View>
        <View style={styles.rowContent}>
          <Text style={styles.rowName} numberOfLines={1}>{item.fullName}</Text>
          <Text style={styles.rowPhone}>{item.phone}</Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
      </View>
    </GlassCard>
  );
}

function Buscador({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <GlassSurface tone="neutral" intensity={Blur.panel} radius={Radius.control} style={styles.searchBar}>
      <Ionicons name="search-outline" size={18} color={Colors.textMuted} style={{ marginRight: Space.sm }} />
      <TextInput
        style={styles.searchInput}
        placeholder="Buscar por nombre o teléfono..."
        placeholderTextColor={Colors.textMuted}
        value={value}
        onChangeText={onChange}
        returnKeyType="search"
      />
      {value.length > 0 && (
        <Pressable onPress={() => onChange("")} hitSlop={10}>
          <Ionicons name="close-circle" size={18} color={Colors.textMuted} />
        </Pressable>
      )}
    </GlassSurface>
  );
}

function Lista({
  clientes,
  isLoading,
  refreshing,
  onRefresh,
  search,
}: {
  clientes: any[];
  isLoading: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  search: string;
}) {
  const { paddingTop, paddingBottom, gutter, contentMaxWidth } = useScreenLayout();
  const { isExpanded } = useBreakpoint();
  // En iPad apaisado, dos columnas: una lista de una columna a 860 px de ancho es
  // una fila por cliente con medio metro de hueco a la derecha.
  const columnas = isExpanded ? 2 : 1;

  if (isLoading) {
    return (
      <View style={{ paddingTop, paddingHorizontal: gutter }}>
        <CargandoLista filas={4} />
      </View>
    );
  }

  return (
    <FlatList
      // Cambiar `numColumns` en caliente exige remontar la lista; de ahi la key.
      key={columnas}
      data={clientes}
      numColumns={columnas}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <ClientRow
          item={item}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push(`/client/${item.id}`);
          }}
        />
      )}
      columnWrapperStyle={columnas > 1 ? styles.fila : undefined}
      contentContainerStyle={[
        {
          paddingTop,
          paddingBottom,
          paddingHorizontal: gutter,
          gap: Space.md,
          width: "100%",
          alignSelf: "center",
        },
        contentMaxWidth > 0 && { maxWidth: contentMaxWidth },
        clientes.length === 0 && styles.vacioContenedor,
      ]}
      showsVerticalScrollIndicator={false}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
      scrollEnabled={!!clientes.length}
      ListEmptyComponent={
        <EstadoVacio
          icono="people-outline"
          titulo={search ? "Sin resultados" : "Sin clientes"}
          texto={search ? `No se encontró "${search}"` : "Toca + para agregar un cliente"}
        />
      }
    />
  );
}

export default function ClientsScreen() {
  const [search, setSearch] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const { data: clients, isLoading, refetch } = useQuery<any[]>({
    queryKey: ["/api/clients"],
    queryFn: async () => {
      const base = getApiUrl();
      const url = new URL("/api/clients", base);
      const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${getAuthToken() || ""}` } });
      if (!res.ok) throw new Error("Error");
      return res.json() as Promise<any[]>;
    },
  });

  const filtered = (clients || []).filter(
    (c) => c.fullName.toLowerCase().includes(search.toLowerCase()) || c.phone.includes(search),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  return (
    <Screen
      avisos
      title="Clientes"
      action={
        <GlassIconButton
          name="add"
          variant="primary"
          accessibilityLabel="Nuevo cliente"
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            router.push("/client/new");
          }}
        />
      }
      below={<Buscador value={search} onChange={setSearch} />}
    >
      <Lista
        clientes={filtered}
        isLoading={isLoading}
        refreshing={refreshing}
        onRefresh={onRefresh}
        search={search}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  searchBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: Space.lg, paddingVertical: Space.md },
  searchInput: { flex: 1, fontFamily: "Nunito_400Regular", fontSize: 15, color: Colors.text },

  fila: { gap: Space.md },
  rowContenedor: { flex: 1 },
  row: { flexDirection: "row", alignItems: "center", padding: Space.lg - 2 },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: Colors.primaryLight,
    justifyContent: "center",
    alignItems: "center",
    marginRight: Space.md,
  },
  avatarText: { fontFamily: "Nunito_700Bold", fontSize: 16, color: Colors.primaryDark },
  rowContent: { flex: 1, minWidth: 0 },
  rowName: { fontFamily: "Nunito_700Bold", fontSize: 15, color: Colors.text },
  rowPhone: { fontFamily: "Nunito_400Regular", fontSize: 13, color: Colors.textSecondary, marginTop: 2 },

  vacioContenedor: { flexGrow: 1, justifyContent: "center" },
});
