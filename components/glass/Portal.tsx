/**
 * En nativo no hay `document`: los hijos se pintan donde están.
 *
 * La versión web (`Portal.web.tsx`) los saca a `document.body`. Metro elige una u otra
 * por la extensión; jest, que corre como iOS, carga esta.
 */
import React from "react";

export function Portal({ children }: { children?: React.ReactNode }) {
  return <>{children}</>;
}
