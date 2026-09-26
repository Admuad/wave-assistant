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
          const cleanText = cleanPlainTextProposal(text.trim());
          return { proposal: cleanText, provider: `Gemini (${model})` };
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
                "You are an expert open-source contributor applying for a bounty issue on DripWave / Stellar Wave. Write a concise, professional, plain-text technical proposal (under 120 words). DO NOT use markdown formatting like bold stars (**) or markdown headers. Keep it clean plain text with simple paragraphs.",
            },
            { role: "user", content: prompt },
          ],
          temperature: 0.6,
          max_tokens: 400,
        }),
      });

      if (res.ok) {
        const data = (await res.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        const text = data.choices?.[0]?.message?.content;
        if (text && text.trim()) {
          const cleanText = cleanPlainTextProposal(text.trim());
          return { proposal: cleanText, provider: `OpenAI (${model})` };
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

function cleanPlainTextProposal(text: string): string {
  return text
    .replace(/\*\*/g, "")
    .replace(/\*/g, "")
    .replace(/^#+\s+/gm, "")
    .replace(/`/g, "")
    .trim();
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
Write a clean plain-text application pitch to be assigned this DripWave bounty issue:

Issue Title: ${context.issueTitle}
Repository: ${context.repository}
Complexity: ${context.complexity || "Standard"} (${context.points || 100} points)
Issue Details: ${context.issueSummary}

Applicant Information:
Name/GitHub: ${context.contributorName || context.githubUsername || "Contributor"}
Relevant Skills: ${skillsList}
${bio}
${custom}

Formatting rules:
- Plain text only (NO markdown stars **, NO markdown hashtags #, NO bolding).
- 2-3 concise paragraphs:
  1. Technical approach to solving the issue.
  2. Testing and verification plan.
  3. Delivery timeline (24-48 hours).
- Keep it simple, clear, and direct.
`.trim();
}

function buildTailoredProposal(context: ProposalContext): string {
  const relevantSkills = context.skills?.length
    ? context.skills.slice(0, 3).join(", ")
    : "TypeScript and smart contract testing";

  return `Hi! I would like to work on this issue for ${context.repository}.

Technical Approach:
I have reviewed the requirements for "${context.issueTitle}". I will locate the relevant module, implement the changes cleanly adhering to the project's architecture and coding standards, and ensure zero regressions.

Testing & Verification:
I will add comprehensive unit and integration test coverage for the changes and verify that the full CI test suite passes cleanly.

Experience & Turnaround:
I have hands-on experience in ${relevantSkills}. I can begin immediately upon assignment and deliver a clean PR within 24 to 48 hours.`.trim();
}
