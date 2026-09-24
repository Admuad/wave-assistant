import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  CreateWaveApplicationBody,
  GetContributorProfileResponse,
  GetNotificationSettingsResponse,
  GetWaveActivityResponse,
  GetWaveApplicationsResponse,
  GetWaveIssuesQueryParams,
  GetWaveIssuesResponse,
  GetWaveOverviewResponse,
  UpdateContributorProfileBody,
  UpdateNotificationSettingsBody,
  UpdateNotificationSettingsResponse,
  UpdateContributorProfileResponse,
  CreateWaveApplicationResponse,
  TestNotificationBody,
  TestNotificationResponse,
} from "@workspace/api-zod";
import {
  activityEntriesTable,
  contributorProfilesTable,
  db,
  notificationSettingsTable,
  waveApplicationsTable,
  waveIssuesTable,
} from "@workspace/db";

const router: IRouter = Router();
const DEFAULT_PROFILE_ID = "default";
const DEFAULT_SETTINGS_ID = "default";
const LIVE_WAVE_PROGRAM_ID = "fdc01c95-806f-4b6a-998b-a6ed37e0d81b";
const LIVE_ISSUES_URL =
  `https://wave-api.drips.network/api/issues?limit=100&waveProgramId=${LIVE_WAVE_PROGRAM_ID}&state=open&sortBy=updatedAt`;
const LIVE_WAVES_URL =
  `https://wave-api.drips.network/api/wave-programs/${LIVE_WAVE_PROGRAM_ID}/waves?limit=100`;

type LiveIssue = {
  id: string;
  title: string;
  body?: string | null;
  state: string;
  assignees?: Array<{ login?: string }>;
  assignedApplicant?: { gitHubUsername?: string | null } | null;
  labels?: Array<{ name?: string }>;
  repo?: {
    gitHubRepoName?: string;
    gitHubRepoFullName?: string;
    gitHubRepoUrl?: string;
    org?: { gitHubOrgLogin?: string };
  };
  updatedAt: string;
  points?: number | null;
  complexity?: string | null;
  pendingApplicationsCount?: number | null;
  gitHubIssueNumber?: number | null;
};

type LiveWave = {
  waveNumber: number;
  endDate: string;
  budgetUSD: string;
  status: string;
};

const seedIssues = [
  {
    id: "stellar-sdk-214",
    title: "Add retry policy to Horizon client requests",
    repository: "stellar/stellar-sdk",
    organization: "Stellar",
    url: "https://github.com/stellar/stellar-sdk/issues/214",
    points: 200,
    complexity: "High",
    status: "open",
    applicants: 2,
    matchedSkills: ["TypeScript", "API design", "testing"],
    summary:
      "Improve transient failure handling in the Horizon client while keeping the existing request API stable.",
  },
  {
    id: "stellar-go-98",
    title: "Improve pagination helpers for account effects",
    repository: "stellar/go",
    organization: "Stellar",
    url: "https://github.com/stellar/go/issues/98",
    points: 150,
    complexity: "Medium",
    status: "open",
    applicants: 1,
    matchedSkills: ["Go", "API design"],
    summary:
      "Make cursor-based pagination easier to consume and add coverage for empty and repeated cursors.",
  },
  {
    id: "soroban-cli-61",
    title: "Document contract deployment error messages",
    repository: "stellar/soroban-cli",
    organization: "Stellar",
    url: "https://github.com/stellar/soroban-cli/issues/61",
    points: 100,
    complexity: "Trivial",
    status: "open",
    applicants: 0,
    matchedSkills: ["Rust", "documentation"],
    summary:
      "Collect the most common deployment errors and give contributors actionable recovery steps.",
  },
  {
    id: "stellar-core-441",
    title: "Add structured logging to peer reconnect flow",
    repository: "stellar/stellar-core",
    organization: "Stellar",
    url: "https://github.com/stellar/stellar-core/issues/441",
    points: 200,
    complexity: "High",
    status: "open",
    applicants: 3,
    matchedSkills: ["C++", "observability", "testing"],
    summary:
      "Expose useful reconnect context without changing the node's existing log levels or output contract.",
  },
  {
    id: "stellar-docs-32",
    title: "Refresh JavaScript quickstart examples",
    repository: "stellar/stellar-docs",
    organization: "Stellar",
    url: "https://github.com/stellar/stellar-docs/issues/32",
    points: 100,
    complexity: "Trivial",
    status: "assigned",
    applicants: 4,
    matchedSkills: ["JavaScript", "documentation"],
    summary:
      "Update the quickstart snippets to use the current SDK packages and verify each example from a clean install.",
  },
];

const seedActivity = [
  {
    id: "activity-wave-opened",
    type: "sync",
    title: "Wave 9 is being watched",
    description: "The Stellar issue feed is ready for your next review.",
  },
  {
    id: "activity-slot-released",
    type: "release",
    title: "A slot is available",
    description:
      "One application was not assigned in the last review and no longer counts against your limit.",
  },
  {
    id: "activity-profile-ready",
    type: "sync",
    title: "Matching profile is ready",
    description:
      "Add the languages and libraries you can confidently deliver with.",
  },
];

async function fetchLiveIssues(): Promise<LiveIssue[]> {
  const response = await fetch(LIVE_ISSUES_URL);
  if (!response.ok) {
    throw new Error(`Drips issue feed returned ${response.status}`);
  }
  const payload = (await response.json()) as { data?: LiveIssue[] };
  return payload.data ?? [];
}

async function fetchLiveWave(): Promise<LiveWave | null> {
  const response = await fetch(LIVE_WAVES_URL);
  if (!response.ok) {
    throw new Error(`Drips wave feed returned ${response.status}`);
  }
  const payload = (await response.json()) as { data?: LiveWave[] };
  return payload.data?.find((wave) => wave.status === "active") ?? null;
}

function pointsForIssue(issue: LiveIssue): number {
  if (typeof issue.points === "number") return issue.points;
  if (issue.complexity === "large") return 200;
  if (issue.complexity === "medium") return 150;
  return 100;
}

function complexityForIssue(issue: LiveIssue): "Trivial" | "Medium" | "High" {
  if (issue.complexity === "large") return "High";
  if (issue.complexity === "medium") return "Medium";
  return "Trivial";
}

function issueUrl(issue: LiveIssue): string {
  return `https://www.drips.network/wave/stellar/issues/${issue.id}`;
}

function toIssueView(issue: LiveIssue, profile: { skills: string[] }) {
  const searchable = [
    issue.title,
    issue.body ?? "",
    ...(issue.labels ?? []).map((label) => label.name ?? ""),
    issue.repo?.gitHubRepoFullName ?? "",
  ].join(" ").toLowerCase();
  const matchedSkills = profile.skills.filter((skill) =>
    searchable.includes(skill.toLowerCase()),
  );
  const isAssigned =
    Boolean(issue.assignedApplicant) || Boolean(issue.assignees?.length);
  return {
    id: issue.id,
    title: issue.title,
    repository: issue.repo?.gitHubRepoName ?? "Unknown repository",
    organization: issue.repo?.org?.gitHubOrgLogin ?? "Unknown organization",
    url: issueUrl(issue),
    points: pointsForIssue(issue),
    complexity: complexityForIssue(issue),
    status: isAssigned ? "assigned" : "open",
    applicants: issue.pendingApplicationsCount ?? 0,
    matchScore: Math.min(99, 45 + matchedSkills.length * 12),
    matchedSkills: matchedSkills.length ? matchedSkills : ["Open source"],
    summary: (issue.body ?? "No issue summary provided.")
      .replace(/[#*_`]/g, "")
      .replace(/\s+/g, " ")
      .slice(0, 240),
    updatedAt: issue.updatedAt,
    assignedUsername: issue.assignedApplicant?.gitHubUsername ?? null,
  };
}

async function ensureSeedData(): Promise<void> {
  const [profile] = await db
    .select()
    .from(contributorProfilesTable)
    .where(eq(contributorProfilesTable.id, DEFAULT_PROFILE_ID));

  if (!profile) {
    await db.insert(contributorProfilesTable).values({
      id: DEFAULT_PROFILE_ID,
      name: "Your contributor profile",
      githubUsername: "",
      skills: ["TypeScript", "JavaScript", "React", "Node.js", "testing"],
      repositories: [],
      minPoints: 100,
      maxOrganizationApplications: 4,
    });
  }

  const existingIssues = await db.select({ id: waveIssuesTable.id }).from(waveIssuesTable);
  if (existingIssues.length === 0) {
    await db.insert(waveIssuesTable).values(
      seedIssues.map((issue) => ({
        ...issue,
        updatedAt: new Date(),
      })),
    );
  }

  const existingActivity = await db
    .select({ id: activityEntriesTable.id })
    .from(activityEntriesTable);
  if (existingActivity.length === 0) {
    await db.insert(activityEntriesTable).values(
      seedActivity.map((entry) => ({
        ...entry,
        createdAt: new Date(),
      })),
    );
  }

  const [settings] = await db
    .select()
    .from(notificationSettingsTable)
    .where(eq(notificationSettingsTable.id, DEFAULT_SETTINGS_ID));
  if (!settings) {
    await db.insert(notificationSettingsTable).values({
      id: DEFAULT_SETTINGS_ID,
      telegramEnabled: "false",
      assignmentAlertsEnabled: "true",
    });
  }
}

async function sendTelegramMessage(chatId: string, message: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return false;
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: message }),
  });
  return response.ok;
}

async function syncTrackedAssignments(
  liveIssues: LiveIssue[],
  githubUsername: string,
): Promise<void> {
  if (!githubUsername) return;
  const tracked = await db
    .select()
    .from(waveApplicationsTable)
    .where(eq(waveApplicationsTable.status, "pending"));
  const settings = await db
    .select()
    .from(notificationSettingsTable)
    .where(eq(notificationSettingsTable.id, DEFAULT_SETTINGS_ID));
  const notification = settings[0];

  for (const application of tracked) {
    const issue = liveIssues.find((candidate) => candidate.id === application.issueId);
    const assignedUsername = issue?.assignedApplicant?.gitHubUsername?.toLowerCase();
    if (!issue || assignedUsername !== githubUsername.toLowerCase()) continue;

    const assignedAt = new Date();
    await db
      .update(waveApplicationsTable)
      .set({ status: "assigned", assignedAt })
      .where(eq(waveApplicationsTable.id, application.id));
    await db.insert(activityEntriesTable).values({
      id: randomUUID(),
      type: "assignment",
      title: "You were assigned an issue",
      description: application.issueTitle,
      createdAt: assignedAt,
    });

    if (
      notification?.telegramEnabled === "true" &&
      notification.assignmentAlertsEnabled === "true" &&
      notification.telegramChatId
    ) {
      const sent = await sendTelegramMessage(
        notification.telegramChatId,
        `Drips Wave assignment\\n\\n${application.issueTitle}\\n${application.repository}\\n\\nOpen it in Drips and get started.`,
      );
      if (sent) {
        await db
          .update(notificationSettingsTable)
          .set({ lastNotifiedAt: assignedAt })
          .where(eq(notificationSettingsTable.id, DEFAULT_SETTINGS_ID));
      }
    }
  }
}

function boolFromText(value: string): boolean {
  return value === "true";
}

function iso(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}

router.get("/wave/overview", async (_req, res): Promise<void> => {
  await ensureSeedData();
  const [profile] = await db
    .select()
    .from(contributorProfilesTable)
    .where(eq(contributorProfilesTable.id, DEFAULT_PROFILE_ID));
  const liveIssues = await fetchLiveIssues();
  await syncTrackedAssignments(liveIssues, profile?.githubUsername ?? "");
  const activeWave = await fetchLiveWave();
  const pendingApplications = await db
    .select({ count: waveApplicationsTable.id })
    .from(waveApplicationsTable)
    .where(eq(waveApplicationsTable.status, "pending"));
  const openIssues = liveIssues.filter(
    (issue) => !issue.assignedApplicant && !issue.assignees?.length,
  );
  const assignments = await db
    .select({ id: waveApplicationsTable.id })
    .from(waveApplicationsTable)
    .where(eq(waveApplicationsTable.status, "assigned"));
  const pendingCount = pendingApplications.length;
  res.json(
    GetWaveOverviewResponse.parse({
      programName: "Stellar",
      waveLabel: activeWave ? `Wave ${activeWave.waveNumber}` : "Current wave",
      rewardBudget: activeWave ? `$${Number(activeWave.budgetUSD).toLocaleString()}` : "Unknown",
      pendingApplications: pendingCount,
      applicationLimit: 15,
      availableSlots: Math.max(0, 15 - pendingCount),
      openIssueCount: openIssues.length,
      lastSyncedAt: new Date().toISOString(),
      nextWaveEndsAt: activeWave?.endDate ?? new Date().toISOString(),
      assignmentCount: assignments.length,
    }),
  );
});

router.get("/wave/issues", async (req, res): Promise<void> => {
  await ensureSeedData();
  const parsedQuery = GetWaveIssuesQueryParams.safeParse(req.query);
  if (!parsedQuery.success) {
    res.status(400).json({ error: parsedQuery.error.message });
    return;
  }
  const { query, sort, onlyOpen } = parsedQuery.data;
  const [profile] = await db
    .select()
    .from(contributorProfilesTable)
    .where(eq(contributorProfilesTable.id, DEFAULT_PROFILE_ID));
  const liveIssues = await fetchLiveIssues();
  await syncTrackedAssignments(liveIssues, profile?.githubUsername ?? "");
  let issues = liveIssues
    .filter((issue) => !onlyOpen || (!issue.assignedApplicant && !issue.assignees?.length))
    .map((issue) => toIssueView(issue, { skills: profile?.skills ?? [] }));
  if (query) {
    const needle = query.toLowerCase();
    issues = issues.filter(
      (issue) =>
        issue.title.toLowerCase().includes(needle) ||
        issue.repository.toLowerCase().includes(needle) ||
        issue.organization.toLowerCase().includes(needle),
    );
  }

  if (sort === "points") {
    issues = [...issues].sort((a, b) => b.points - a.points);
  } else if (sort === "match") {
    issues = [...issues].sort(
      (a, b) => b.matchedSkills.length - a.matchedSkills.length || b.points - a.points,
    );
  }

  res.json(GetWaveIssuesResponse.parse(issues));
});

router.get("/wave/activity", async (_req, res): Promise<void> => {
  await ensureSeedData();
  const activity = await db
    .select()
    .from(activityEntriesTable)
    .orderBy(desc(activityEntriesTable.createdAt));
  res.json(
    GetWaveActivityResponse.parse(
      activity.map((entry) => ({
        ...entry,
        createdAt: entry.createdAt.toISOString(),
      })),
    ),
  );
});

router.get("/wave/applications", async (_req, res): Promise<void> => {
  await ensureSeedData();
  const [profile] = await db
    .select()
    .from(contributorProfilesTable)
    .where(eq(contributorProfilesTable.id, DEFAULT_PROFILE_ID));
  const liveIssues = await fetchLiveIssues();
  await syncTrackedAssignments(liveIssues, profile?.githubUsername ?? "");
  const applications = await db
    .select()
    .from(waveApplicationsTable)
    .orderBy(desc(waveApplicationsTable.appliedAt));
  res.json(
    GetWaveApplicationsResponse.parse(
      applications.map((application) => ({
        ...application,
        appliedAt: application.appliedAt.toISOString(),
        assignedAt: iso(application.assignedAt),
      })),
    ),
  );
});

router.post("/wave/applications", async (req, res): Promise<void> => {
  await ensureSeedData();
  const parsed = CreateWaveApplicationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [application] = await db
    .insert(waveApplicationsTable)
    .values({
      id: randomUUID(),
      ...parsed.data,
      status: parsed.data.status ?? "pending",
    })
    .returning();
  const response = CreateWaveApplicationResponse.parse({
    ...application,
    appliedAt: application.appliedAt.toISOString(),
    assignedAt: iso(application.assignedAt),
  });
  res.status(201).json(response);
});

router.get("/profile", async (_req, res): Promise<void> => {
  await ensureSeedData();
  const [profile] = await db
    .select()
    .from(contributorProfilesTable)
    .where(eq(contributorProfilesTable.id, DEFAULT_PROFILE_ID));
  res.json(GetContributorProfileResponse.parse(profile));
});

router.put("/profile", async (req, res): Promise<void> => {
  await ensureSeedData();
  const parsed = UpdateContributorProfileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [profile] = await db
    .update(contributorProfilesTable)
    .set(parsed.data)
    .where(eq(contributorProfilesTable.id, DEFAULT_PROFILE_ID))
    .returning();
  res.json(UpdateContributorProfileResponse.parse(profile));
});

router.get("/notifications", async (_req, res): Promise<void> => {
  await ensureSeedData();
  const [settings] = await db
    .select()
    .from(notificationSettingsTable)
    .where(eq(notificationSettingsTable.id, DEFAULT_SETTINGS_ID));
  res.json(
    GetNotificationSettingsResponse.parse({
      ...settings,
      telegramEnabled: boolFromText(settings.telegramEnabled),
      assignmentAlertsEnabled: boolFromText(settings.assignmentAlertsEnabled),
      lastNotifiedAt: iso(settings.lastNotifiedAt),
    }),
  );
});

router.put("/notifications", async (req, res): Promise<void> => {
  await ensureSeedData();
  const parsed = UpdateNotificationSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [settings] = await db
    .update(notificationSettingsTable)
    .set({
      telegramEnabled: String(parsed.data.telegramEnabled),
      assignmentAlertsEnabled: String(parsed.data.assignmentAlertsEnabled),
      telegramChatId: parsed.data.telegramChatId ?? null,
    })
    .where(eq(notificationSettingsTable.id, DEFAULT_SETTINGS_ID))
    .returning();
  res.json(
    UpdateNotificationSettingsResponse.parse({
      ...settings,
      telegramEnabled: boolFromText(settings.telegramEnabled),
      assignmentAlertsEnabled: boolFromText(settings.assignmentAlertsEnabled),
      lastNotifiedAt: iso(settings.lastNotifiedAt),
    }),
  );
});

router.post("/notifications/test", async (req, res): Promise<void> => {
  const parsed = TestNotificationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (!process.env.TELEGRAM_BOT_TOKEN) {
    res
      .status(503)
      .json(
        TestNotificationResponse.parse({
          sent: false,
          message: "Telegram is not configured for this app yet.",
        }),
      );
    return;
  }
  const sent = await sendTelegramMessage(
    parsed.data.chatId,
    "Wave Assistant is connected. Assignment alerts are ready.",
  );
  if (!sent) {
    res
      .status(503)
      .json(
        TestNotificationResponse.parse({
          sent: false,
          message: "Telegram rejected the test message. Check the chat ID.",
        }),
      );
    return;
  }
  res.json(
    TestNotificationResponse.parse({
      sent: true,
      message: "Test message sent. Check Telegram.",
    }),
  );
});

export default router;