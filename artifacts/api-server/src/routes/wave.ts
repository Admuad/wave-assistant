import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  CreateWaveApplicationBody,
  CreateWaveApplicationResponse,
  GenerateProposalBody,
  GenerateProposalResponse,
  GetContributorProfileResponse,
  GetNotificationSettingsResponse,
  GetWaveActivityResponse,
  GetWaveApplicationsResponse,
  GetWaveIssuesQueryParams,
  GetWaveIssuesResponse,
  GetWaveOverviewResponse,
  RunAutopilotNowResponse,
  TestNotificationBody,
  TestNotificationResponse,
  UpdateContributorProfileBody,
  UpdateContributorProfileResponse,
  UpdateNotificationSettingsBody,
  UpdateNotificationSettingsResponse,
} from "@workspace/api-zod";
import {
  activityEntriesTable,
  contributorProfilesTable,
  db,
  notificationSettingsTable,
  waveApplicationsTable,
} from "@workspace/db";
import {
  calculateMatchScore,
  complexityForIssue,
  fetchLiveIssues,
  fetchLiveWave,
  fetchUserDripWaveData,
  isTrulyOpenIssue,
  issueUrl,
  LiveIssue,
  parseDripWaveToken,
  pointsForIssue,
  submitApplicationToDrips,
} from "../lib/drips-client";
import { generateAiProposal } from "../lib/proposal-generator";
import { runAutopilotCycle, syncTrackedAssignmentsAndSlots } from "../lib/autopilot";
import { sendTelegramMessage } from "../lib/telegram";

const router: IRouter = Router();
const DEFAULT_PROFILE_ID = "default";
const DEFAULT_SETTINGS_ID = "default";
const APPLICATION_LIMIT = 15;

function toIssueView(
  issue: LiveIssue,
  profile: { skills: string[]; repositories: string[] },
) {
  const isAssigned =
    Boolean(issue.assignedApplicant?.gitHubUsername) ||
    Boolean(issue.assignees?.length);

  const match = calculateMatchScore(
    issue,
    profile.skills || [],
    profile.repositories || [],
  );

  return {
    id: issue.id,
    title: issue.title,
    repository:
      issue.repo?.gitHubRepoFullName ||
      issue.repo?.gitHubRepoName ||
      "Unknown repository",
    organization:
      issue.repo?.org?.gitHubOrgLogin ||
      issue.repo?.gitHubRepoFullName?.split("/")[0] ||
      "Unknown organization",
    url: issueUrl(issue),
    points: pointsForIssue(issue),
    complexity: complexityForIssue(issue),
    status: isAssigned ? ("assigned" as const) : ("open" as const),
    applicants: issue.pendingApplicationsCount ?? 0,
    matchScore: match.matchScore,
    matchedSkills: match.matchedSkills,
    summary: (issue.body ?? "No issue summary provided.")
      .replace(/[#*_`]/g, "")
      .replace(/\s+/g, " ")
      .slice(0, 300),
    updatedAt: issue.updatedAt,
    assignedUsername: issue.assignedApplicant?.gitHubUsername ?? null,
  };
}

export const DEFAULT_SKILLS = [
  "TypeScript",
  "JavaScript",
  "Rust",
  "Python",
  "Node.js",
  "React",
  "Stellar",
  "Soroban",
  "Smart Contracts",
  "Web3",
  "Decentralized Identity",
  "Gemini API",
  "Autonomous Agents",
  "AI Engineering",
  "PostgreSQL",
  "Drizzle ORM",
  "Docker",
  "Telegram Bots",
  "Remotion",
  "Vite",
  "Next.js",
  "REST APIs",
  "Git",
  "Testing",
];

export const DEFAULT_REPOSITORIES = [
  "stellar/soroban-sdk",
  "stellar/stellar-sdk",
  "stellar/rs-soroban-env",
  "drip-network/wave",
];

export const DEFAULT_BIO =
  "Full-stack and Web3 engineer specializing in TypeScript, Rust, Stellar Soroban smart contracts, autonomous agents, and scalable APIs.";

async function ensureSeedData(): Promise<void> {
  const [profile] = await db
    .select()
    .from(contributorProfilesTable)
    .where(eq(contributorProfilesTable.id, DEFAULT_PROFILE_ID));

  if (!profile) {
    await db.insert(contributorProfilesTable).values({
      id: DEFAULT_PROFILE_ID,
      name: "Admuad",
      githubUsername: "Admuad",
      skills: DEFAULT_SKILLS,
      repositories: DEFAULT_REPOSITORIES,
      minPoints: 100,
      maxOrganizationApplications: 4,
      stellarWallet: "",
      bio: DEFAULT_BIO,
      pitchTemplate: "",
    });
  } else if (!profile.skills || profile.skills.length <= 6 || profile.name === "Contributor") {
    await db
      .update(contributorProfilesTable)
      .set({
        skills: DEFAULT_SKILLS,
        repositories: profile.repositories?.length ? profile.repositories : DEFAULT_REPOSITORIES,
        bio: profile.bio || DEFAULT_BIO,
        name: profile.name === "Contributor" ? "Admuad" : profile.name,
        githubUsername: profile.githubUsername === "Contributor" || !profile.githubUsername ? "Admuad" : profile.githubUsername,
      })
      .where(eq(contributorProfilesTable.id, DEFAULT_PROFILE_ID));
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
      autopilotEnabled: "false",
      autopilotIntervalMinutes: 3,
      aiProvider: "gemini",
      aiModel: "gemini-2.5-flash",
    });
  }
}

export async function syncDripWaveProfile(
  explicitToken?: string | null,
): Promise<void> {
  await ensureSeedData();
  const [settings] = await db
    .select()
    .from(notificationSettingsTable)
    .where(eq(notificationSettingsTable.id, DEFAULT_SETTINGS_ID));

  const token = explicitToken || settings?.dripsAuthToken;
  if (!token) return;

  const { profile, applications } = await fetchUserDripWaveData(token);
  if (!profile) return;

  const [currentProfile] = await db
    .select()
    .from(contributorProfilesTable)
    .where(eq(contributorProfilesTable.id, DEFAULT_PROFILE_ID));

  const updateData: Partial<typeof contributorProfilesTable.$inferInsert> = {};
  if (
    profile.name &&
    (!currentProfile?.name || currentProfile.name === "Contributor")
  ) {
    updateData.name = profile.name;
  }
  if (profile.githubUsername) {
    updateData.githubUsername = profile.githubUsername;
  }

  if (Object.keys(updateData).length > 0) {
    await db
      .update(contributorProfilesTable)
      .set(updateData)
      .where(eq(contributorProfilesTable.id, DEFAULT_PROFILE_ID));
  }

  // Remove mock/dummy applications that don't match live DripWave issues
  const liveIssues = await fetchLiveIssues();
  const liveIssueIds = new Set(liveIssues.map((i) => i.id));

  const existingApps = await db.select().from(waveApplicationsTable);
  for (const app of existingApps) {
    if (!liveIssueIds.has(app.issueId)) {
      await db
        .delete(waveApplicationsTable)
        .where(eq(waveApplicationsTable.id, app.id));
    }
  }

  // Sync real applications
  for (const app of applications) {
    const [existing] = await db
      .select()
      .from(waveApplicationsTable)
      .where(eq(waveApplicationsTable.issueId, app.issueId));

    if (existing) {
      await db
        .update(waveApplicationsTable)
        .set({
          status: app.status,
          assignedAt: app.assignedAt
            ? new Date(app.assignedAt)
            : existing.assignedAt,
        })
        .where(eq(waveApplicationsTable.id, existing.id));
    } else {
      await db.insert(waveApplicationsTable).values({
        id: randomUUID(),
        issueId: app.issueId,
        issueTitle: app.issueTitle,
        repository: app.repository,
        status: app.status,
        proposalText: app.pitch || "Application synced from DripWave",
        appliedAt: new Date(app.appliedAt),
        assignedAt: app.assignedAt ? new Date(app.assignedAt) : null,
      });
    }
  }
}

function boolFromText(value?: string | null): boolean {
  return value === "true";
}

function iso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

// GET /wave/overview
router.get("/wave/overview", async (_req, res): Promise<void> => {
  await ensureSeedData();
  const [profile] = await db
    .select()
    .from(contributorProfilesTable)
    .where(eq(contributorProfilesTable.id, DEFAULT_PROFILE_ID));

  const [settings] = await db
    .select()
    .from(notificationSettingsTable)
    .where(eq(notificationSettingsTable.id, DEFAULT_SETTINGS_ID));

  // Auto-sync profile name and username from token if not yet synced
  if (
    settings?.dripsAuthToken &&
    (!profile?.githubUsername || profile.name === "Contributor")
  ) {
    await syncDripWaveProfile(settings.dripsAuthToken);
  }

  const liveIssues = await fetchLiveIssues();
  await syncTrackedAssignmentsAndSlots(
    liveIssues,
    profile?.githubUsername ?? "",
    settings,
  );

  const activeWave = await fetchLiveWave();
  const pendingApplications = await db
    .select({ id: waveApplicationsTable.id })
    .from(waveApplicationsTable)
    .where(eq(waveApplicationsTable.status, "pending"));

  const openIssues = liveIssues.filter((issue) => isTrulyOpenIssue(issue));

  const assignments = await db
    .select({ id: waveApplicationsTable.id })
    .from(waveApplicationsTable)
    .where(eq(waveApplicationsTable.status, "assigned"));

  const pendingCount = pendingApplications.length;

  res.json(
    GetWaveOverviewResponse.parse({
      programName: "Stellar",
      waveLabel: activeWave ? `Wave ${activeWave.waveNumber}` : "Stellar Wave",
      rewardBudget: activeWave
        ? `$${Number(activeWave.budgetUSD).toLocaleString()}`
        : "$100,000",
      pendingApplications: pendingCount,
      applicationLimit: APPLICATION_LIMIT,
      availableSlots: Math.max(0, APPLICATION_LIMIT - pendingCount),
      openIssueCount: openIssues.length,
      lastSyncedAt: new Date().toISOString(),
      nextWaveEndsAt: activeWave?.endDate ?? new Date().toISOString(),
      assignmentCount: assignments.length,
      autopilotEnabled: boolFromText(settings?.autopilotEnabled),
      lastAutopilotStatus: settings?.lastAutopilotStatus ?? null,
      lastAutopilotRunAt: iso(settings?.lastAutopilotRunAt),
    }),
  );
});

// GET /wave/issues
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

  // Strict unassigned filtering when onlyOpen is true
  let issues = liveIssues
    .filter((issue) => (!onlyOpen ? true : isTrulyOpenIssue(issue)))
    .map((issue) =>
      toIssueView(issue, {
        skills: profile?.skills ?? [],
        repositories: profile?.repositories ?? [],
      }),
    );

  if (query) {
    const needle = query.toLowerCase();
    issues = issues.filter(
      (issue) =>
        issue.title.toLowerCase().includes(needle) ||
        issue.repository.toLowerCase().includes(needle) ||
        issue.organization.toLowerCase().includes(needle) ||
        issue.matchedSkills.some((s) => s.toLowerCase().includes(needle)),
    );
  }

  if (sort === "points") {
    issues = [...issues].sort((a, b) => b.points - a.points);
  } else if (sort === "newest") {
    issues = [...issues].sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
    );
  } else {
    // "match"
    issues = [...issues].sort(
      (a, b) =>
        b.matchScore - a.matchScore ||
        b.matchedSkills.length - a.matchedSkills.length ||
        b.points - a.points,
    );
  }

  res.json(GetWaveIssuesResponse.parse(issues));
});

// GET /wave/activity
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

// GET /wave/applications
router.get("/wave/applications", async (_req, res): Promise<void> => {
  await ensureSeedData();
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

// POST /wave/applications
router.post("/wave/applications", async (req, res): Promise<void> => {
  await ensureSeedData();
  const parsed = CreateWaveApplicationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [profile] = await db
    .select()
    .from(contributorProfilesTable)
    .where(eq(contributorProfilesTable.id, DEFAULT_PROFILE_ID));

  const [settings] = await db
    .select()
    .from(notificationSettingsTable)
    .where(eq(notificationSettingsTable.id, DEFAULT_SETTINGS_ID));

  let finalProposal = parsed.data.proposalText;

  // Auto-generate proposal if not supplied
  if (!finalProposal) {
    const proposalResult = await generateAiProposal(
      {
        issueTitle: parsed.data.issueTitle,
        issueSummary: parsed.data.issueTitle,
        repository: parsed.data.repository,
        contributorName: profile?.name,
        githubUsername: profile?.githubUsername,
        skills: profile?.skills,
        bio: profile?.bio,
        stellarWallet: profile?.stellarWallet,
        pitchTemplate: profile?.pitchTemplate,
      },
      {
        apiKey: settings?.aiApiKey,
        provider: settings?.aiProvider ?? "gemini",
        model: settings?.aiModel ?? "gemini-2.5-flash",
      },
    );
    finalProposal = proposalResult.proposal;
  }

  // Submit to DripWave if requested or if token is present
  if (parsed.data.autoSubmitToDrips && settings?.dripsAuthToken) {
    const submitResult = await submitApplicationToDrips({
      issueId: parsed.data.issueId,
      pitch: finalProposal,
      dripsAuthToken: settings.dripsAuthToken,
      stellarWallet: profile?.stellarWallet,
      githubUsername: profile?.githubUsername,
    });

    if (!submitResult.success) {
      res.status(400).json({
        error: `DripWave API Submission Failed: ${submitResult.message}`,
      });
      return;
    }
  }

  const [application] = await db
    .insert(waveApplicationsTable)
    .values({
      id: randomUUID(),
      issueId: parsed.data.issueId,
      issueTitle: parsed.data.issueTitle,
      repository: parsed.data.repository,
      status: parsed.data.status ?? "pending",
      proposalText: finalProposal,
    })
    .returning();

  await db.insert(activityEntriesTable).values({
    id: randomUUID(),
    type: "application",
    title: `Applied to ${parsed.data.issueTitle.slice(0, 45)}…`,
    description: `Application tracked for ${parsed.data.repository}.`,
    createdAt: new Date(),
  });

  const response = CreateWaveApplicationResponse.parse({
    ...application,
    appliedAt: application.appliedAt.toISOString(),
    assignedAt: iso(application.assignedAt),
  });

  res.status(201).json(response);
});

// POST /wave/autopilot/run (and GET support for UptimeRobot / Cron triggers)
router.all(["/wave/autopilot/run", "/wave/cron"], async (_req, res): Promise<void> => {
  const result = await runAutopilotCycle(true);
  res.json(RunAutopilotNowResponse.parse(result));
});

// POST /wave/proposals/generate
router.post("/wave/proposals/generate", async (req, res): Promise<void> => {
  const parsed = GenerateProposalBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [profile] = await db
    .select()
    .from(contributorProfilesTable)
    .where(eq(contributorProfilesTable.id, DEFAULT_PROFILE_ID));

  const [settings] = await db
    .select()
    .from(notificationSettingsTable)
    .where(eq(notificationSettingsTable.id, DEFAULT_SETTINGS_ID));

  const proposalResult = await generateAiProposal(
    {
      issueTitle: parsed.data.issueTitle,
      issueSummary: parsed.data.issueSummary,
      repository: parsed.data.repository,
      complexity: parsed.data.complexity,
      points: parsed.data.points,
      contributorName: profile?.name,
      githubUsername: profile?.githubUsername,
      skills: profile?.skills,
      bio: profile?.bio,
      stellarWallet: profile?.stellarWallet,
      pitchTemplate: profile?.pitchTemplate,
    },
    {
      apiKey: settings?.aiApiKey,
      provider: settings?.aiProvider ?? "gemini",
      model: settings?.aiModel ?? "gemini-2.5-flash",
    },
  );

  res.json(GenerateProposalResponse.parse(proposalResult));
});

// GET /profile
router.get("/profile", async (_req, res): Promise<void> => {
  await ensureSeedData();
  const [profile] = await db
    .select()
    .from(contributorProfilesTable)
    .where(eq(contributorProfilesTable.id, DEFAULT_PROFILE_ID));

  res.json(GetContributorProfileResponse.parse(profile));
});

// POST /profile/reset-defaults
router.post("/profile/reset-defaults", async (_req, res): Promise<void> => {
  await ensureSeedData();
  const [profile] = await db
    .update(contributorProfilesTable)
    .set({
      name: "Admuad",
      githubUsername: "Admuad",
      skills: DEFAULT_SKILLS,
      repositories: DEFAULT_REPOSITORIES,
      minPoints: 100,
      maxOrganizationApplications: 4,
      bio: DEFAULT_BIO,
      pitchTemplate: "",
    })
    .where(eq(contributorProfilesTable.id, DEFAULT_PROFILE_ID))
    .returning();

  res.json(GetContributorProfileResponse.parse(profile));
});

// PUT /profile
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

// GET /notifications
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
      autopilotEnabled: boolFromText(settings.autopilotEnabled),
      autopilotIntervalMinutes: settings.autopilotIntervalMinutes ?? 3,
      aiProvider: settings.aiProvider ?? "gemini",
      aiModel: settings.aiModel ?? "gemini-2.5-flash",
      lastAutopilotRunAt: iso(settings.lastAutopilotRunAt),
      lastNotifiedAt: iso(settings.lastNotifiedAt),
    }),
  );
});

// PUT /notifications
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
      telegramBotToken: parsed.data.telegramBotToken ?? null,
      dripsAuthToken: parsed.data.dripsAuthToken ?? null,
      aiApiKey: parsed.data.aiApiKey ?? null,
      aiProvider: parsed.data.aiProvider ?? "gemini",
      aiModel: parsed.data.aiModel ?? "gemini-2.5-flash",
      autopilotEnabled: String(parsed.data.autopilotEnabled ?? false),
      autopilotIntervalMinutes: parsed.data.autopilotIntervalMinutes ?? 3,
    })
    .where(eq(notificationSettingsTable.id, DEFAULT_SETTINGS_ID))
    .returning();

  // Auto-sync profile with DripWave when token is saved or updated
  if (parsed.data.dripsAuthToken) {
    try {
      await syncDripWaveProfile(parsed.data.dripsAuthToken);
    } catch (err) {
      console.warn("DripWave token sync error:", err);
    }
  }

  res.json(
    UpdateNotificationSettingsResponse.parse({
      ...settings,
      telegramEnabled: boolFromText(settings.telegramEnabled),
      assignmentAlertsEnabled: boolFromText(settings.assignmentAlertsEnabled),
      autopilotEnabled: boolFromText(settings.autopilotEnabled),
      autopilotIntervalMinutes: settings.autopilotIntervalMinutes ?? 3,
      aiProvider: settings.aiProvider ?? "gemini",
      aiModel: settings.aiModel ?? "gemini-2.5-flash",
      lastAutopilotRunAt: iso(settings.lastAutopilotRunAt),
      lastNotifiedAt: iso(settings.lastNotifiedAt),
    }),
  );
});

// POST /wave/sync
router.post("/wave/sync", async (_req, res): Promise<void> => {
  await syncDripWaveProfile();
  const [profile] = await db
    .select()
    .from(contributorProfilesTable)
    .where(eq(contributorProfilesTable.id, DEFAULT_PROFILE_ID));

  const applications = await db
    .select()
    .from(waveApplicationsTable)
    .orderBy(desc(waveApplicationsTable.appliedAt));

  res.json({
    success: true,
    message: `Synced with DripWave account @${profile?.githubUsername || profile?.name}`,
    profile,
    applications,
  });
});

// DELETE /wave/applications/:id
router.delete("/wave/applications/:id", async (req, res): Promise<void> => {
  const { id } = req.params;
  await db
    .delete(waveApplicationsTable)
    .where(eq(waveApplicationsTable.id, id));

  res.json({ success: true, message: "Application removed from tracking." });
});

// POST /notifications/test
router.post("/notifications/test", async (req, res): Promise<void> => {
  const parsed = TestNotificationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [settings] = await db
    .select()
    .from(notificationSettingsTable)
    .where(eq(notificationSettingsTable.id, DEFAULT_SETTINGS_ID));

  const botToken = parsed.data.botToken || settings?.telegramBotToken;

  const result = await sendTelegramMessage(
    parsed.data.chatId,
    `🚀 <b>Wave Assistant Connected!</b>\n\nTelegram assignment notifications are active and operational. You will be alerted the moment you are assigned a DripWave bounty issue.`,
    botToken,
  );

  if (!result.success) {
    res.status(503).json(
      TestNotificationResponse.parse({
        sent: false,
        message: result.error || "Telegram rejected the message. Check Chat ID and Bot Token.",
      }),
    );
    return;
  }

  res.json(
    TestNotificationResponse.parse({
      sent: true,
      message: "Test message delivered successfully to Telegram! 🎯",
    }),
  );
});

export default router;