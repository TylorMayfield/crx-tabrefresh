/* eslint-disable no-undef */

// Initialize storage with default values
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({
    activeTimers: {},
    skipActiveTab: true, // Set to true by default
  });
});

let skipActiveTab = true; // Set to true by default
let activeTimers = {};

const broadcastTimerUpdate = () => {
  const now = Date.now();
  const timersWithCountdown = Object.entries(activeTimers).reduce(
    (acc, [tabId, timer]) => {
      if (!timer.paused) {
        const elapsedTime = now - timer.lastRefresh;
        const timeLeft = timer.interval - (elapsedTime % timer.interval);

        if (elapsedTime >= timer.interval) {
          timer.lastRefresh = now - (elapsedTime % timer.interval);
        }

        acc[tabId] = {
          ...timer,
          timeLeft,
          nextRefresh: timer.lastRefresh + timer.interval,
        };
      } else {
        acc[tabId] = timer;
      }
      return acc;
    },
    {}
  );

  chrome.runtime.sendMessage({
    action: "timerUpdate",
    timers: timersWithCountdown,
  });
};

// Function to refresh a tab based on its timer
const refreshTab = async (tabId) => {
  try {
    if (skipActiveTab) {
      const [activeTab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (activeTab && activeTab.id === tabId) {
        console.log("Skipping refresh of active tab:", tabId);
        return;
      }
    }

    const timer = activeTimers[tabId];
    if (timer && !timer.paused) {
      chrome.tabs.reload(tabId);
      timer.lastRefresh = Date.now();
      await chrome.storage.local.set({ activeTimers });
      broadcastTimerUpdate();
    }
  } catch (error) {
    console.error("Error refreshing tab:", error);
  }
};

// Function to start a timer for a tab
const startTimer = async (tabId, interval) => {
  interval = interval / 1000;
  console.log("Starting timer for tab:", tabId, "interval:", interval);
  try {
    // Clear existing timer if it exists
    if (activeTimers[tabId]) {
      console.log("Clearing existing timer for tab:", tabId);
      clearInterval(activeTimers[tabId].timerId);
    }

    const tab = await chrome.tabs.get(tabId);

    const now = Date.now();
    const timerId = setInterval(() => refreshTab(tabId), interval);

    activeTimers[tabId] = {
      interval: interval / 1000,
      lastRefresh: now,
      timerId,
      title: tab.title,
      favIconUrl: tab.favIconUrl,
      url: tab.url,
      tabId,
      paused: false,
      timeLeft: interval,
      nextRefresh: now + interval,
    };

    console.log("Saving timer state:", activeTimers[tabId]);
    await chrome.storage.local.set({ activeTimers });
    broadcastTimerUpdate();
    return { success: true };
  } catch (error) {
    console.error("Error starting timer:", error);
    return { success: false, error: error.message };
  }
};

// Function to pause/resume a timer
const togglePauseTimer = async (tabId) => {
  try {
    const timer = activeTimers[tabId];
    if (timer) {
      const now = Date.now();
      if (!timer.paused) {
        // Pause the timer
        clearInterval(timer.timerId);
        timer.paused = true;
        timer.timeLeft = timer.nextRefresh - now;
      } else {
        // Resume the timer
        timer.lastRefresh = now - (timer.interval - timer.timeLeft);
        timer.nextRefresh = timer.lastRefresh + timer.interval;
        timer.timerId = setInterval(() => refreshTab(tabId), timer.interval);
        timer.paused = false;
      }
      await chrome.storage.local.set({ activeTimers });
      broadcastTimerUpdate();
      return { success: true, paused: timer.paused };
    }
    return { success: false, error: "Timer not found" };
  } catch (error) {
    console.error("Error toggling timer:", error);
    return { success: false, error: error.message };
  }
};

// Function to stop a timer
const stopTimer = async (tabId) => {
  try {
    if (activeTimers[tabId]) {
      clearInterval(activeTimers[tabId].timerId);
      delete activeTimers[tabId];
      await chrome.storage.local.set({ activeTimers });
      broadcastTimerUpdate();
      return { success: true };
    }
    return { success: false, error: "Timer not found" };
  } catch (error) {
    console.error("Error stopping timer:", error);
    return { success: false, error: error.message };
  }
};

// Load saved state
chrome.storage.local.get(["activeTimers", "skipActiveTab"], (result) => {
  if (result.activeTimers) {
    // Restore timers
    activeTimers = result.activeTimers;
    // Restart intervals for non-paused timers
    Object.entries(activeTimers).forEach(([tabId, timer]) => {
      if (!timer.paused) {
        timer.timerId = setInterval(() => refreshTab(tabId), timer.interval);
        timer.lastRefresh = Date.now();
      }
    });
  }
  if (typeof result.skipActiveTab !== "undefined")
    skipActiveTab = result.skipActiveTab;
});

// Start periodic updates
setInterval(broadcastTimerUpdate, 100);

// Message listener
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("Received message:", message);

  switch (message.action) {
    case "getActiveTimers":
      console.log("Sending active timers:", activeTimers);
      sendResponse({ timers: activeTimers });
      return true;

    case "startTimer":
      console.log("Starting timer with params:", message);
      startTimer(message.tabId, message.interval)
        .then((response) => {
          console.log("Timer start response:", response);
          sendResponse(response);
        })
        .catch((error) => {
          console.error("Timer start error:", error);
          sendResponse({ success: false, error: error.message });
        });
      return true;

    case "togglePauseTimer":
      togglePauseTimer(message.tabId)
        .then((response) => sendResponse(response))
        .catch((error) =>
          sendResponse({ success: false, error: error.message })
        );
      return true;

    case "stopTimer":
      stopTimer(message.tabId)
        .then((response) => sendResponse(response))
        .catch((error) =>
          sendResponse({ success: false, error: error.message })
        );
      return true;

    case "refreshTab":
      refreshTab(message.tabId);
      sendResponse({ success: true });
      return true;

    case "setSkipActiveTab":
      skipActiveTab = message.value;
      chrome.storage.local.set({ skipActiveTab: message.value });
      sendResponse({ success: true });
      return true;

    case "getSkipActiveTab":
      sendResponse({ skipActiveTab });
      return true;

    default:
      console.warn("Unknown action:", message.action);
      sendResponse({ error: "Unknown action" });
      return true;
  }
});

// Clean up timers when tabs are closed
chrome.tabs.onRemoved.addListener((tabId) => {
  if (activeTimers[tabId]) {
    clearInterval(activeTimers[tabId].timerId);
    delete activeTimers[tabId];
    chrome.storage.local.set({ activeTimers });
    broadcastTimerUpdate();
  }
});
