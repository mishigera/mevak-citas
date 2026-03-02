const PRIMARY = "#C96B7A";
const PRIMARY_DARK = "#A84F5D";
const PRIMARY_LIGHT = "#F2C4CB";
const SECONDARY = "#8B6F8E";
const ACCENT = "#E8A87C";
const BACKGROUND = "#FAF4F0";
const SURFACE = "#FFFFFF";
const SURFACE_2 = "#F5EEE9";
const TEXT = "#2D1F1F";
const TEXT_SECONDARY = "#7A6060";
const TEXT_MUTED = "#B5A0A0";
const BORDER = "#EAD8D8";
const SUCCESS = "#4CAF8A";
const WARNING = "#F0A050";
const ERROR = "#D95F5F";
const SCHEDULED = "#7B9FDE";
const ARRIVED = "#4CAF8A";
const NO_SHOW = "#D95F5F";
const DONE = "#B5A0A0";
const CANCELLED = "#D95F5F";

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
