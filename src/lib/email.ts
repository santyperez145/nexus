import { APP_NAME, APP_URL } from "@/lib/config";

export type MailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

/** Resend HTTP o log en consola si no hay key (dev). */
export async function sendMail(msg: MailMessage): Promise<{ ok: boolean; mode: "resend" | "log" }> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? `${APP_NAME} <onboarding@resend.dev>`;
  if (!key) {
    console.info(`[nexus-mail] to=${msg.to} subject=${msg.subject}\n${msg.text}`);
    return { ok: true, mode: "log" };
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [msg.to],
      subject: msg.subject,
      text: msg.text,
      html: msg.html ?? `<pre style="font-family:sans-serif">${escapeHtml(msg.text)}</pre>`,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`[nexus-mail] resend ${res.status}: ${body}`);
    return { ok: false, mode: "resend" };
  }
  return { ok: true, mode: "resend" };
}

export async function sendPasswordResetEmail(opts: { email: string; name: string; url: string }) {
  const text = [
    `Hola ${opts.name || "ahí"},`,
    "",
    `Pediste restablecer la contraseña de ${APP_NAME}.`,
    `Abrí este enlace (válido ~1 h):`,
    opts.url,
    "",
    `Si no fuiste vos, ignorá este mail.`,
    APP_URL,
  ].join("\n");
  return sendMail({
    to: opts.email,
    subject: `Restablecer contraseña · ${APP_NAME}`,
    text,
  });
}

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
