# TTB COLA Monitor

Monitor the TTB (Alcohol and Tobacco Tax and Trade Bureau) COLA Registry for new bourbon and whiskey label approvals. Get notified via Discord or Slack webhook when new labels are approved.

## Features

- Scrapes the public TTB COLA registry daily
- Uses Browserless.io to bypass bot protection
- Monitors all whiskey categories (class codes 100-199)
- Sends rich embed notifications to Discord/Slack
- Tracks seen labels to avoid duplicate notifications
- Includes direct links to TTB detail pages

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Get a Browserless.io API Token

The TTB website uses Imperva bot protection. This script uses [Browserless.io](https://www.browserless.io/) to bypass it.

1. Sign up at [browserless.io](https://www.browserless.io/) (free tier: 1000 units/month)
2. Get your API token from the dashboard

### 3. Configure Environment

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` and add your credentials:

```env
# Browserless.io API Token (required)
BROWSERLESS_TOKEN=your_browserless_token_here

# Discord or Slack Webhook URL
WEBHOOK_URL=https://discord.com/api/webhooks/YOUR_WEBHOOK_ID/YOUR_WEBHOOK_TOKEN

# Days to look back (default: 1)
DAYS_BACK=1
```

**For Discord webhook:**
1. Go to Server Settings > Integrations > Webhooks
2. Create a new webhook
3. Copy the webhook URL

**For Slack webhook:**
1. Create an Incoming Webhook app
2. Copy the webhook URL

### 4. Test the Setup

```bash
npm start
```

## Usage

### Manual Run

```bash
npm start
```

### Run with Custom Days Back

```bash
DAYS_BACK=7 npm start
```

### Scheduled Run (Cron)

Add to crontab for daily execution:

```bash
# Edit crontab
crontab -e

# Add this line to run at 8 AM daily
0 8 * * * cd /path/to/ttb-cola-monitor && /usr/local/bin/npx tsx src/index.ts >> /var/log/ttb-cola-monitor.log 2>&1
```

### macOS LaunchAgent (Alternative to Cron)

Create `~/Library/LaunchAgents/com.ttb-cola-monitor.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.ttb-cola-monitor</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/local/bin/npx</string>
        <string>tsx</string>
        <string>/path/to/ttb-cola-monitor/src/index.ts</string>
    </array>
    <key>WorkingDirectory</key>
    <string>/path/to/ttb-cola-monitor</string>
    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>8</integer>
        <key>Minute</key>
        <integer>0</integer>
    </dict>
    <key>StandardOutPath</key>
    <string>/tmp/ttb-cola-monitor.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/ttb-cola-monitor.error.log</string>
</dict>
</plist>
```

Load the agent:

```bash
launchctl load ~/Library/LaunchAgents/com.ttb-cola-monitor.plist
```

## Monitored Categories

The script monitors TTB class codes 100-199, which includes:

- 101 - Straight Bourbon Whisky
- 102 - Bourbon Whisky (under 4 years)
- 107 - Straight Rye Whisky
- 108 - Rye Whisky
- 109 - Straight Wheat Whisky
- 110 - Wheat Whisky
- 111 - Straight Malt Whisky
- 112 - Malt Whisky
- 113 - Rye Malt Whisky
- 114 - Straight Rye Malt Whisky
- 125 - Corn Whisky
- 141 - Bourbon Whisky (blended)
- And more...

## Data Storage

Seen labels are stored in `data/seen-labels.json` to prevent duplicate notifications. This file is automatically created on first run.

## How It Works

1. The script uses Browserless.io's Unblock API to obtain session cookies that bypass TTB's Imperva bot protection
2. It then makes a direct HTTP POST request to the TTB search endpoint with those cookies
3. The HTML response is parsed to extract label information
4. New labels are compared against previously seen labels
5. Notifications are sent to Discord/Slack for any new labels

## Browserless.io Usage

The free tier includes 1000 units/month. Each scrape uses approximately:
- 1 unit per Unblock API call

Running daily with default settings uses ~30 units/month, well within the free tier.

## Troubleshooting

### No labels found
- Check that you have a valid Browserless.io token
- Try increasing `DAYS_BACK` to search a wider date range
- The TTB website may be temporarily unavailable

### Webhook not working
- Verify the webhook URL is correct
- Check Discord/Slack channel permissions

### SSL Certificate Errors
- The script automatically handles TTB's SSL certificate chain issues

## License

MIT
