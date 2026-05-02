export type FontScale = "compact" | "standard" | "comfortable" | "large";

export type UiPreset = {
  id: string;
  name: string;
  desc: string;
  mode: "light" | "dark";
  scale: FontScale;
  accentName: string;
  accentSwatch: string;
  primaryLight: string;
  primaryDark: string;
};

export const FONT_SCALES: Record<FontScale, { head: number; data: number; btn: number; tag: number; filter: number }> = {
  compact:     { head: 11, data: 12, btn: 12, tag: 10, filter: 11 },
  standard:    { head: 12, data: 13, btn: 13, tag: 11, filter: 12 },
  comfortable: { head: 13, data: 14, btn: 14, tag: 12, filter: 13 },
  large:       { head: 14, data: 15, btn: 15, tag: 13, filter: 14 },
};

export const SCALE_LABELS: Record<FontScale, string> = {
  compact:     "Compact",
  standard:    "Standard",
  comfortable: "Comfortable",
  large:       "Large",
};

export const UI_PRESETS: UiPreset[] = [
  {
    id:           "classic",
    name:         "Classic",
    desc:         "Clean light theme with standard sizing",
    mode:         "light",
    scale:        "standard",
    accentName:   "Blue",
    accentSwatch: "#3b82f6",
    primaryLight: "221 83% 53%",
    primaryDark:  "221 83% 60%",
  },
  {
    id:           "compact",
    name:         "Compact",
    desc:         "More data on screen, smaller text",
    mode:         "light",
    scale:        "compact",
    accentName:   "Blue",
    accentSwatch: "#3b82f6",
    primaryLight: "221 83% 53%",
    primaryDark:  "221 83% 60%",
  },
  {
    id:           "comfortable",
    name:         "Comfortable",
    desc:         "Relaxed spacing, easier on the eyes",
    mode:         "light",
    scale:        "comfortable",
    accentName:   "Indigo",
    accentSwatch: "#6366f1",
    primaryLight: "245 85% 57%",
    primaryDark:  "245 85% 65%",
  },
  {
    id:           "dark",
    name:         "Dark",
    desc:         "Professional dark theme, standard sizing",
    mode:         "dark",
    scale:        "standard",
    accentName:   "Blue",
    accentSwatch: "#60a5fa",
    primaryLight: "221 83% 53%",
    primaryDark:  "221 83% 60%",
  },
  {
    id:           "dark-large",
    name:         "Dark Large",
    desc:         "Dark theme with large text — great for long sessions",
    mode:         "dark",
    scale:        "large",
    accentName:   "Violet",
    accentSwatch: "#a78bfa",
    primaryLight: "263 70% 50%",
    primaryDark:  "263 70% 65%",
  },
  {
    id:           "emerald",
    name:         "Emerald",
    desc:         "Fresh green accent with comfortable sizing",
    mode:         "light",
    scale:        "comfortable",
    accentName:   "Emerald",
    accentSwatch: "#10b981",
    primaryLight: "162 73% 38%",
    primaryDark:  "162 73% 46%",
  },
  {
    id:           "spacious",
    name:         "Spacious",
    desc:         "Light theme, large fonts — maximum readability",
    mode:         "light",
    scale:        "large",
    accentName:   "Blue",
    accentSwatch: "#3b82f6",
    primaryLight: "221 83% 53%",
    primaryDark:  "221 83% 60%",
  },
  {
    id:           "warm",
    name:         "Warm",
    desc:         "Light theme, large fonts with a warm amber accent",
    mode:         "light",
    scale:        "large",
    accentName:   "Amber",
    accentSwatch: "#f59e0b",
    primaryLight: "38 92% 46%",
    primaryDark:  "38 92% 54%",
  },
  {
    id:           "night",
    name:         "Night Owl",
    desc:         "Soft dark theme with comfortable, easy-reading fonts",
    mode:         "dark",
    scale:        "comfortable",
    accentName:   "Teal",
    accentSwatch: "#14b8a6",
    primaryLight: "174 72% 38%",
    primaryDark:  "174 72% 46%",
  },
];

export function getPresetById(id: string): UiPreset | undefined {
  return UI_PRESETS.find(p => p.id === id);
}

export function getPresetFonts(preset: UiPreset) {
  return FONT_SCALES[preset.scale];
}
