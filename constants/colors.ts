/**
 * IPO Investment Tracker — Premium finance palette.
 *
 * Light: warm parchment (Boring AMC) — clean white cards, amber gold accent.
 * Dark:  warm charcoal (Omkara Capital) — deep warm black, bright amber.
 *
 * Accent: amber gold — intentional warmth, money without aggression.
 * Positive: deep forest green. Negative: deep crimson.
 */

const colors = {
  light: {
    // Base surfaces
    background: '#F7F5F0',
    surface: '#EFECE6',
    card: '#FFFFFF',
    cardAlt: '#F7F5F0',

    // Text
    foreground: '#1C1914',
    secondaryForeground: '#4A4640',
    mutedForeground: '#8B8279',

    // Borders
    border: '#E2DDD5',
    borderStrong: '#C9C4BB',

    // Primary — warm amber gold
    primary: '#A67C3A',
    primaryLight: '#C49346',
    primaryForeground: '#FFFFFF',

    // Accent (slightly brighter gold for interactive states)
    accent: '#B8924F',
    accentForeground: '#FFFFFF',

    // Legacy tint alias
    tint: '#A67C3A',

    // Destructive
    destructive: '#B91C1C',
    destructiveForeground: '#FFFFFF',
    destructiveBg: '#FEF3F2',

    // Muted fill
    muted: '#EFECE6',

    // Finance — profit
    positive: '#1A6B47',
    positiveBg: '#EDFAF4',
    positiveDim: '#D4F0E5',

    // Finance — loss
    negative: '#B91C1C',
    negativeBg: '#FEF3F2',
    negativeDim: '#FCDCDB',

    // Status badges
    statusApplied: '#6B6460',
    statusAppliedBg: '#F2F0ED',
    statusAllotted: '#1A6B47',
    statusAllottedBg: '#EDFAF4',
    statusNotAllotted: '#B91C1C',
    statusNotAllottedBg: '#FEF3F2',
    statusSold: '#1D4ED8',
    statusSoldBg: '#EFF6FF',

    // Shadow helper (used inline with boxShadow)
    shadowCard: '0 1px 4px rgba(28,25,20,0.07), 0 6px 20px rgba(28,25,20,0.05)',
    shadowModal: '0 8px 40px rgba(28,25,20,0.18)',

    radius: 16,
  },

  dark: {
    // Lifted warm charcoal — easy on the eye, clearly structured
    background: '#1C1917',
    surface: '#242119',
    card: '#2C2923',
    cardAlt: '#333027',

    foreground: '#F5EFE4',
    secondaryForeground: '#C5BDB0',
    mutedForeground: '#8C857C',

    border: '#3A362D',
    borderStrong: '#4A4640',

    primary: '#D4A248',
    primaryLight: '#E6B85C',
    primaryForeground: '#1C1917',

    accent: '#E2B45C',
    accentForeground: '#1C1917',

    tint: '#D4A248',

    destructive: '#F05252',
    destructiveForeground: '#FFFFFF',
    destructiveBg: '#2E1212',

    muted: '#2C2923',

    positive: '#34C778',
    positiveBg: '#112619',
    positiveDim: '#1A3224',

    negative: '#F05252',
    negativeBg: '#2E1212',
    negativeDim: '#3A1818',

    statusApplied: '#9B948C',
    statusAppliedBg: '#2C2923',
    statusAllotted: '#34C778',
    statusAllottedBg: '#112619',
    statusNotAllotted: '#F05252',
    statusNotAllottedBg: '#2E1212',
    statusSold: '#6BB8FF',
    statusSoldBg: '#0F1F3A',

    shadowCard: '0 1px 3px rgba(0,0,0,0.35), 0 6px 20px rgba(0,0,0,0.25)',
    shadowModal: '0 8px 40px rgba(0,0,0,0.55)',

    radius: 16,
  },

  radius: 16,
};

export default colors;
