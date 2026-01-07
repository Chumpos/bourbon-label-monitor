import "dotenv/config";
import { scrapeNewLabels, fetchLabelImage } from "./scraper.js";
import { sendWebhookNotification, sendTestNotification } from "./notifier.js";
import {
  loadSeenLabels,
  saveSeenLabels,
  filterNewLabels,
  addSeenTtbIds,
} from "./storage.js";

const WEBHOOK_URL = process.env.WEBHOOK_URL;
const DAYS_BACK = parseInt(process.env.DAYS_BACK || "1", 10);

async function main() {
  console.log("=".repeat(50));
  console.log("TTB COLA Monitor - Starting...");
  console.log(new Date().toISOString());
  console.log("=".repeat(50));

  // Check for webhook URL
  if (!WEBHOOK_URL) {
    console.error("Error: WEBHOOK_URL environment variable is not set");
    console.error("Please set it in your .env file");
    process.exit(1);
  }

  // Handle test mode
  if (process.argv.includes("--test")) {
    console.log("Running in test mode...");
    const success = await sendTestNotification(WEBHOOK_URL);
    process.exit(success ? 0 : 1);
  }

  try {
    // Load previously seen labels
    console.log("\nLoading seen labels...");
    const seenLabels = await loadSeenLabels();
    console.log(`Previously seen: ${seenLabels.ttbIds.length} labels`);
    if (seenLabels.lastRun) {
      console.log(`Last run: ${seenLabels.lastRun}`);
    }

    // Scrape new labels from TTB
    console.log(`\nScraping TTB COLA registry (last ${DAYS_BACK} days)...`);
    const allLabels = await scrapeNewLabels(DAYS_BACK);
    console.log(`Found ${allLabels.length} total labels`);

    if (allLabels.length === 0) {
      console.log("No labels found in date range");
      await saveSeenLabels(seenLabels); // Update last run timestamp
      return;
    }

    // Filter to only new labels
    const newLabels = filterNewLabels(allLabels, seenLabels);
    console.log(`New labels (not previously seen): ${newLabels.length}`);

    if (newLabels.length === 0) {
      console.log("No new labels to notify about");
      await saveSeenLabels(seenLabels);
      return;
    }

    // Fetch images for each new label
    console.log("\nFetching label images...");
    for (const label of newLabels) {
      try {
        const image = await fetchLabelImage(label.ttbId);
        if (image) {
          label.imageData = image.data;
          label.imageFilename = image.filename;
        }
        // Add delay between image fetches to respect rate limits
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (error) {
        console.error(`Failed to fetch image for ${label.ttbId}:`, error);
      }
    }

    const labelsWithImages = newLabels.filter((l) => l.imageData).length;
    console.log(`Fetched images for ${labelsWithImages}/${newLabels.length} labels`);

    // Send webhook notification
    console.log("\nSending webhook notification...");
    const notificationSuccess = await sendWebhookNotification(
      WEBHOOK_URL,
      newLabels
    );

    if (!notificationSuccess) {
      console.error("Failed to send notification, not marking labels as seen");
      process.exit(1);
    }

    // Mark labels as seen only after successful notification
    const updatedSeenLabels = addSeenTtbIds(
      seenLabels,
      newLabels.map((l) => l.ttbId)
    );
    await saveSeenLabels(updatedSeenLabels);

    console.log("\n" + "=".repeat(50));
    console.log(`Successfully processed ${newLabels.length} new labels`);
    console.log("=".repeat(50));
  } catch (error) {
    console.error("\nError during execution:", error);
    process.exit(1);
  }
}

main();
