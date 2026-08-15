import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "AIDENTITY",
    short_name: "AIDENTITY",
    description: "Siti e press kit per artisti.",
    start_url: "/",
    display: "standalone",
    background_color: "#0b0d10",
    theme_color: "#0b0d10",
    lang: "it-IT",
  };
}
