import type { ColaLabel, WebhookPayload, WebhookEmbed } from "./types.js";
import { getDetailUrl } from "./scraper.js";

const BOURBON_COLOR = 0xd4a574; // Amber/bourbon color
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function sendWebhookNotification(
  webhookUrl: string,
  labels: ColaLabel[]
): Promise<boolean> {
  if (labels.length === 0) {
    console.log("No labels to notify about");
    return true;
  }

  // Separate labels with and without images
  const labelsWithImages = labels.filter((l) => l.imageData);
  const labelsWithoutImages = labels.filter((l) => !l.imageData);

  // Send header message first
  if (labels.length > 0) {
    const headerPayload: WebhookPayload = {
      username: "TTB COLA Monitor",
      content: `**${labels.length} New Whiskey Label${labels.length > 1 ? "s" : ""} Approved!**`,
    };
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(headerPayload),
    });
    await delay(500);
  }

  // Send labels with images one at a time (to attach image properly)
  for (const label of labelsWithImages) {
    const success = await sendSingleWithImage(webhookUrl, label);
    if (!success) {
      console.error(`Failed to send notification for ${label.ttbId}`);
    }
    await delay(1000); // Rate limit
  }

  // Batch labels without images
  if (labelsWithoutImages.length > 0) {
    const batchSize = 10;
    for (let i = 0; i < labelsWithoutImages.length; i += batchSize) {
      const batch = labelsWithoutImages.slice(i, i + batchSize);
      const success = await sendBatch(webhookUrl, batch, false);
      if (!success) {
        return false;
      }
      if (i + batchSize < labelsWithoutImages.length) {
        await delay(1000);
      }
    }
  }

  return true;
}

async function sendSingleWithImage(
  webhookUrl: string,
  label: ColaLabel
): Promise<boolean> {
  const embed: WebhookEmbed = {
    title: label.fancifulName || label.brandName || "New Label",
    url: getDetailUrl(label.ttbId),
    color: BOURBON_COLOR,
    fields: [
      { name: "Brand", value: label.brandName || "N/A", inline: true },
      { name: "Type", value: label.classTypeDesc || label.classType || "N/A", inline: true },
      { name: "Origin", value: label.originDesc || label.origin || "N/A", inline: true },
      { name: "Approved", value: label.completedDate || "N/A", inline: true },
      { name: "TTB ID", value: label.ttbId, inline: true },
    ],
    timestamp: new Date().toISOString(),
    footer: { text: "TTB COLA Registry" },
  };

  // Add image reference if we have image data
  if (label.imageData && label.imageFilename) {
    embed.image = { url: `attachment://${label.imageFilename}` };
  }

  const payload: WebhookPayload = {
    username: "TTB COLA Monitor",
    embeds: [embed],
  };

  // Create FormData with the image
  const formData = new FormData();
  formData.append("payload_json", JSON.stringify(payload));

  if (label.imageData && label.imageFilename) {
    const uint8Array = new Uint8Array(label.imageData);
    const blob = new Blob([uint8Array]);
    formData.append("files[0]", blob, label.imageFilename);
  }

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        body: formData,
      });

      if (response.ok) {
        console.log(`Sent notification with image for ${label.ttbId}`);
        return true;
      }

      if (response.status === 429) {
        const retryAfter = response.headers.get("Retry-After");
        const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : RETRY_DELAY_MS;
        console.log(`Rate limited, waiting ${waitTime}ms before retry...`);
        await delay(waitTime);
        continue;
      }

      console.error(`Webhook failed: ${response.status} - ${await response.text()}`);
    } catch (error) {
      console.error(`Attempt ${attempt} failed:`, error);
      if (attempt < MAX_RETRIES) {
        await delay(RETRY_DELAY_MS * attempt);
      }
    }
  }

  return false;
}

async function sendBatch(
  webhookUrl: string,
  labels: ColaLabel[],
  includeHeader: boolean
): Promise<boolean> {
  const embeds: WebhookEmbed[] = labels.map((label) => ({
    title: label.fancifulName || label.brandName || "New Label",
    url: getDetailUrl(label.ttbId),
    color: BOURBON_COLOR,
    fields: [
      {
        name: "Brand",
        value: label.brandName || "N/A",
        inline: true,
      },
      {
        name: "Type",
        value: label.classTypeDesc || label.classType || "N/A",
        inline: true,
      },
      {
        name: "Origin",
        value: label.originDesc || label.origin || "N/A",
        inline: true,
      },
      {
        name: "Approved",
        value: label.completedDate || "N/A",
        inline: true,
      },
      {
        name: "TTB ID",
        value: label.ttbId,
        inline: true,
      },
    ],
    timestamp: new Date().toISOString(),
    footer: {
      text: "TTB COLA Registry",
    },
  }));

  const payload: WebhookPayload = {
    username: "TTB COLA Monitor",
    embeds,
  };

  if (includeHeader) {
    payload.content = `**${labels.length > 1 ? `${labels.length} New` : "New"} Whiskey Label${labels.length > 1 ? "s" : ""} Approved!**`;
  }

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(webhookUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        console.log(`Successfully sent notification for ${labels.length} labels`);
        return true;
      }

      // Handle rate limiting
      if (response.status === 429) {
        const retryAfter = response.headers.get("Retry-After");
        const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : RETRY_DELAY_MS;
        console.log(`Rate limited, waiting ${waitTime}ms before retry...`);
        await delay(waitTime);
        continue;
      }

      console.error(
        `Webhook failed with status ${response.status}: ${await response.text()}`
      );
    } catch (error) {
      console.error(`Attempt ${attempt} failed:`, error);
      if (attempt < MAX_RETRIES) {
        await delay(RETRY_DELAY_MS * attempt);
      }
    }
  }

  return false;
}

export async function sendTestNotification(webhookUrl: string): Promise<boolean> {
  const testLabel: ColaLabel = {
    ttbId: "TEST123",
    permitNo: "DSP-KY-1",
    serialNumber: "000001",
    completedDate: new Date().toLocaleDateString(),
    fancifulName: "Test Bourbon",
    brandName: "Test Distillery",
    origin: "21",
    originDesc: "KENTUCKY",
    classType: "101",
    classTypeDesc: "STRAIGHT BOURBON WHISKY",
  };

  const payload: WebhookPayload = {
    username: "TTB COLA Monitor",
    content: "**Test Notification** - TTB COLA Monitor is configured correctly!",
    embeds: [
      {
        title: testLabel.fancifulName,
        description: "This is a test notification to verify your webhook is working.",
        color: BOURBON_COLOR,
        fields: [
          { name: "Brand", value: testLabel.brandName, inline: true },
          { name: "Type", value: testLabel.classTypeDesc, inline: true },
          { name: "Origin", value: testLabel.originDesc, inline: true },
        ],
        footer: { text: "TTB COLA Registry - Test" },
      },
    ],
  };

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      console.log("Test notification sent successfully!");
      return true;
    }

    console.error(`Test notification failed: ${response.status}`);
    return false;
  } catch (error) {
    console.error("Error sending test notification:", error);
    return false;
  }
}
