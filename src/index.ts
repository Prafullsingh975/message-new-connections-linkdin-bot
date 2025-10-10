import puppeteer, { Browser, Page } from "puppeteer";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import {
  closeMessageModal,
  filterFailedConnectionData,
  loadMessagedConnections,
  saveMessagedConnection,
  sleep,
} from "./utils/helper";

dotenv.config();

const referralMessage = `
Hi {name},

I hope you’re doing well. I’m Prafulla Kumar, currently working as a Full-Stack Developer at Zerror Studios and pursuing my B.Tech in Computer Science (2021–2025). Over the past 1.5+ years, I’ve built scalable SaaS applications, implemented microservices architecture, optimized performance using Redis and MongoDB transactions, and delivered production-ready features in MERN and React Native stacks.

I’m very interested in Software Development Engineer role and believe my experience in building scalable, real-time systems with Node.js, React, and cloud services (AWS EC2, S3, CloudFront, SES) aligns well with your requirements.

Would you be open to referring me for the SDE position? I’d be happy to share my resume or any additional details you may need.

Thank you for your time and support!

Best regards,  
Prafulla Kumar  
LinkedIn: https://www.linkedin.com/in/prafulla975  
GitHub: https://github.com/Prafullsingh975
`;

const RESUME_FILE_PATH = path.resolve(
  __dirname,
  "..",
  process.env.RESUME_FILE_NAME as string
);

// File to track messaged connections
const TRACKER_FILE = path.resolve(
  __dirname,
  "..",
  process.env.MESSAGE_RECORD_FILE_NAME as string
);

const FAIL_TRACKER_FILE = path.resolve(
  __dirname,
  "..",
  process.env.FAIL_RECORD_FILE_NAME as string
);

// --- CORE BOT LOGIC ---
// before saving the cookie and browser data
// async function login(
//   page: Page,
//   email: string,
//   password: string
// ): Promise<boolean> {
//   console.log("Attempting to log in...");
//   try {
//     await page.goto("https://www.linkedin.com/login", {
//       waitUntil: "domcontentloaded",
//     });
//     await page.waitForSelector("#username", { timeout: 10000 });
//     await page.type("#username", email);
//     await page.type("#password", password);
//     await page.click('button[type="submit"]');
//     await page.waitForNavigation({
//       waitUntil: "domcontentloaded",
//       timeout: 20000,
//     });
//     console.log("Login successful!");
//     return true;
//   } catch (error) {
//     console.error(
//       "Login failed. You may need to solve a CAPTCHA manually.",
//       error
//     );
//     return false;
//   }
// }

async function login(
  page: Page,
  email: string,
  password: string
): Promise<boolean> {
  console.log("Checking login status...");
  try {
    // Go to the feed. If not logged in, LinkedIn will redirect to the login page.
    await page.goto("https://www.linkedin.com/feed", {
      waitUntil: "domcontentloaded",
    });

    // Look for a selector that only exists when logged in (e.g., the search bar).
    // If it's found, we're already logged in.
    const navbar = await page.waitForSelector("#global-nav", {
      timeout: 10000,
    });
    console.log("Already logged in.");
    return true;
  } catch (e) {
    // If the selector isn't found, we're likely on the login page.
    console.log("Not logged in. Proceeding to log in manually...");
    try {
      // Now we can safely perform the login steps.
      await page.goto("https://www.linkedin.com/login", {
        waitUntil: "domcontentloaded",
      });
      await page.waitForSelector("#username", { timeout: 10000 });
      await page.type("#username", email);
      await page.type("#password", password);
      await page.click('button[type="submit"]');
      await page.waitForNavigation({
        waitUntil: "domcontentloaded",
        timeout: 20000,
      });
      console.log("Login successful!");
      return true;
    } catch (error) {
      console.error(
        "Login failed. You may need to solve a CAPTCHA manually.",
        error
      );
      return false;
    }
  }
}

interface Connection {
  profileUrl: string;
  firstName: string;
  fullName: string;
}

async function getNewConnections(page: Page): Promise<Connection[]> {
  console.log("Navigating to 'My Network' to find new connections...");
  try {
    await page.goto(
      "https://www.linkedin.com/mynetwork/invite-connect/connections/",
      { waitUntil: "domcontentloaded" }
    );

    await page.waitForSelector(
      '[componentKey="ConnectionsPage_ConnectionsList"]',
      { timeout: 20000 }
    );
    const parentElement: any = await page.$(
      '[componentKey="ConnectionsPage_ConnectionsList"]'
    );

    // Now select the child (nested) element with the same componentKey
    const childElement: any = await parentElement.$(
      '[componentKey="ConnectionsPage_ConnectionsList"]'
    );

    // Select all elements with id=workspace
    const workspaces = await page.$$("#workspace");
    if (workspaces.length === 0) {
      throw new Error("No #workspace elements found!");
    }

    // Scrollable element
    const innerWorkspace = workspaces[workspaces.length - 1];
    console.log(`Found ${workspaces.length} workspaces. Using the inner one.`);

    await sleep(3000);

    // Scroll down to load more connections
    console.log("Scrolling to load connections...");
    for (let i = 0; i < 3; i++) {
      await innerWorkspace.evaluate((el) => {
        el.scrollTo({
          top: el.scrollHeight,
          behavior: "smooth",
        });
      });
      await sleep(2000);
    }

    const connections = await childElement.$$eval(
      '[data-view-name="connections-profile"]', // select all profile anchors inside childElement
      (anchors: any) =>
        anchors
          .map((anchor: any) => {
            const profileUrl = anchor.getAttribute("href") || "";

            // Find the <a> with the name inside the parent <p>
            const nameAnchor = anchor.querySelector("p a");
            const fullName = nameAnchor?.textContent?.trim() || "";
            const firstName = fullName.split(" ")[0] || "";

            return { profileUrl, fullName, firstName };
          })
          .filter((conn: any) => conn.profileUrl && conn.firstName) // remove empty ones
    );

    console.log(`Found ${connections.length} connections on the page.`);
    return connections;
  } catch (error) {
    console.error(
      "Could not get new connections. The page structure might have changed.",
      error
    );
    return [];
  }
}

async function sendMessageWithResume(
  page: Page,
  connection: Connection
): Promise<boolean> {
  console.log(
    `\nProcessing profile: ${connection.firstName} (${connection.profileUrl})`
  );
  try {
    await page.goto(connection.profileUrl, { waitUntil: "domcontentloaded" });

    // Find the message button. It's often in a "pv-top-card-v2-ctas" div
    const messageButtonSelector = `a[href*="/messaging/thread/"]`;
    // const messageButtonSelector = `button[aria-label="Message ${connection.firstName}"]`;
    await page.waitForSelector(messageButtonSelector, { timeout: 15000 });

    await sleep(2000);

    await page.click(messageButtonSelector);
    console.log("Clicked message button.");

    await sleep(3000);

    // --- ADDED CODE: Check for and close the up sell modal ---
    try {
      const closeModalButtonSelector = 'button[aria-label="Dismiss"]';
      await page.waitForSelector(closeModalButtonSelector, { timeout: 3000 }); // Wait only 3 seconds
      await page.click(closeModalButtonSelector);
      console.log("Closed a pop-up modal.");

      await sleep(1000); // Wait a second for the modal to close

      await page.waitForSelector(messageButtonSelector, { timeout: 15000 });

      await sleep(2000);

      await page.click(messageButtonSelector);
      console.log("Clicked message button again");

      await sleep(3000);
    } catch (error) {
      console.log("No pop-up modal appeared, continuing...");
    }
    // --- END OF ADDED CODE ---

    // Wait for the message composer to appear and type the message
    const messageBoxSelector = "div.msg-form__contenteditable";
    await page.waitForSelector(messageBoxSelector, { timeout: 15000 });

    // --- ADDED CODE: Clear the text box before typing ---
    await page.click(messageBoxSelector, { clickCount: 3 }); // Triple click to select all text
    await page.keyboard.press("Backspace"); // Press backspace to delete it
    await sleep(500); // Small pause to ensure the field is clear
    // --- END OF ADDED CODE ---

    const formattedMessage = referralMessage.replace(
      "{name}",
      connection.firstName
    );
    await page.type(messageBoxSelector, formattedMessage, { delay: 50 });

    // Attach the resume
    const fileInputSelector = 'input[type="file"]';
    await page.waitForSelector(fileInputSelector);
    const fileInput = await page.$(fileInputSelector);
    if (fileInput) {
      await fileInput.uploadFile(RESUME_FILE_PATH);
      console.log("Attaching resume...");
      await sleep(5000); // Wait for upload
    } else {
      console.error("Could not find file input.");
      return false;
    }

    // Send the message
    const sendButtonSelector = "button.msg-form__send-button:not(:disabled)";
    await page.waitForSelector(sendButtonSelector, { timeout: 10000 });
    await page.click(sendButtonSelector);

    console.log(`Successfully sent message to ${connection.firstName}.`);

    // Close the message pop-up window
    await sleep(2000); // Brief wait for UI to update

    // close message pop
    await closeMessageModal(page);

    return true;
  } catch (error) {
    console.error(
      `Failed to send message to ${connection.firstName}. Skipping.`,
      error
    );
    saveMessagedConnection(connection.profileUrl, FAIL_TRACKER_FILE);
    return false;
  }
}

// --- MAIN EXECUTION ---
async function main() {
  const email = process.env.LINKEDIN_EMAIL;
  const password = process.env.LINKEDIN_PASSWORD;

  if (!email || !password) {
    console.error(
      "Error: LINKEDIN_EMAIL or LINKEDIN_PASSWORD environment variables not set."
    );
    return;
  }

  if (!fs.existsSync(RESUME_FILE_PATH)) {
    console.error(`Error: Resume file not found at path: ${RESUME_FILE_PATH}`);
    return;
  }

  let browser: Browser | null = null;
  try {
    // browser data and cookies are not saved always open new browser

    // browser = await puppeteer.launch({
    //   headless: false, // Set to true to run in the background
    //   args: ["--window-size=1280,800"],
    // });

    browser = await puppeteer.launch({
      headless: false,
      args: ["--window-size=1280,800"],
      userDataDir: path.resolve(__dirname, "..", "linkedin_user_data"), // save browser data and cookies
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    if (!(await login(page, email, password))) {
      throw new Error("Login failed, aborting script.");
    }

    const messagedConnections = loadMessagedConnections(TRACKER_FILE);
    console.log(
      `Loaded ${messagedConnections.size} previously messaged connections.`
    );

    await closeMessageModal(page);

    const newConnections = await getNewConnections(page);

    const connectionsToMessage = newConnections.filter(
      (c) => !messagedConnections.has(c.profileUrl)
    );

    if (connectionsToMessage.length === 0) {
      console.log("\nNo new connections to message.");
    } else {
      console.log(
        `\nFound ${connectionsToMessage.length} new connections to message.`
      );
    }

    for (const connection of connectionsToMessage) {
      if (await sendMessageWithResume(page, connection)) {
        saveMessagedConnection(connection.profileUrl, TRACKER_FILE);
        const waitTime = Math.floor(Math.random() * 60000) + 30000; // 30-90 seconds
        console.log(
          `Waiting for ${Math.round(waitTime / 1000)}s before next action...`
        );
        await sleep(waitTime);
      }
    }

    console.log("\nBot has finished its run.");
  } catch (error) {
    console.error("An unexpected error occurred:", error);
  } finally {
    if (browser) {
      await browser.close();
    }

    const messagedConnections = loadMessagedConnections(TRACKER_FILE);
    const failedCollection = loadMessagedConnections(FAIL_TRACKER_FILE);

    const data = filterFailedConnectionData(
      Array.from(failedCollection),
      Array.from(messagedConnections)
    );

    fs.unlinkSync(FAIL_TRACKER_FILE);

    for (const url of data) {
      saveMessagedConnection(url, FAIL_TRACKER_FILE);
    }
  }
}

main();
