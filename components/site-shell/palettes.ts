export type PaletteId = "nocturne" | "petal" | "lagoon" | "ember";

export type ShellPalette = {
  id: PaletteId;
  label: string;
  ink: string;
  panel: string;
  paper: string;
  muted: string;
  dim: string;
  line: string;
  acid: string;
  acidInk: string;
};

export const shellPalettes: readonly ShellPalette[] = [
  {
    id: "nocturne",
    label: "Nocturne",
    ink: "#F2F5EC",
    panel: "#171B20",
    paper: "#0B0D10",
    muted: "#B8C0B1",
    dim: "#788272",
    line: "#465044",
    acid: "#C4FF30",
    acidInk: "#0B0D10",
  },
  {
    id: "petal",
    label: "Petal",
    ink: "#241A2A",
    panel: "#FFF7F2",
    paper: "#F2D9CE",
    muted: "#5D4758",
    dim: "#715768",
    line: "#9A7789",
    acid: "#8C173D",
    acidInk: "#FFFFFF",
  },
  {
    id: "lagoon",
    label: "Lagoon",
    ink: "#E7FDFF",
    panel: "#073C45",
    paper: "#062A31",
    muted: "#B3E2E8",
    dim: "#7EB5BE",
    line: "#4A8994",
    acid: "#00D1E5",
    acidInk: "#00252B",
  },
  {
    id: "ember",
    label: "Ember",
    ink: "#FFF7EC",
    panel: "#362015",
    paper: "#20120C",
    muted: "#E9BFA2",
    dim: "#C99778",
    line: "#855436",
    acid: "#A8440B",
    acidInk: "#FFFFFF",
  },
] as const;

export const paletteById = Object.fromEntries(
  shellPalettes.map((palette) => [palette.id, palette]),
) as Record<PaletteId, ShellPalette>;
