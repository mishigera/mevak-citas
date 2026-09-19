/**
 * Plantilla del HTML que envuelve la app en web. Antes no existia y Expo generaba
 * una por defecto; se crea para tres cosas que el iPad y el iPhone necesitan:
 *
 *  - `viewport-fit=cover`: sin esto los safe-area insets valen 0 al abrir la app
 *    desde la pantalla de inicio, y la barra de pestañas flotante se come el
 *    indicador de inicio.
 *  - las meta de `apple-mobile-web-app-*`, para que al anadirla a la pantalla de
 *    inicio se abra sin la barra de Safari.
 *  - `lang="es"`: la app esta en espanol y la plantilla por defecto decia `en`.
 *
 * Solo se ejecuta al construir el HTML; no se monta en la app.
 */
import { ScrollViewStyleReset } from "expo-router/html";
import type { PropsWithChildren } from "react";

// El fondo del documento tiene que coincidir con el final del degradado de
// `AmbientBackground`, o al rebotar el scroll asoma una franja blanca.
const estilosBase = `
  html, body { background-color: #F7EAF0; }
  body {
    overscroll-behavior: none;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }
  /* El chrome de vidrio se posiciona con estos insets. */
  :root {
    --safe-top: env(safe-area-inset-top, 0px);
    --safe-bottom: env(safe-area-inset-bottom, 0px);
  }
`;

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="es">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover"
        />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="Mevak" />
        <meta name="theme-color" content="#F7EAF0" />

        {/* Reset recomendado por Expo para que los ScrollView se comporten en web. */}
        <ScrollViewStyleReset />

        <style dangerouslySetInnerHTML={{ __html: estilosBase }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
