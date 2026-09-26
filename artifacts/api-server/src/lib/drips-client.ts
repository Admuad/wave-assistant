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

export interface DripWaveUserPayload {
  sub?: string;
  name?: string;
  email?: string;
  picture?: string;
  githubUsername?: string;
  signUpDate?: string;
  exp?: number;
}

export interface ParsedDripWaveSession {
  jwt: string;
  refreshToken: string | null;
  cookieHeader: string;
  user: DripWaveUserPayload | null;
  expiresAt: number | null;
  isExpired: boolean;
  canAutoRefresh: boolean;
}

export function parseDripWaveToken(rawToken: string): ParsedDripWaveSession {
  const trimmed = rawToken.trim();
  let jwt = trimmed;
  let refreshToken: string | null = null;

  // Extract wave_access_token if present in cookie format
  if (trimmed.includes("wave_access_token=")) {
    const match = trimmed.match(/wave_access_token=([^;]+)/);
    if (match) {
      jwt = match[1].trim();
    }
  }

  // Extract wave_refresh_token if present
  if (trimmed.includes("wave_refresh_token=")) {
    const match = trimmed.match(/wave_refresh_token=([^;]+)/);
    if (match) {
      refreshToken = match[1].trim();
    }
  }

  if (jwt.startsWith("Bearer ")) {
    jwt = jwt.replace(/^Bearer\s+/i, "").trim();
  }

  let user: DripWaveUserPayload | null = null;
  let expiresAt: number | null = null;
  let isExpired = false;

  try {
    const parts = jwt.split(".");
    if (parts.length >= 2) {
      const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
      const jsonStr = Buffer.from(base64, "base64").toString("utf-8");
      const parsed = JSON.parse(jsonStr);
      expiresAt = typeof parsed.exp === "number" ? parsed.exp * 1000 : null;
      isExpired = Boolean(expiresAt && Date.now() >= expiresAt - 60000); // 1-minute buffer

      user = {
        sub: parsed.sub,
        name: parsed.name,
        email: parsed.email,
        picture: parsed.picture,
        githubUsername:
          parsed.name ||
          (parsed.picture?.includes("/u/") ? parsed.name : undefined),
        signUpDate: parsed.signUpDate,
        exp: parsed.exp,
      };
    }
  } catch (err) {
    console.warn("Could not parse JWT payload from token:", err);
  }

  let cookieHeader = trimmed;
  if (!cookieHeader.includes("=")) {
    cookieHeader = `wave_access_token=${jwt}${
      refreshToken ? `; wave_refresh_token=${refreshToken}` : ""
    }`;
  }

  return {
    jwt,
    refreshToken,
    cookieHeader,
    user,
    expiresAt,
    isExpired,
    canAutoRefresh: Boolean(refreshToken),
  };
}

/**
 * Automatically refresh a short-lived DripWave access token using the long-lived refresh token.
 */
export async function refreshDripWaveToken(
  refreshToken: string,
): Promise<{ success: boolean; newJwt?: string; newCookie?: string; error?: string }> {
  try {
    const res = await fetch(
      "https://wave-api.drips.network/api/auth/token/refresh",
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Cookie: `wave_refresh_token=${refreshToken}`,
          Origin: "https://www.drips.network",
          Referer: "https://www.drips.network/wave/stellar",
          "User-Agent": "WaveAssistant/1.0",
        },
      },
    );

    const setCookies = res.headers.get("set-cookie") || "";
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;

    if (res.ok) {
      let newJwt = "";
      if (setCookies.includes("wave_access_token=")) {
        const match = setCookies.match(/wave_access_token=([^;]+)/);
        if (match) newJwt = match[1].trim();
      }
      if (!newJwt && typeof body.accessToken === "string") {
        newJwt = body.accessToken;
      }
      if (!newJwt && typeof body.token === "string") {
        newJwt = body.token;
      }

      const newCookie = `wave_access_token=${newJwt || ""}; wave_refresh_token=${refreshToken}`;
      return {
        success: true,
        newJwt: newJwt || undefined,
        newCookie,
      };
    }

    return {
      success: false,
      error:
        (body.error as string) ||
        (body.message as string) ||
        `Refresh failed with HTTP ${res.status}`,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { success: false, error: msg };
  }
}

/**
 * Returns active, authenticated headers for DripWave API requests, auto-refreshing if expired.
 */
export async function getValidDripWaveHeaders(
  rawToken: string,
  onTokenRefreshed?: (newCookie: string) => Promise<void> | void,
): Promise<{
  headers: Record<string, string>;
  user: DripWaveUserPayload | null;
  isValid: boolean;
  error?: string;
}> {
  let session = parseDripWaveToken(rawToken);

  if (session.isExpired && session.refreshToken) {
    console.log("DripWave token is expired. Auto-refreshing via refresh token...");
    const refreshResult = await refreshDripWaveToken(session.refreshToken);
    if (refreshResult.success && refreshResult.newCookie) {
      session = parseDripWaveToken(refreshResult.newCookie);
      if (onTokenRefreshed) {
        await onTokenRefreshed(refreshResult.newCookie);
      }
    }
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json",
    Authorization: `Bearer ${session.jwt}`,
    Cookie: session.cookieHeader,
    "User-Agent": "WaveAssistant/1.0",
    Origin: "https://www.drips.network",
    Referer: "https://www.drips.network/wave/stellar",
  };

  return {
    headers,
    user: session.user,
    isValid: !session.isExpired,
  };
}

export interface SubmitApplicationParams {
  issueId: string;
  pitch: string;
  dripsAuthToken?: string | null;
  stellarWallet?: string | null;
  githubUsername?: string | null;
  onTokenRefreshed?: (newCookie: string) => Promise<void> | void;
}

export async function submitApplicationToDrips(
  params: SubmitApplicationParams,
): Promise<{ success: boolean; message: string; applicationId?: string }> {
  const rawToken = params.dripsAuthToken || process.env.DRIPS_AUTH_TOKEN;

  if (!rawToken) {
    return {
      success: false,
      message:
        "No Drips auth token provided. Add your token or cookie in Settings to enable automated submissions.",
    };
  }

  const { headers, isValid } = await getValidDripWaveHeaders(
    rawToken,
    params.onTokenRefreshed,
  );

  const endpoint = `https://wave-api.drips.network/api/issues/${params.issueId}/applications`;

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

    const errorMsg =
      (body as { message?: string; error?: string })?.error ||
      (body as { message?: string })?.message ||
      `DripWave rejected application with HTTP ${response.status}`;

    return {
      success: false,
      message: errorMsg,
    };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      message: `Network error submitting application: ${errorMsg}`,
    };
  }
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

export async function fetchUserDripWaveData(
  rawToken: string,
  onTokenRefreshed?: (newCookie: string) => Promise<void> | void,
): Promise<{
  profile: DripWaveUserPayload | null;
  applications: DripWaveUserApplication[];
}> {
  const { headers, user } = await getValidDripWaveHeaders(
    rawToken,
    onTokenRefreshed,
  );

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

