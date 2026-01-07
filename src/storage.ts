import { readFile, writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import type { SeenLabels } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");
const SEEN_LABELS_FILE = join(DATA_DIR, "seen-labels.json");

export async function loadSeenLabels(): Promise<SeenLabels> {
  try {
    if (!existsSync(SEEN_LABELS_FILE)) {
      return { lastRun: "", ttbIds: [] };
    }
    const data = await readFile(SEEN_LABELS_FILE, "utf-8");
    return JSON.parse(data) as SeenLabels;
  } catch (error) {
    console.error("Error loading seen labels:", error);
    return { lastRun: "", ttbIds: [] };
  }
}

export async function saveSeenLabels(seenLabels: SeenLabels): Promise<void> {
  try {
    if (!existsSync(DATA_DIR)) {
      await mkdir(DATA_DIR, { recursive: true });
    }
    seenLabels.lastRun = new Date().toISOString();
    await writeFile(SEEN_LABELS_FILE, JSON.stringify(seenLabels, null, 2));
  } catch (error) {
    console.error("Error saving seen labels:", error);
    throw error;
  }
}

export function filterNewLabels<T extends { ttbId: string }>(
  allLabels: T[],
  seenLabels: SeenLabels
): T[] {
  const seenSet = new Set(seenLabels.ttbIds);
  return allLabels.filter((label) => !seenSet.has(label.ttbId));
}

export function addSeenTtbIds(
  seenLabels: SeenLabels,
  ttbIds: string[]
): SeenLabels {
  const existingSet = new Set(seenLabels.ttbIds);
  for (const id of ttbIds) {
    existingSet.add(id);
  }
  return {
    ...seenLabels,
    ttbIds: Array.from(existingSet),
  };
}
