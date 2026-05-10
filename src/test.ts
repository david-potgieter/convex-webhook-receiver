import { convexTest } from "convex-test";
import schema from "../convex/schema";

export function initConvexTest() {
  const modules = import.meta.glob("../convex/**/*.ts");
  return convexTest(schema, modules);
}
