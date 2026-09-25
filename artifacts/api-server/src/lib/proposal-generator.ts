export interface ProposalContext {
  issueTitle: string;
  issueSummary: string;
  repository: string;
  complexity?: string;
  points?: number;
  contributorName?: string;
  githubUsername?: string;
  skills?: string[];
  bio?: string | null;
  stellarWallet?: string | null;
  pitchTemplate?: string | null;
}

export interface ProposalAiConfig {
  apiKey?: string | null;
  provider?: "gemini" | "openai" | string;
  model?: string | null;
}

export async function generateAiProposal(
  context: ProposalContext,
  config?: ProposalAiConfig,
): Promise<{ proposal: string; provider: string }> {
  const geminiKey =
    config?.apiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  const openAiKey = config?.apiKey || process.env.OPENAI_API_KEY;
  const preferredProvider = config?.provider || "gemini";

  if (preferredProvider === "gemini" && geminiKey) {
    try {
      const model = config?.model || "gemini-2.5-flash";
      const prompt = buildProposalPrompt(context);
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`;
      
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.6,
            maxOutputTokens: 600,
          },
        }),
      });

      if (res.ok) {
        const data = await res.json() as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        };
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text && text.trim()) {
          return { proposal: text.trim(), provider: `Gemini (${model})` };
        }
      }
    } catch {
      // fallback
    }
  }

  if ((preferredProvider === "openai" || openAiKey) && openAiKey) {
    try {
      const model = config?.model || "gpt-4o-mini";
      const prompt = buildProposalPrompt(context);
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openAiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "system",
              content:
                "You are an expert open-source contributor applying for a bounty issue on DripWave / Stellar Wave. Write a concise, professional, and convincing technical proposal (under 200 words). Include approach, testing strategy, and estimated ETA.",
            },
            { role: "user", content: prompt },
          ],
          temperature: 0.6,
          max_tokens: 500,
        }),
      });

      if (res.ok) {
        const data = await res.json() as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        const text = data.choices?.[0]?.message?.content;
        if (text && text.trim()) {
          return { proposal: text.trim(), provider: `OpenAI (${model})` };
        }
      }
    } catch {
      // fallback
    }
  }

  // Smart deterministic proposal engine
  return {
    proposal: buildTailoredProposal(context),
    provider: "Wave AI Engine",
  };
}

function buildProposalPrompt(context: ProposalContext): string {
  const skillsList = context.skills?.length
    ? context.skills.join(", ")
    : "TypeScript, JavaScript, Rust, Testing";
  const bio = context.bio ? `My background: ${context.bio}` : "";
  const custom = context.pitchTemplate
    ? `Custom instructions: ${context.pitchTemplate}`
    : "";

  return `
Write an application pitch to be assigned this DripWave bounty issue:

Issue Title: ${context.issueTitle}
Repository: ${context.repository}
Complexity: ${context.complexity || "Standard"} (${context.points || 100} points)
Issue Details: ${context.issueSummary}

Applicant Information:
Name/GitHub: ${context.contributorName || context.githubUsername || "Contributor"}
Relevant Skills: ${skillsList}
${bio}
${custom}

Format requirements:
1. Brief technical diagnosis and approach to solving the issue.
2. Verification/testing strategy (unit tests, integration, edge cases).
3. Realistic turnaround timeframe (e.g. 24-48 hours).
Keep it focused, confident, and clean (no generic fluff or buzzwords).
`.trim();
}

function buildTailoredProposal(context: ProposalContext): string {
  const relevantSkills = context.skills?.length
    ? context.skills.slice(0, 3).join(", ")
    : "core architecture and testing";

  return `Hello! I would love to tackle this issue for ${context.repository}.

**Technical Approach:**
- I've reviewed the issue requirements for "${context.issueTitle}".
- I will inspect the relevant module, implement the requested changes cleanly adhering to the existing codebase patterns and style conventions, and ensure zero regressions.

**Testing & Verification:**
- Add comprehensive unit and integration tests covering positive flows and edge cases.
- Run the full project test suite and linters to verify CI cleanliness.

**Relevant Experience & Delivery:**
- Strong background working with ${relevantSkills}.
- Ready to start immediately upon assignment and deliver a clean, well-documented PR within 24-48 hours.`.trim();
}
