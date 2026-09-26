import { randomUUID } from "node:crypto";
import { desc, eq, inArray } from "drizzle-orm";
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
  isTrulyOpenIssue,
  issueUrl,
  pointsForIssue,
  submitApplicationToDrips,
} from "./drips-client";
import { generateAiProposal } from "./proposal-generator";
import { sendAssignmentAlert } from "./telegram";

const DEFAULT_PROFILE_ID = "default";
const DEFAULT_SETTINGS_ID = "default";
const APPLICATION_LIMIT = 15;

export interface AutopilotCycleResult {
  success: boolean;
  message: string;
  scannedCount: number;
  appliedCount: number;
  activeSlots: number;
}

export async function runAutopilotCycle(force = false): Promise<AutopilotCycleResult> {
  try {
    const [profile] = await db
      .select()
      .from(contributorProfilesTable)
      .where(eq(contributorProfilesTable.id, DEFAULT_PROFILE_ID));

    const [settings] = await db
      .select()
      .from(notificationSettingsTable)
      .where(eq(notificationSettingsTable.id, DEFAULT_SETTINGS_ID));

    const isAutopilotOn = settings?.autopilotEnabled === "true" || force;
    const liveIssues = await fetchLiveIssues();

    // 1. Sync tracked assignments & auto-prune freed slots
    await syncTrackedAssignmentsAndSlots(
      liveIssues,
      profile?.githubUsername ?? "",
      settings,
    );

    // 2. Compute current pending application count
    const pendingApps = await db
      .select({ id: waveApplicationsTable.id, issueId: waveApplicationsTable.issueId })
      .from(waveApplicationsTable)
      .where(eq(waveApplicationsTable.status, "pending"));

    const activeSlots = pendingApps.length;
    const availableSlots = Math.max(0, APPLICATION_LIMIT - activeSlots);
    let appliedCount = 0;

    if (isAutopilotOn && availableSlots > 0 && profile) {
      const existingTrackedIssueIds = new Set(
        (
          await db
            .select({ issueId: waveApplicationsTable.issueId })
            .from(waveApplicationsTable)
            .where(
              inArray(waveApplicationsTable.status, [
                "pending",
                "assigned",
                "resolved",
              ]),
            )
        ).map((a) => a.issueId),
      );

      // Filter truly open issues on DripWave
      const trulyOpenIssues = liveIssues.filter(
        (issue) => isTrulyOpenIssue(issue) && !existingTrackedIssueIds.has(issue.id),
      );

      // Match against contributor profile
      const matchedCandidates = trulyOpenIssues
        .map((issue) => {
          const match = calculateMatchScore(
            issue,
            profile.skills ?? [],
            profile.repositories ?? [],
          );
          const points = pointsForIssue(issue);
          return {
            issue,
            matchScore: match.matchScore,
            matchedSkills: match.matchedSkills,
            points,
            complexity: complexityForIssue(issue),
          };
        })
        .filter((item) => {
          // Requirement: apply to any unassigned open issue with at least one matching skill / keyword
          const hasMatchedSkill =
            item.matchedSkills.length > 0 && item.matchedSkills[0] !== "Open source";
          const meetsMinPoints = item.points >= (profile.minPoints ?? 0);
          return (hasMatchedSkill || item.matchScore >= 60) && meetsMinPoints;
        })
        .sort((a, b) => b.matchScore - a.matchScore || b.points - a.points);

      // Auto-apply up to available slots
      const toApply = matchedCandidates.slice(0, availableSlots);

      for (const item of toApply) {
        try {
          // Generate AI personalized proposal
          const proposalResult = await generateAiProposal(
            {
              issueTitle: item.issue.title,
              issueSummary: item.issue.body || "No summary",
              repository:
                item.issue.repo?.gitHubRepoFullName ||
                item.issue.repo?.gitHubRepoName ||
                "Unknown repo",
              complexity: item.complexity,
              points: item.points,
              contributorName: profile.name,
              githubUsername: profile.githubUsername,
              skills: profile.skills,
              bio: profile.bio,
              stellarWallet: profile.stellarWallet,
              pitchTemplate: profile.pitchTemplate,
            },
            {
              apiKey: settings?.aiApiKey,
              provider: settings?.aiProvider ?? "gemini",
              model: settings?.aiModel ?? "gemini-2.5-flash",
            },
          );

          // Submit to DripWave API if auth token is available
          if (settings?.dripsAuthToken) {
            const submitRes = await submitApplicationToDrips({
              issueId: item.issue.id,
              pitch: proposalResult.proposal,
              dripsAuthToken: settings.dripsAuthToken,
              stellarWallet: profile.stellarWallet,
              githubUsername: profile.githubUsername,
              onTokenRefreshed: async (newCookie) => {
                await db
                  .update(notificationSettingsTable)
                  .set({ dripsAuthToken: newCookie })
                  .where(eq(notificationSettingsTable.id, DEFAULT_SETTINGS_ID));
              },
            });

            if (!submitRes.success) {
              console.warn(
                `Autopilot skipped recording issue ${item.issue.id} because DripWave rejected:`,
                submitRes.message,
              );
              continue;
            }
          }

          const appId = randomUUID();
          const repoName =
            item.issue.repo?.gitHubRepoFullName ||
            item.issue.repo?.gitHubRepoName ||
            "repository";

          await db.insert(waveApplicationsTable).values({
            id: appId,
            issueId: item.issue.id,
            issueTitle: item.issue.title,
            repository: repoName,
            status: "pending",
            proposalText: proposalResult.proposal,
            appliedAt: new Date(),
          });

          await db.insert(activityEntriesTable).values({
            id: randomUUID(),
            type: "application",
            title: `Auto-applied to ${item.issue.title.slice(0, 45)}…`,
            description: `Applied via Auto-Pilot with tailored proposal (${item.points} pts, ${item.matchScore}% match).`,
            createdAt: new Date(),
          });

          appliedCount++;
        } catch (applyErr) {
          console.error(`Error auto-applying to issue ${item.issue.id}:`, applyErr);
        }
      }
    }

    const now = new Date();
    const statusMsg = isAutopilotOn
      ? `Auto-Pilot active: scanned ${liveIssues.length} issues, ${appliedCount} new application(s) submitted. ${activeSlots + appliedCount}/${APPLICATION_LIMIT} slots active.`
      : `Auto-Pilot idle: monitored ${liveIssues.length} issues, ${activeSlots}/${APPLICATION_LIMIT} slots in use.`;

    if (settings) {
      await db
        .update(notificationSettingsTable)
        .set({
          lastAutopilotRunAt: now,
          lastAutopilotStatus: statusMsg,
        })
        .where(eq(notificationSettingsTable.id, DEFAULT_SETTINGS_ID));
    }

    return {
      success: true,
      message: statusMsg,
      scannedCount: liveIssues.length,
      appliedCount,
      activeSlots: activeSlots + appliedCount,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("Autopilot cycle failed:", errorMsg);
    return {
      success: false,
      message: `Autopilot error: ${errorMsg}`,
      scannedCount: 0,
      appliedCount: 0,
      activeSlots: 0,
    };
  }
}

export async function syncTrackedAssignmentsAndSlots(
  liveIssues: Array<any>,
  githubUsername: string,
  settings?: any,
): Promise<void> {
  const trackedPending = await db
    .select()
    .from(waveApplicationsTable)
    .where(eq(waveApplicationsTable.status, "pending"));

  if (trackedPending.length === 0) return;

  for (const application of trackedPending) {
    const issue = liveIssues.find((c) => c.id === application.issueId);
    if (!issue) continue;

    const assignedUsername = issue.assignedApplicant?.gitHubUsername?.toLowerCase();
    const isUserAssigned =
      githubUsername &&
      assignedUsername &&
      assignedUsername === githubUsername.toLowerCase();

    if (isUserAssigned) {
      // User won the bounty spot!
      const assignedAt = new Date();
      await db
        .update(waveApplicationsTable)
        .set({ status: "assigned", assignedAt })
        .where(eq(waveApplicationsTable.id, application.id));

      await db.insert(activityEntriesTable).values({
        id: randomUUID(),
        type: "assignment",
        title: "🎉 You were assigned to an issue!",
        description: `${application.issueTitle} (${application.repository})`,
        createdAt: assignedAt,
      });

      // Send Telegram alert
      if (
        settings?.telegramEnabled === "true" &&
        settings?.assignmentAlertsEnabled === "true" &&
        settings?.telegramChatId
      ) {
        const sent = await sendAssignmentAlert({
          botToken: settings.telegramBotToken,
          chatId: settings.telegramChatId,
          issueTitle: application.issueTitle,
          repository: application.repository,
          issueUrl: issueUrl(issue),
          points: pointsForIssue(issue),
          complexity: complexityForIssue(issue),
        });

        if (sent.success) {
          await db
            .update(notificationSettingsTable)
            .set({ lastNotifiedAt: assignedAt })
            .where(eq(notificationSettingsTable.id, DEFAULT_SETTINGS_ID));
        }
      }
    } else if (
      (issue.assignedApplicant &&
        issue.assignedApplicant.gitHubUsername &&
        issue.assignedApplicant.gitHubUsername.toLowerCase() !==
          githubUsername.toLowerCase()) ||
      issue.state !== "open" ||
      issue.completedAt ||
      issue.resolvedInWave
    ) {
      // Issue was assigned to someone else or closed -> free the slot!
      await db
        .update(waveApplicationsTable)
        .set({ status: "declined" })
        .where(eq(waveApplicationsTable.id, application.id));

      await db.insert(activityEntriesTable).values({
        id: randomUUID(),
        type: "release",
        title: "Application slot freed",
        description: `"${application.issueTitle.slice(0, 40)}…" was assigned to another contributor or closed. Slot is ready for new opportunities.`,
        createdAt: new Date(),
      });
    }
  }
}

let daemonTimer: NodeJS.Timeout | null = null;

export function startAutopilotDaemon(): void {
  if (daemonTimer) return;

  console.log("Starting DripWave Autonomous Assistant background daemon...");

  // Run initial cycle shortly after startup
  setTimeout(() => {
    runAutopilotCycle().catch((err) =>
      console.error("Initial autopilot cycle failed:", err),
    );
  }, 5000);

  // Poll every 60 seconds to check if it's time for the next scheduled run
  daemonTimer = setInterval(async () => {
    try {
      const [settings] = await db
        .select()
        .from(notificationSettingsTable)
        .where(eq(notificationSettingsTable.id, DEFAULT_SETTINGS_ID));

      if (settings?.autopilotEnabled === "true") {
        const intervalMs =
          (settings.autopilotIntervalMinutes || 3) * 60 * 1000;
        const lastRun = settings.lastAutopilotRunAt
          ? new Date(settings.lastAutopilotRunAt).getTime()
          : 0;

        if (Date.now() - lastRun >= intervalMs) {
          await runAutopilotCycle();
        }
      } else {
        // Even if autopilot auto-apply is off, check assignment status every 5 min
        const lastRun = settings?.lastAutopilotRunAt
          ? new Date(settings.lastAutopilotRunAt).getTime()
          : 0;
        if (Date.now() - lastRun >= 5 * 60 * 1000) {
          const [profile] = await db
            .select()
            .from(contributorProfilesTable)
            .where(eq(contributorProfilesTable.id, DEFAULT_PROFILE_ID));
          const live = await fetchLiveIssues();
          await syncTrackedAssignmentsAndSlots(
            live,
            profile?.githubUsername ?? "",
            settings,
          );
        }
      }
    } catch (err) {
      console.error("Autopilot daemon background tick error:", err);
    }
  }, 60000);
}
