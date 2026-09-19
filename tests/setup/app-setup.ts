/**
 * Mocks globales para los tests de `app/`, `components/`, `contexts/` y `lib/`.
 * Se cargan antes de cada archivo de test del proyecto "app".
 */

// AsyncStorage: implementación oficial en memoria.
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

// expo/fetch — la app no usa el fetch global, usa este.
// El mock se ancla a globalThis para que sobreviva a `jest.resetModules()`: si no,
// cada recarga crearía un jest.fn() nuevo y el test se quedaría con una referencia muerta.
jest.mock("expo/fetch", () => {
  const g = globalThis as { __mockExpoFetch?: jest.Mock };
  g.__mockExpoFetch ??= jest.fn();
  return { fetch: g.__mockExpoFetch };
});

// Ancho de la ventana. Jest arranca con 750x1334, que con los breakpoints de
// `lib/responsive` cae en "medium": sin esto, los tests de pantalla renderizarían el
// layout de iPad en vez del de celular contra el que se escribieron.
// Se ancla a globalThis para sobrevivir a `jest.resetModules()`; el harness lo
// devuelve a 390x844 después de cada test.
jest.mock("@/lib/responsive", () => {
  const real = jest.requireActual("@/lib/responsive");
  const g = globalThis as { __mockViewport?: { width: number; height: number } };
  g.__mockViewport ??= { width: 390, height: 844 };
  return {
    ...real,
    useBreakpoint: () => real.layoutFor(g.__mockViewport!.width, g.__mockViewport!.height),
  };
});

// Fuentes: que se consideren cargadas al instante.
jest.mock("expo-font", () => ({
  useFonts: () => [true, null],
  loadAsync: jest.fn(async () => {}),
  isLoaded: () => true,
}));
jest.mock("@expo-google-fonts/nunito", () => ({
  useFonts: () => [true, null],
  Nunito_400Regular: "Nunito_400Regular",
  Nunito_600SemiBold: "Nunito_600SemiBold",
  Nunito_700Bold: "Nunito_700Bold",
  Nunito_800ExtraBold: "Nunito_800ExtraBold",
}));

// Safe area: sin esto, todo componente que use useSafeAreaInsets revienta al renderizar.
jest.mock("react-native-safe-area-context", () => {
  const inset = { top: 0, right: 0, bottom: 0, left: 0 };
  const React = require("react");
  return {
    SafeAreaProvider: ({ children }: { children?: unknown }) => children,
    SafeAreaView: ({ children }: { children?: unknown }) => children,
    SafeAreaInsetsContext: React.createContext(inset),
    useSafeAreaInsets: () => inset,
    useSafeAreaFrame: () => ({ x: 0, y: 0, width: 390, height: 844 }),
    initialWindowMetrics: { insets: inset, frame: { x: 0, y: 0, width: 390, height: 844 } },
  };
});

// expo.reloadAppAsync, que usa ErrorFallback para reiniciar la app.
jest.mock("expo", () => ({ reloadAppAsync: jest.fn(async () => {}) }));

jest.mock("expo-splash-screen", () => ({
  preventAutoHideAsync: jest.fn(async () => {}),
  hideAsync: jest.fn(async () => {}),
}));

// `alert` global: en RN web existe, en el entorno de test no.
if (typeof globalThis.alert !== "function") {
  globalThis.alert = jest.fn();
} else {
  jest.spyOn(globalThis, "alert").mockImplementation(() => {});
}

// expo-linear-gradient y expo-blur: solo decoran, se pintan como Views.
jest.mock("expo-linear-gradient", () => {
  const { View } = require("react-native");
  return { LinearGradient: View };
});
jest.mock("expo-blur", () => {
  const { View } = require("react-native");
  return { BlurView: View };
});
jest.mock("expo-glass-effect", () => {
  const g = globalThis as { __mockLiquidGlass?: jest.Mock };
  g.__mockLiquidGlass ??= jest.fn(() => false);
  return {
    isLiquidGlassAvailable: g.__mockLiquidGlass,
    GlassView: require("react-native").View,
  };
});

jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn(async () => {}),
  notificationAsync: jest.fn(async () => {}),
  selectionAsync: jest.fn(async () => {}),
  ImpactFeedbackStyle: { Light: "light", Medium: "medium", Heavy: "heavy" },
  NotificationFeedbackType: { Success: "success", Warning: "warning", Error: "error" },
}));

// expo-router: navegación espiable desde los tests.
const mockRouter = {
  push: jest.fn(),
  replace: jest.fn(),
  back: jest.fn(),
  navigate: jest.fn(),
  dismiss: jest.fn(),
  dismissAll: jest.fn(),
  canGoBack: jest.fn(() => true),
  setParams: jest.fn(),
};

jest.mock("expo-router", () => {
  const React = require("react");
  const { View, Text } = require("react-native");

  // Los tipos van en línea: el plugin de jest.mock trata un alias declarado aquí
  // dentro como una variable fuera de ámbito y aborta la transformación.
  const passthrough = (name: string) =>
    ({ children, ...props }: { children?: unknown } & Record<string, unknown>) =>
      React.createElement(View, { testID: name, ...props }, children);

  return {
    router: mockRouter,
    useRouter: () => mockRouter,
    useLocalSearchParams: jest.fn(() => ({})),
    useGlobalSearchParams: jest.fn(() => ({})),
    useSegments: jest.fn(() => []),
    usePathname: jest.fn(() => "/"),
    useFocusEffect: jest.fn(),
    Link: ({ children, href }: { children?: unknown; href?: string }) =>
      React.createElement(Text, { testID: `link-${href}` }, children),
    Redirect: ({ href }: { href?: string }) => React.createElement(View, { testID: `redirect-${href}` }),
    Stack: Object.assign(passthrough("stack"), { Screen: passthrough("stack-screen") }),
    Tabs: Object.assign(passthrough("tabs"), { Screen: passthrough("tabs-screen") }),
    SplashScreen: { preventAutoHideAsync: jest.fn(), hideAsync: jest.fn() },
  };
});

// Se expone para que los tests puedan aseverar sobre la navegación.
(globalThis as Record<string, unknown>).__routerMock = mockRouter;

// Pestañas nativas de expo-router (solo existen en iOS 26+); en tests se pintan planas.
jest.mock("expo-router/unstable-native-tabs", () => {
  const React = require("react");
  const { View, Text } = require("react-native");
  const Contenedor = ({ children }: { children?: unknown }) =>
    React.createElement(View, { testID: "native-tabs" }, children);
  const Trigger = ({ children, name }: { children?: unknown; name?: string }) =>
    React.createElement(View, { testID: `native-tab-${name}` }, children);
  return {
    NativeTabs: Object.assign(Contenedor, { Trigger }),
    Icon: () => null,
    Label: ({ children }: { children?: unknown }) => React.createElement(Text, null, children),
  };
});

// Gesture handler: sin su setup, GestureHandlerRootView no pinta a sus hijos.
require("react-native-gesture-handler/jestSetup");

jest.mock("react-native-keyboard-controller", () =>
  require("react-native-keyboard-controller/jest"),
);

// Silencia el aviso de act() de las animaciones de reanimated.
jest.mock("react-native-reanimated", () => {
  try {
    return require("react-native-reanimated/mock");
  } catch {
    return {};
  }
});

/**
 * TanStack Query agrupa las notificaciones con un `setTimeout`. Al terminar un test
 * puede quedar un temporizador pendiente y Jest avisa de que el worker no cierra.
 * En tests conviene que sea síncrono: menos `act()` sueltos y sin temporizadores huérfanos.
 */
const { notifyManager } = require("@tanstack/react-query");
notifyManager.setScheduler((cb: () => void) => cb());
