import { Page } from "puppeteer";
import fs from "fs";

export const sleep = (ms: number) =>
  new Promise((res) => setTimeout(res, ms + Math.random() * 500));

export const loadMessagedConnections = (TRACKER_FILE: string): Set<string> => {
  if (!fs.existsSync(TRACKER_FILE)) {
    return new Set();
  }
  const data = fs.readFileSync(TRACKER_FILE, "utf-8");
  return new Set(data.split("\n").filter((line) => line.trim() !== ""));
};

export const saveMessagedConnection = (url: string, TRACKER_FILE: string) => {
  fs.appendFileSync(TRACKER_FILE, url + "\n");
};

export async function handlePersistentModal(
  page: Page,
  messageButtonSelector: string
): Promise<void> {
  for (let i = 0; i < 3; i++) {
    try {
      const closeModalButtonSelector = 'button[aria-label="Dismiss"]';
      await page.waitForSelector(closeModalButtonSelector, {
        timeout: 2000,
        visible: true,
      });
      await page.click(closeModalButtonSelector);
      console.log(`Closed a pop-up modal (Attempt ${i + 1}).`);
      await sleep(1500);

      await sleep(1000); // Wait a second for the modal to close

      await page.waitForSelector(messageButtonSelector, { timeout: 15000 });

      await page.click(messageButtonSelector);
      console.log("Clicked message button again");
    } catch (error) {
      console.log("No persistent modal found on this check.");
      return;
    }
  }
}

export async function closeMessageModal(page: Page) {
  try {
    //  XPath selector. Think of it as a very detailed address for finding a specific element on a webpage, especially when a simple ID or class name isn't available or reliable.
    const closeButtonXPath = `//button[contains(@class, 'msg-overlay-bubble-header__control') and .//*[name()='svg' and @data-test-icon='close-small']]`;
    const closeButton = await page.waitForSelector(
      "xpath/" + closeButtonXPath,
      { timeout: 5000 }
    );
    if (closeButton) {
      await closeButton.click();
      console.log("Closed the message pop-up.");
    }
  } catch (error) {
    console.warn(
      "Could not find the message pop-up close button. Continuing anyway."
    );
  }
}
