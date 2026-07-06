import { Wallet, Globe, Clock } from "lucide-react";

export const THEME = {
  light: {
    isDark: false,
    bg: "#F3F4F6",
    surface: "#FFFFFF",
    surface2: "#F8F9FA",
    border: "#E5E7EB",
    ink: "#191C1F",
    inkSoft: "#686F78",
    inkFaint: "#A4AAB2",
    accent: "#3452E0",
    accentHover: "#2A41B8",
    accentSoft: "#E7EAFB",
    accentInk: "#FFFFFF",
    status: "#0E9C87",
    statusSoft: "#DFF3EF",
    bubbleUser: "#EAECEE",
    bubbleUserInk: "#191C1F",
    shellShadow: "0 1px 2px rgba(16,24,32,0.04), 0 16px 40px rgba(16,24,32,0.10)",
  },
  dark: {
    isDark: true,
    bg: "#121417",
    surface: "#1A1D21",
    surface2: "#1F2226",
    border: "#2B2F34",
    ink: "#ECEDEF",
    inkSoft: "#8D939C",
    inkFaint: "#565C64",
    accent: "#6E85FF",
    accentHover: "#8B9EFF",
    accentSoft: "#1D2340",
    accentInk: "#08120F",
    status: "#2DD4BF",
    statusSoft: "#132C29",
    bubbleUser: "#2A302F",
    bubbleUserInk: "#ECEFF1",
    shellShadow: "none",
  },
};

export type ThemeType = typeof THEME.light;

export const CONNECTORS = [
  { id: "automations", name: "Active Intents", icon: Clock },
  { id: "wallet", name: "Manage Money", icon: Wallet },
  { id: "x", name: "X", icon: Globe },
];

export const SUGGESTIONS = [
  "Cek allowance saya di blockchain",
  "Jadwalkan pembayaran bulanan",
  "Analisa portofolio aset",
  "Hubungkan ke Slack",
];

export const FONT_LINK_ID = "chatui-fonts";
