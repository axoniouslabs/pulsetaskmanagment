import { randomBytes } from "node:crypto";

/** short, sortable-enough ids: prefix + time + random */
export const newId = (prefix: string) => `${prefix}_${Date.now().toString(36)}${randomBytes(5).toString("hex")}`;
