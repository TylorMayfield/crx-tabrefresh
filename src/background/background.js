/* eslint-disable no-undef */

// Initialize storage with default values
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({
    activeTimers: {},
    skipActiveTab: false
  });
});

let skipActiveTab = false;
let activeTimers = {};

// Helper function to broadcast timer updates
const broadcastTimerUpdate = () => {
  const now = Date.now();
  
  // Get the current active tab
  chrome.tabs.query({ active: true, currentWindow: true }, ([activeTab]) => {
    const activeTabId = activeTab ? activeTab.id : null;
    
    const timersWithCountdown = Object.entries(activeTimers).reduce(
      (acc, [tabId, timer]) => {
        const isActiveTab = parseInt(tabId) === activeTabId;
        
        // If tab is active or paused, maintain current state
        if (timer.paused || isActiveTab) {
          acc[tabId] = {
            ...timer,
            inFocus: isActiveTab,
            effectivelyPaused: timer.paused || isActiveTab
          };
          return acc;
        }

        const elapsedTime = now - timer.lastRefresh;
        const timeLeft = timer.interval - elapsedTime;
        
        // If we've reached the end of the interval, refresh the tab and update lastRefresh
        if (timeLeft <= 0) {
          refreshTab(parseInt(tabId));
          timer.lastRefresh = now;
          acc[tabId] = {
            ...timer,
            timeLeft: timer.interval,
            nextRefresh: now + timer.interval,
            inFocus: false,
            effectivelyPaused: false
          };
        } else {
          acc[tabId] = {
            ...timer,
            timeLeft,
            nextRefresh: timer.lastRefresh + timer.interval,
            inFocus: false,
            effectivelyPaused: false
          };
        }
        return acc;
      },
      {}
    );

    chrome.runtime.sendMessage({
      action: "timerUpdate",
      timers: timersWithCountdown,
    }).catch(() => {
      // Ignore errors when popup is closed
    });
  });
};

// Function to refresh a tab based on its timer
const refreshTab = async (tabId) => {
  if (skipActiveTab) {
    const [activeTab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (activeTab && activeTab.id === tabId) {
      return;
    }
  }
  chrome.tabs.reload(tabId);
  if (activeTimers[tabId]) {
    activeTimers[tabId].lastRefresh = Date.now();
    chrome.storage.local.set({ activeTimers });
    broadcastTimerUpdate();
  }
};

// Function to start a timer for a tab
const startTimer = async (tabId, interval) => {
  console.log("Starting timer for tab:", tabId, "interval:", interval);
  try {
    // Clear existing timer if it exists
    if (activeTimers[tabId]) {
      console.log("Clearing existing timer for tab:", tabId);
      clearInterval(activeTimers[tabId].timerId);
    }

    const tab = await chrome.tabs.get(tabId);
    console.log("Got tab info:", tab);

    const now = Date.now();
    activeTimers[tabId] = {
      interval: interval * 1000, // Store interval in milliseconds
      lastRefresh: now,
      timerId: null,
      title: tab.title,
      favIconUrl: tab.favIconUrl,
      url: tab.url,
      tabId,
      paused: false,
      timeLeft: interval * 1000, // Keep timeLeft in milliseconds
      nextRefresh: now + (interval * 1000)
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

// Function to toggle pause/resume a timer
const togglePauseTimer = async (tabId) => {
  try {
    const timer = activeTimers[tabId];
    if (timer) {
      const now = Date.now();
      if (!timer.paused) {
        // Pause the timer
        timer.paused = true;
        timer.timeLeft = timer.nextRefresh - now; // Save the remaining time
      } else {
        // Resume the timer
        timer.paused = false;
        timer.lastRefresh = now - (timer.interval - timer.timeLeft);
        timer.nextRefresh = timer.lastRefresh + timer.interval;
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
chrome.storage.local.get(['activeTimers', 'skipActiveTab'], (result) => {
  if (result.activeTimers) activeTimers = result.activeTimers;
  if (typeof result.skipActiveTab !== 'undefined') skipActiveTab = result.skipActiveTab;
});

// Consolidated message listener to handle all actions
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
        .catch((error) => sendResponse({ success: false, error: error.message }));
      return true;

    case "stopTimer":
      stopTimer(message.tabId)
        .then((response) => sendResponse(response))
        .catch((error) => sendResponse({ success: false, error: error.message }));
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

    case "removeTimer":
      if (activeTimers[message.tabId]) {
        delete activeTimers[message.tabId];
        chrome.storage.local.set({ activeTimers });
        broadcastTimerUpdate();
        sendResponse({ success: true });
      }
      return true;

    case "pause":
      if (activeTimers[message.tabId]) {
        activeTimers[message.tabId].paused = true;
        chrome.storage.local.set({ activeTimers });
        broadcastTimerUpdate();
        sendResponse({ success: true });
      }
      return true;

    case "resume":
      if (activeTimers[message.tabId]) {
        activeTimers[message.tabId].paused = false;
        chrome.storage.local.set({ activeTimers });
        broadcastTimerUpdate();
        sendResponse({ success: true });
      }
      return true;

    default:
      console.warn("Unknown action:", message.action);
      sendResponse({ error: "Unknown action" });
      return true;
  }
});

// Tab removed event listener to clear the timer
chrome.tabs.onRemoved.addListener((tabId) => {
  if (activeTimers[tabId]) {
    delete activeTimers[tabId];
    chrome.storage.local.set({ activeTimers });
    broadcastTimerUpdate();
  }
});

// Tab updated event listener to track changes like title and favicon
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (activeTimers[tabId] && (changeInfo.title || changeInfo.favIconUrl)) {
    activeTimers[tabId].title = tab.title;
    activeTimers[tabId].favIconUrl = tab.favIconUrl;
    chrome.storage.local.set({ activeTimers });
    broadcastTimerUpdate();
  }
});

// Call broadcastTimerUpdate every second to update the timer state
setInterval(broadcastTimerUpdate, 1000);
