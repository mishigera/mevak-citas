/**
 * Lo único que la app usa de `react-dom`: `createPortal`, en `components/glass/Portal.web.tsx`.
 *
 * `react-dom` viene con Expo para web pero sin tipos (`@types/react-dom` no está
 * instalado), y meter la dependencia entera por una función no compensa.
 */
declare module "react-dom" {
  import type { ReactNode, ReactPortal } from "react";
  export function createPortal(children: ReactNode, container: Element | DocumentFragment, key?: string | null): ReactPortal;
}
