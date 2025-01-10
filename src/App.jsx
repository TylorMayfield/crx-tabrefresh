import {
  MantineProvider,
  AppShell,
  Text,
  Button,
  Stack,
  Table,
  Slider,
  Group,
  Card,
  Box,
  Container,
  Paper,
  Title,
  Badge,
  ActionIcon,
  Tooltip,
  Avatar,
} from "@mantine/core";
import { useColorScheme } from "@mantine/hooks";
import { useEffect, useState } from "react";
import { useMantineColorScheme } from "@mantine/core";
import {
  IconRefresh,
  IconPlayerPause,
  IconPlayerPlay,
  IconPlayerStop,
  IconClock,
  IconMoon2,
  IconSun,
} from "@tabler/icons-react";
import "./App.css";

function App() {
  const preferredColorScheme = useColorScheme();
  const { colorScheme, toggleColorScheme } = useMantineColorScheme({
    defaultValue: preferredColorScheme,
  });
  const dark = colorScheme === "dark";

  const [activeTimers, setActiveTimers] = useState({});
  const [duration, setDuration] = useState(5000);
  const [currentTabId, setCurrentTabId] = useState(null);

  const startTimer = () => {
    console.log("Starting timer with:", { currentTabId, duration });
    if (currentTabId) {
      chrome.runtime.sendMessage(
        {
          action: "startTimer",
          tabId: currentTabId,
          interval: duration / 1000,
        },
        (response) => {
          console.log("Timer start response:", response);
          if (response && response.success) {
            fetchActiveTimers(); // Refresh the timer list immediately
          }
        }
      );
    } else {
      console.warn("No current tab ID available");
      // Get current tab as fallback
      chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
        if (tab) {
          console.log("Found current tab:", tab.id);
          setCurrentTabId(tab.id);
          chrome.runtime.sendMessage(
            {
              action: "startTimer",
              tabId: tab.id,
              interval: duration,
            },
            (response) => {
              console.log("Timer start response (fallback):", response);
              if (response && response.success) {
                fetchActiveTimers();
              }
            }
          );
        }
      });
    }
  };

  const refreshTab = (tabId) => {
    chrome.runtime.sendMessage({ action: "refreshTab", tabId }, (response) => {
      if (response && response.success) {
        fetchActiveTimers();
      }
    });
  };

  const pauseTimer = (tabId) => {
    chrome.runtime.sendMessage(
      { action: "togglePauseTimer", tabId },
      (response) => {
        if (response && response.success) {
          fetchActiveTimers();
        }
      }
    );
  };

  const stopTimer = (tabId) => {
    chrome.runtime.sendMessage({ action: "stopTimer", tabId }, (response) => {
      if (response && response.success) {
        fetchActiveTimers();
      }
    });
  };

  const fetchActiveTimers = () => {
    chrome.runtime.sendMessage({ action: "getActiveTimers" }, (response) => {
      if (response && response.timers) {
        // Don't update if we already have timers (let the broadcast handle updates)
        if (Object.keys(activeTimers).length === 0) {
          setActiveTimers(response.timers);
        }
      }
    });
  };

  useEffect(() => {
    // Get current tab ID
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (tab) {
        console.log("Setting current tab ID:", tab.id);
        setCurrentTabId(tab.id);
      }
    });

    // Listen for timer updates from the background script
    const handleTimerUpdate = (message) => {
      if (message.action === "timerUpdate") {
        setActiveTimers(message.timers);
      }
    };

    chrome.runtime.onMessage.addListener(handleTimerUpdate);
    fetchActiveTimers(); // Initial fetch

    return () => {
      chrome.runtime.onMessage.removeListener(handleTimerUpdate);
    };
  }, []);

  const renderTimerRow = (timer) => (
    <Table.Tr key={timer.tabId}>
      <Table.Td>
        <Group>
          <Avatar src={timer.favIconUrl} alt={timer.title} size="sm" />
          <Text size="sm" style={{ maxWidth: "200px" }} truncate>
            {timer.title}
          </Text>
        </Group>
      </Table.Td>
      <Table.Td>
        <Group spacing="xs">
          <Badge variant="light">
            {timer.inFocus 
              ? "In Focus" 
              : timer.paused 
                ? "Paused" 
                : Math.floor(timer.timeLeft / 1000) + "s"}
          </Badge>
        </Group>
      </Table.Td>
      <Table.Td>
        <Group spacing="xs" position="right">
          <ActionIcon
            onClick={() => pauseTimer(timer.tabId)}
            variant="subtle"
            color={timer.effectivelyPaused ? "blue" : "yellow"}
            disabled={timer.inFocus}
          >
            {timer.effectivelyPaused && !timer.inFocus ? (
              <IconPlayerPlay size={16} />
            ) : (
              <IconPlayerPause size={16} />
            )}
          </ActionIcon>
          <ActionIcon 
            onClick={() => stopTimer(timer.tabId)} 
            variant="subtle" 
            color="red"
          >
            <IconPlayerStop size={16} />
          </ActionIcon>
        </Group>
      </Table.Td>
    </Table.Tr>
  );

  return (
    <MantineProvider
      theme={{
        colorScheme,
        primaryColor: "blue",
        components: {
          Button: {
            styles: {
              root: {
                fontWeight: 500,
              },
            },
          },
          Table: {
            styles: (theme) => ({
              root: {
                "& thead tr th": {
                  backgroundColor:
                    theme.colorScheme === "dark"
                      ? theme.colors.dark[7]
                      : theme.colors.gray[0],
                  color:
                    theme.colorScheme === "dark"
                      ? theme.colors.dark[0]
                      : theme.colors.gray[9],
                  fontWeight: 600,
                  fontSize: theme.fontSizes.sm,
                  padding: `${theme.spacing.xs}px ${theme.spacing.sm}px`,
                },
                "& tbody tr td": {
                  padding: `${theme.spacing.xs}px ${theme.spacing.sm}px`,
                  borderBottom: `1px solid ${
                    theme.colorScheme === "dark"
                      ? theme.colors.dark[4]
                      : theme.colors.gray[2]
                  }`,
                },
                "& tbody tr:hover": {
                  backgroundColor:
                    theme.colorScheme === "dark"
                      ? theme.colors.dark[6]
                      : theme.colors.gray[0],
                },
              },
            }),
          },
        },
      }}
      withGlobalStyles
      withNormalizeCSS
    >
      <AppShell
        padding="md"
        style={{
          background: dark ? "#1A1B1E" : "#F8F9FA",
          minHeight: "50vh",
          height: "auto",
          minWidth: "550px",
        }}
      >
        <Container size="sm" py="md">
          <Paper shadow="sm" radius="md" p="md" withBorder>
            <Stack spacing="lg">
              <Group position="center">
                <IconClock size={24} />
                <Title order={2}>Tab Refresh</Title>
                <Box alignSelf="flex-end" ml="auto">
                  <Tooltip
                    label="Toggle Color Scheme"
                    withArrow
                    position="right"
                  >
                    <ActionIcon
                      onClick={() => toggleColorScheme()}
                      size="lg"
                      sx={(theme) => ({
                        backgroundColor:
                          theme.colorScheme === "dark"
                            ? theme.colors.dark[6]
                            : theme.colors.gray[0],
                        color:
                          theme.colorScheme === "dark"
                            ? theme.colors.yellow[4]
                            : theme.colors.blue[6],
                      })}
                    >
                      {dark ? <IconMoon2 size={20} /> : <IconSun size={20} />}
                    </ActionIcon>
                  </Tooltip>
                </Box>
              </Group>

              <Paper shadow="xs" p="md" radius="md" withBorder>
                <Stack spacing="xs">
                  <Text size="sm" weight={500} color="dimmed">
                    Timer Interval
                  </Text>
                  <Slider
                    value={duration}
                    onChange={setDuration}
                    min={1000}
                    max={60000}
                    step={1000}
                    label={(value) => `${value / 1000}s`}
                    marks={[
                      { value: 5000, label: "5s" },
                      { value: 15000, label: "15s" },
                      { value: 30000, label: "30s" },
                      { value: 50000, label: "50s" },
                      { value: 60000, label: "60s" },
                    ]}
                    styles={(theme) => ({
                      mark: {
                        width: "4px",
                        height: "4px",
                        borderRadius: "2px",
                      },
                      markLabel: {
                        fontSize: theme.fontSizes.xs,
                      },
                    })}
                  />
                </Stack>
              </Paper>

              <Paper shadow="xs" p="md" radius="md" withBorder>
                <Stack spacing="md">
                  <Text size="sm" weight={500} color="dimmed">
                    Active Timers
                  </Text>
                  {Object.keys(activeTimers).length > 0 ? (
                    <Box sx={{ overflow: "auto" }}>
                      <Table striped highlightOnHover>
                        <Table.Thead>
                          <Table.Tr>
                            <Table.Th>Tab</Table.Th>
                            <Table.Th>Interval</Table.Th>
                            <Table.Th
                              style={{ width: "100px", textAlign: "center" }}
                            >
                              Actions
                            </Table.Th>
                          </Table.Tr>
                        </Table.Thead>
                        <Table.Tbody>
                          {Object.values(activeTimers).map((timer) =>
                            renderTimerRow(timer)
                          )}
                        </Table.Tbody>
                      </Table>
                    </Box>
                  ) : (
                    <Text color="dimmed" size="sm" align="center" py="md">
                      No active timers
                    </Text>
                  )}
                </Stack>
              </Paper>

              <Group position="center" spacing="sm">
                <Button
                  leftIcon={<IconPlayerPlay size={16} />}
                  onClick={startTimer}
                >
                  Start Timer
                </Button>
                <Button
                  variant="light"
                  leftIcon={<IconRefresh size={16} />}
                  onClick={() => refreshTab(currentTabId)}
                >
                  Refresh Tab
                </Button>
              </Group>
            </Stack>
          </Paper>
        </Container>
        <footer style={{ textAlign: 'center', padding: '20px', marginTop: 'auto' }}>
          <a href="https://ko-fi.com/tylormayfield" target="_blank" rel="noopener noreferrer">
            <img src="https://ko-fi.com/img/githubbutton_sm.svg" alt="Buy Me a Coffee" />
          </a>
        </footer>
      </AppShell>
    </MantineProvider>
  );
}

export default App;
