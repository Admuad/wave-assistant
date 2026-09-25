export interface TelegramAlertOptions {
  botToken?: string | null;
  chatId: string;
  issueTitle: string;
  repository: string;
  issueUrl: string;
  points?: number;
  complexity?: string;
}

export async function sendTelegramMessage(
  chatId: string,
  text: string,
  customToken?: string | null,
): Promise<{ success: boolean; error?: string }> {
  const token = customToken || process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return { success: false, error: "Telegram Bot Token is not configured." };
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: false,
      }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        success: false,
        error: (data as { description?: string }).description || `HTTP ${response.status}`,
      };
    }

    return { success: true };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    return { success: false, error: errorMsg };
  }
}

export async function sendAssignmentAlert(
  options: TelegramAlertOptions,
): Promise<{ success: boolean; error?: string }> {
  const pointsStr = options.points ? ` (${options.points} pts)` : "";
  const complexityStr = options.complexity ? ` [${options.complexity}]` : "";
  
  const message = [
    `🎯 <b>DripWave Assignment Alert!</b>`,
    ``,
    `You have been assigned to:`,
    `<b>${escapeHtml(options.issueTitle)}</b>${pointsStr}${complexityStr}`,
    ``,
    `📂 <b>Repository:</b> <code>${escapeHtml(options.repository)}</code>`,
    `🔗 <b>Link:</b> <a href="${options.issueUrl}">Open on Drips</a>`,
    ``,
    `<i>Get ready to start coding and submit your PR before the wave deadline!</i>`,
  ].join("\n");

  return sendTelegramMessage(options.chatId, message, options.botToken);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
