import type { MetadataRoute } from "next";

import { baseUrl } from "../lib/base-url";
import { buildRobots } from "./[slug]/seo";

export default function robots(): MetadataRoute.Robots {
  return buildRobots(baseUrl());
}
