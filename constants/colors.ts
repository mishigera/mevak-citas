const PRIMARY = "#B07085";
const PRIMARY_DARK = "#8C5468";
const PRIMARY_LIGHT = "#EDD5DC";
const SECONDARY = "#8E7FA0";
const ACCENT = "#D4956A";
const BACKGROUND = "#F7F0EB";
const SURFACE = "#FFFFFF";
const SURFACE_2 = "#F2E9E2";
const TEXT = "#2C1F1F";
const TEXT_SECONDARY = "#7A6464";
const TEXT_MUTED = "#B8A6A6";
const BORDER = "#E8D8D0";
const SUCCESS = "#5BAD8F";
const WARNING = "#D4875A";
const ERROR = "#C95C5C";
const SCHEDULED = "#7B9FDE";
const ARRIVED = "#5BAD8F";
const NO_SHOW = "#C95C5C";
const DONE = "#B8A6A6";
const CANCELLED = "#C95C5C";

export const Colors = {
  primary: PRIMARY,
  primaryDark: PRIMARY_DARK,
  primaryLight: PRIMARY_LIGHT,
  secondary: SECONDARY,
  accent: ACCENT,
  background: BACKGROUND,
  surface: SURFACE,
  surface2: SURFACE_2,
  text: TEXT,
  textSecondary: TEXT_SECONDARY,
  textMuted: TEXT_MUTED,
  border: BORDER,
  success: SUCCESS,
  warning: WARNING,
  error: ERROR,
  statusColors: {
    SCHEDULED: SCHEDULED,
    ARRIVED: ARRIVED,
    NO_SHOW: NO_SHOW,
    DONE: DONE,
    CANCELLED: CANCELLED,
  },
  light: {
    tint: PRIMARY,
    tabIconDefault: TEXT_MUTED,
    tabIconSelected: PRIMARY,
  },
};

export default Colors;
