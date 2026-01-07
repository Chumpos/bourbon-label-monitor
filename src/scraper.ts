import type { ColaLabel, ColaLabelDetail } from "./types.js";

// TTB has SSL certificate chain issues - disable verification for this module
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const BASE_URL = "https://www.ttbonline.gov/colasonline";
const SEARCH_URL = `${BASE_URL}/publicSearchColasBasic.do`;
const SEARCH_RESULTS_URL = `${BASE_URL}/publicSearchColasBasicProcess.do?action=search`;
const DETAIL_URL = `${BASE_URL}/viewColaDetails.do?action=publicDisplaySearchBasic&ttbid=`;
const PRINTABLE_URL = `${BASE_URL}/viewColaDetails.do?action=publicFormDisplay&ttbid=`;
const ATTACHMENT_URL = `${BASE_URL}/publicViewAttachment.do`;

// Whiskey class/type codes (100-199 range)
const WHISKEY_CLASS_START = "100";
const WHISKEY_CLASS_END = "199";

function formatDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const year = date.getFullYear();
  return `${month}/${day}/${year}`;
}

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface UnblockCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  secure?: boolean;
  httpOnly?: boolean;
  sameSite?: string;
  expires?: number;
}

interface UnblockResponse {
  cookies?: UnblockCookie[];
  content?: string;
  screenshot?: string;
}

interface SessionData {
  cookies: string;
  formFields: Record<string, string>;
}

async function getSessionAndFormFields(): Promise<SessionData> {
  const token = process.env.BROWSERLESS_TOKEN;
  if (!token) {
    throw new Error("BROWSERLESS_TOKEN environment variable is not set");
  }

  const unblockUrl = `https://production-sfo.browserless.io/unblock?token=${token}`;
  const response = await fetch(unblockUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      url: SEARCH_URL,
      browserWSEndpoint: false,
      cookies: true,
      content: true, // Get the form HTML too
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Unblock API failed: ${response.status} - ${errorText}`);
  }

  const data: UnblockResponse = await response.json();

  // Convert cookies to cookie header string
  const cookieStr = (data.cookies || [])
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");

  // Extract hidden form fields from the content
  const formFields: Record<string, string> = {};
  if (data.content) {
    // Look for hidden inputs
    const hiddenPattern = /<input[^>]+type=["']hidden["'][^>]*>/gi;
    let match;
    while ((match = hiddenPattern.exec(data.content)) !== null) {
      const inputHtml = match[0];
      const nameMatch = inputHtml.match(/name=["']([^"']+)["']/i);
      const valueMatch = inputHtml.match(/value=["']([^"']*)["']/i);
      if (nameMatch) {
        formFields[nameMatch[1]] = valueMatch ? valueMatch[1] : "";
      }
    }
  }

  return { cookies: cookieStr, formFields };
}

async function searchWithCookies(
  cookies: string,
  formFields: Record<string, string>,
  startDate: Date,
  endDate: Date
): Promise<string> {
  // Form data for the search - using the actual field names from the form
  const formData = new URLSearchParams();

  // Search parameters with searchCriteria. prefix
  formData.set("searchCriteria.dateCompletedFrom", formatDate(startDate));
  formData.set("searchCriteria.dateCompletedTo", formatDate(endDate));
  formData.set("searchCriteria.classTypeFrom", WHISKEY_CLASS_START);
  formData.set("searchCriteria.classTypeTo", WHISKEY_CLASS_END);
  formData.set("searchCriteria.productOrFancifulName", "");
  formData.set("searchCriteria.originCode", "");

  const response = await fetch(SEARCH_RESULTS_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: cookies,
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Referer: SEARCH_URL,
      Origin: "https://www.ttbonline.gov",
    },
    body: formData.toString(),
  });

  if (!response.ok) {
    throw new Error(`Search request failed: ${response.status}`);
  }

  return await response.text();
}

function parseHtmlResults(html: string): ColaLabel[] {
  const labels: ColaLabel[] = [];

  // Check for no results
  if (html.includes("No records found")) {
    console.log("No records found in search results");
    return [];
  }

  // Simple regex-based parsing of the results table
  // Look for table rows with TTB IDs (format: XXXXXXXXXXXXXX - 14 chars)
  const ttbIdPattern = /href="[^"]*ttbid=(\d{14})"[^>]*>(\d{14})<\/a>/gi;
  let match;

  while ((match = ttbIdPattern.exec(html)) !== null) {
    const ttbId = match[2];

    // Find the row containing this TTB ID and extract other data
    const rowStart = html.lastIndexOf("<tr", match.index);
    const rowEnd = html.indexOf("</tr>", match.index);

    if (rowStart !== -1 && rowEnd !== -1) {
      const rowHtml = html.substring(rowStart, rowEnd + 5);

      // Extract table cell contents
      const cellPattern = /<td[^>]*>([\s\S]*?)<\/td>/gi;
      const cells: string[] = [];
      let cellMatch;

      while ((cellMatch = cellPattern.exec(rowHtml)) !== null) {
        // Clean up cell content - remove tags and trim
        const content = cellMatch[1]
          .replace(/<[^>]*>/g, "")
          .replace(/&nbsp;/g, " ")
          .trim();
        cells.push(content);
      }

      if (cells.length >= 10) {
        labels.push({
          ttbId,
          permitNo: cells[1] || "",
          serialNumber: cells[2] || "",
          completedDate: cells[3] || "",
          fancifulName: cells[4] || "",
          brandName: cells[5] || "",
          origin: cells[6] || "",
          originDesc: cells[7] || "",
          classType: cells[8] || "",
          classTypeDesc: cells[9] || "",
        });
      }
    }
  }

  return labels;
}

interface LabelImage {
  data: Buffer;
  filename: string;
}

export async function fetchLabelImage(ttbId: string): Promise<LabelImage | null> {
  try {
    const token = process.env.BROWSERLESS_TOKEN;
    if (!token) {
      console.log("No BROWSERLESS_TOKEN, skipping image fetch");
      return null;
    }

    // Get cookies from the printable version page
    const printableUrl = `${PRINTABLE_URL}${ttbId}`;
    const unblockUrl = `https://production-sfo.browserless.io/unblock?token=${token}`;

    const unblockResponse = await fetch(unblockUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: printableUrl,
        browserWSEndpoint: false,
        cookies: true,
        content: true,
      }),
    });

    if (!unblockResponse.ok) {
      console.log(`Failed to get printable page for ${ttbId}: ${unblockResponse.status}`);
      return null;
    }

    const data: UnblockResponse = await unblockResponse.json();
    const cookieStr = (data.cookies || []).map((c) => `${c.name}=${c.value}`).join("; ");

    if (!data.content) {
      console.log(`No content returned from printable page for ${ttbId}`);
      return null;
    }

    // Extract image URLs from the printable page HTML
    // Pattern: <img src="/colasonline/publicViewAttachment.do?filename=XXX&amp;filetype=l">
    const imgPattern = /src="\/colasonline\/publicViewAttachment\.do\?filename=([^&]+)&amp;filetype=l"/gi;
    const matches: string[] = [];
    let match;

    while ((match = imgPattern.exec(data.content)) !== null) {
      matches.push(match[1]);
    }

    if (matches.length === 0) {
      console.log(`No images found for ${ttbId}`);
      return null;
    }

    // Use the first image (front label)
    const filename = matches[0];
    const imageUrl = `${ATTACHMENT_URL}?filename=${encodeURIComponent(filename)}&filetype=l`;

    // Fetch the image with session cookies
    const imageResponse = await fetch(imageUrl, {
      headers: {
        Cookie: cookieStr,
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Referer: printableUrl,
      },
    });

    if (!imageResponse.ok) {
      console.log(`Failed to fetch image for ${ttbId}: ${imageResponse.status}`);
      return null;
    }

    const contentType = imageResponse.headers.get("content-type");
    if (!contentType?.startsWith("image/")) {
      console.log(`Response is not an image for ${ttbId}: ${contentType}`);
      return null;
    }

    const arrayBuffer = await imageResponse.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    console.log(`Fetched image for ${ttbId}: ${filename} (${buffer.length} bytes)`);

    return {
      data: buffer,
      filename: filename,
    };
  } catch (error) {
    console.error(`Error fetching image for ${ttbId}:`, error);
    return null;
  }
}

export async function scrapeNewLabels(
  daysBack: number = 1
): Promise<ColaLabel[]> {
  try {
    // Get cookies and form fields from the Unblock API
    const { cookies, formFields } = await getSessionAndFormFields();

    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);

    console.log(
      `Searching for labels from ${formatDate(startDate)} to ${formatDate(endDate)}`
    );

    // Submit search with cookies and form fields
    const html = await searchWithCookies(cookies, formFields, startDate, endDate);

    // Parse the HTML results
    const labels = parseHtmlResults(html);
    console.log(`Found ${labels.length} labels`);

    return labels;
  } catch (error) {
    console.error("Error scraping labels:", error);
    throw error;
  }
}

export async function fetchLabelDetails(
  ttbId: string
): Promise<ColaLabelDetail | null> {
  try {
    const token = process.env.BROWSERLESS_TOKEN;
    if (!token) {
      throw new Error("BROWSERLESS_TOKEN environment variable is not set");
    }

    // Get cookies for the detail page
    const unblockUrl = `https://production-sfo.browserless.io/unblock?token=${token}`;
    const unblockResponse = await fetch(unblockUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: `${DETAIL_URL}${ttbId}`,
        browserWSEndpoint: false,
        cookies: true,
        content: true,
      }),
    });

    if (!unblockResponse.ok) {
      throw new Error(`Unblock failed: ${unblockResponse.status}`);
    }

    const data: UnblockResponse = await unblockResponse.json();

    if (!data.content) {
      throw new Error("No content returned from detail page");
    }

    // Parse detail page content
    const html = data.content;

    const getText = (label: string): string => {
      const pattern = new RegExp(`${label}[\\s:]*([^<]+)`, "i");
      const match = pattern.exec(html);
      return match ? match[1].trim() : "";
    };

    const detail: ColaLabelDetail = {
      ttbId,
      permitNo: getText("Permit Number"),
      serialNumber: getText("Serial #"),
      completedDate: getText("Completed Date"),
      fancifulName: getText("Fanciful Name"),
      brandName: getText("Brand Name"),
      origin: getText("Origin"),
      originDesc: getText("Origin Code"),
      classType: getText("Class/Type"),
      classTypeDesc: getText("Class/Type Code"),
      status: getText("Status"),
      vendorCode: getText("Vendor Code"),
      typeOfApplication: getText("Type of Application"),
      approvalDate: getText("Approval Date"),
    };

    return detail;
  } catch (error) {
    console.error(`Error fetching details for ${ttbId}:`, error);
    return null;
  }
}

export function getDetailUrl(ttbId: string): string {
  return `${DETAIL_URL}${ttbId}`;
}
