export const LIVE_WAVE_PROGRAM_ID = "fdc01c95-806f-4b6a-998b-a6ed37e0d81b";
export const LIVE_ISSUES_URL = `https://wave-api.drips.network/api/issues?limit=100&waveProgramId=${LIVE_WAVE_PROGRAM_ID}&state=open&sortBy=updatedAt`;
export const LIVE_WAVES_URL = `https://wave-api.drips.network/api/wave-programs/${LIVE_WAVE_PROGRAM_ID}/waves?limit=100`;

export interface LiveIssue {
  id: string;
  title: string;
  body?: string | null;
  state: string;
  assignees?: Array<{ login?: string; id?: number }>;
  assignedApplicant?: {
    id?: string;
    gitHubUsername?: string | null;
    gitHubName?: string | null;
    dueDate?: string | null;
  } | null;
  labels?: Array<{ name?: string; color?: string }>;
  repo?: {
    id?: string;
    gitHubRepoName?: string;
    gitHubRepoFullName?: string;
    gitHubRepoUrl?: string;
    org?: { gitHubOrgLogin?: string };
  };
  updatedAt: string;
  createdAt?: string;
  points?: number | null;
  complexity?: string | null;
  pendingApplicationsCount?: number | null;
  gitHubIssueNumber?: number | null;
  completedAt?: string | null;
  resolvedInWave?: string | null;
  prLink?: string | null;
}

export interface LiveWave {
  waveNumber: number;
  endDate: string;
  budgetUSD: string;
  status: string;
}

export async function fetchLiveIssues(): Promise<LiveIssue[]> {
  try {
    const response = await fetch(LIVE_ISSUES_URL, {
      headers: {
        Accept: "application/json",
        "User-Agent": "WaveAssistant/1.0",
      },
    });
    if (!response.ok) {
      throw new Error(`Drips issue feed returned HTTP ${response.status}`);
    }
    const payload = (await response.json()) as { data?: LiveIssue[] };
    return payload.data ?? [];
  } catch (err) {
    console.error("Failed to fetch live DripWave issues:", err);
    return [];
  }
}

export async function fetchLiveWave(): Promise<LiveWave | null> {
  try {
    const response = await fetch(LIVE_WAVES_URL, {
      headers: {
        Accept: "application/json",
        "User-Agent": "WaveAssistant/1.0",
      },
    });
    if (!response.ok) {
      throw new Error(`Drips wave feed returned HTTP ${response.status}`);
    }
    const payload = (await response.json()) as { data?: LiveWave[] };
    return payload.data?.find((wave) => wave.status === "active") ?? null;
  } catch (err) {
    console.error("Failed to fetch live wave details:", err);
    return null;
  }
}

/**
 * Strict verification that an issue is truly unassigned and open on DripWave.
 */
export function isTrulyOpenIssue(issue: LiveIssue): boolean {
  if (issue.state !== "open") return false;
  
  // Has assigned applicant
  if (issue.assignedApplicant && issue.assignedApplicant.gitHubUsername) {
    return false;
  }
  
  // Has assignees on GitHub
  if (issue.assignees && issue.assignees.length > 0) {
    return false;
  }

  // Already completed or PR attached
  if (issue.completedAt || issue.resolvedInWave || issue.prLink) {
    return false;
  }

  return true;
}

export function pointsForIssue(issue: LiveIssue): number {
  if (typeof issue.points === "number" && issue.points > 0) return issue.points;
  if (issue.complexity === "large") return 200;
  if (issue.complexity === "medium") return 150;
  return 100;
}

export function complexityForIssue(issue: LiveIssue): "Trivial" | "Medium" | "High" {
  if (issue.complexity === "large") return "High";
  if (issue.complexity === "medium") return "Medium";
  return "Trivial";
}

export function issueUrl(issue: LiveIssue): string {
  return `https://www.drips.network/wave/stellar/issues/${issue.id}`;
}

export function calculateMatchScore(
  issue: LiveIssue,
  profileSkills: string[],
  profileRepos: string[],
): { matchScore: number; matchedSkills: string[] } {
  const searchable = [
    issue.title,
    issue.body ?? "",
    ...(issue.labels ?? []).map((l) => l.name ?? ""),
    issue.repo?.gitHubRepoFullName ?? "",
    issue.repo?.gitHubRepoName ?? "",
  ]
    .join(" ")
    .toLowerCase();

  const matchedSkills = profileSkills.filter((skill) =>
    searchable.includes(skill.toLowerCase()),
  );

  const matchedRepo = profileRepos.some(
    (repo) =>
      repo.toLowerCase() === issue.repo?.gitHubRepoFullName?.toLowerCase() ||
      repo.toLowerCase() === issue.repo?.gitHubRepoName?.toLowerCase(),
  );

  let score = 45;
  if (matchedSkills.length > 0) {
    score += matchedSkills.length * 15;
  }
  if (matchedRepo) {
    score += 25;
  }

  return {
    matchScore: Math.min(99, Math.max(30, score)),
    matchedSkills: matchedSkills.length ? matchedSkills : ["Open source"],
  };
}

export interface SubmitApplicationParams {
  issueId: string;
  pitch: string;
  dripsAuthToken?: string | null;
  stellarWallet?: string | null;
  githubUsername?: string | null;
}

export async function submitApplicationToDrips(
  params: SubmitApplicationParams,
): Promise<{ success: boolean; message: string; applicationId?: string }> {
  const rawToken = params.dripsAuthToken || process.env.DRIPS_AUTH_TOKEN;

  if (!rawToken) {
    return {
      success: false,
      message:
        "No Drips auth token provided. Add your token in Settings to enable automated API submissions.",
    };
  }

  // Extract JWT whether given as raw JWT, Bearer JWT, or full cookie string
  let jwt = rawToken.trim();
  let cookieHeader = rawToken.trim();

  if (jwt.includes("wave_access_token=")) {
    const match = jwt.match(/wave_access_token=([^;]+)/);
    if (match) {
      jwt = match[1].trim();
    }
  }

  if (jwt.startsWith("Bearer ")) {
    jwt = jwt.replace(/^Bearer\s+/i, "").trim();
  }

  const endpoint = `https://wave-api.drips.network/api/issues/${params.issueId}/applications`;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    Authorization: `Bearer ${jwt}`,
    "User-Agent": "WaveAssistant/1.0",
    Origin: "https://www.drips.network",
    Referer: `https://www.drips.network/wave/stellar/issues/${params.issueId}`,
  };

  // If rawToken had cookie format, include Cookie header as well
  if (cookieHeader.includes("=")) {
    headers["Cookie"] = cookieHeader;
  } else {
    headers["Cookie"] = `wave_access_token=${jwt}`;
  }

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        pitch: params.pitch,
        stellarWallet: params.stellarWallet || undefined,
        estimatedDeliveryDays: 2,
      }),
    });

    const body = await response.json().catch(() => ({}));

    if (response.ok) {
      const appId = (body as { data?: { id?: string } })?.data?.id;
      return {
        success: true,
        message: "Application submitted successfully to DripWave!",
        applicationId: appId,
      };
    }

    return {
      success: false,
      message:
        (body as { message?: string })?.message ||
        `DripWave rejected application with HTTP ${response.status}`,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      message: `Network error submitting application: ${errorMsg}`,
    };
  }
}

export interface DripWaveUserPayload {
  sub?: string;
  name?: string;
  email?: string;
  picture?: string;
  githubUsername?: string;
  signUpDate?: string;
}

export function parseDripWaveToken(rawToken: string): {
  jwt: string;
  cookieHeader: string;
  user: DripWaveUserPayload | null;
} {
  let jwt = rawToken.trim();
  let cookieHeader = rawToken.trim();

  if (jwt.includes("wave_access_token=")) {
    const match = jwt.match(/wave_access_token=([^;]+)/);
    if (match) {
      jwt = match[1].trim();
    }
  }

  if (jwt.startsWith("Bearer ")) {
    jwt = jwt.replace(/^Bearer\s+/i, "").trim();
  }

  let user: DripWaveUserPayload | null = null;
  try {
    const parts = jwt.split(".");
    if (parts.length >= 2) {
      const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
      const jsonStr = Buffer.from(base64, "base64").toString("utf-8");
      const parsed = JSON.parse(jsonStr);
      user = {
        sub: parsed.sub,
        name: parsed.name,
        email: parsed.email,
        picture: parsed.picture,
        githubUsername:
          parsed.name ||
          (parsed.picture?.includes("/u/") ? parsed.name : undefined),
        signUpDate: parsed.signUpDate,
      };
    }
  } catch (err) {
    console.warn("Could not parse JWT payload from token:", err);
  }

  return { jwt, cookieHeader, user };
}

export interface DripWaveUserApplication {
  id?: string;
  issueId: string;
  issueTitle: string;
  repository: string;
  status: "pending" | "assigned" | "rejected";
  pitch?: string;
  appliedAt: string;
  assignedAt?: string | null;
}

export async function fetchUserDripWaveData(rawToken: string): Promise<{
  profile: DripWaveUserPayload | null;
  applications: DripWaveUserApplication[];
}> {
  const { jwt, cookieHeader, user } = parseDripWaveToken(rawToken);
  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: `Bearer ${jwt}`,
    "User-Agent": "WaveAssistant/1.0",
    Origin: "https://www.drips.network",
    Referer: "https://www.drips.network/wave/stellar",
  };
  if (cookieHeader.includes("=")) {
    headers["Cookie"] = cookieHeader;
  } else {
    headers["Cookie"] = `wave_access_token=${jwt}`;
  }

  const applications: DripWaveUserApplication[] = [];
  const username = user?.githubUsername || user?.name || "";

  // Check live issues feed for any issue where user is assigned applicant
  const liveIssues = await fetchLiveIssues();
  if (username) {
    for (const issue of liveIssues) {
      if (
        issue.assignedApplicant?.gitHubUsername?.toLowerCase() ===
        username.toLowerCase()
      ) {
        applications.push({
          id: `drips-${issue.id}`,
          issueId: issue.id,
          issueTitle: issue.title,
          repository:
            issue.repo?.gitHubRepoFullName ||
            issue.repo?.gitHubRepoName ||
            "stellar",
          status: "assigned",
          pitch: "Assigned by DripWave maintainer",
          appliedAt: issue.createdAt || new Date().toISOString(),
          assignedAt:
            issue.assignedApplicant.dueDate || new Date().toISOString(),
        });
      }
    }
  }

  return { profile: user, applications };
}

