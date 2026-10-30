# Survey chat service

`worker.js` is a small Cloudflare Worker that powers the "Ask Claude" tab on the survey page. The page sends a visitor's question here; the Worker looks up the answer in the published survey data with Claude and sends back the reply.

**The Anthropic API key never goes in this repository.** It is stored only as a secret on the Cloudflare Worker.

What the Worker does:

- Loads the same files the page shows (`data/*.json` on GitHub Pages), refreshed every 5 minutes.
- Gives Claude two lookup tools: count the answers to any question (optionally filtered, or split by another question), and read written comments (by question, theme or group). Comments are only shown for filtered groups of 5 or more.
- Only answers requests from `https://berkoar.github.io`, limits each visitor to 30 questions an hour, caps question length and conversation length, and keeps Claude to questions about the survey.

## Setup (once)

1. Sign up for a free account at dash.cloudflare.com.
2. Open **Workers & Pages**, choose **Create**, then create a Worker from the "Hello World" starter. Name it `dn-survey-chat` and deploy it.
3. Choose **Edit code**, replace everything with the contents of `worker.js` from this folder, and deploy.
4. In the Worker's **Settings**, under **Variables and Secrets**, add a variable of type **Secret** named `ANTHROPIC_API_KEY` with your Anthropic API key as the value, and deploy.
5. Copy the Worker's address (it looks like `https://dn-survey-chat.<your-account>.workers.dev`). The page needs it to turn on the Ask Claude tab.

It's a good idea to use a dedicated API key for this and to set a monthly spend limit in the Anthropic Console.

## Updating

Paste the new `worker.js` into the Worker's code editor and deploy. The secret stays in place.
