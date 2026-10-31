import { describe, expect, it, vi } from "vitest";

const sendMail = vi.fn();
vi.mock("nodemailer", () => ({ createTransport: vi.fn(() => ({ sendMail })) }));

import { createTransport } from "nodemailer";

import { MailService } from "./mail.service";

function service(
  mail: { from: string; smtp?: { host: string; port: number; user: string; pass: string } },
  resendKey?: string,
) {
  const config = {
    get: (key: string) => (key === "mail" ? mail : { resend: { apiKey: resendKey } }),
  };
  return new MailService(config as never);
}

describe("MailService", () => {
  it("is a no-op with nothing configured", async () => {
    const svc = service({ from: "x" });
    expect(svc.provider).toBe("none");
    expect(await svc.send({ to: "a@b.c", subject: "s", html: "h" })).toEqual({ sent: false });
  });

  it("sends through the cPanel mailbox over SMTP first (TLS on 465)", async () => {
    sendMail.mockResolvedValueOnce({ messageId: "m1" });
    const svc = service(
      {
        from: "NV Marketing <nvmarketing@nvcorx.com>",
        smtp: { host: "mail.nvcorx.com", port: 465, user: "nvmarketing@nvcorx.com", pass: "p" },
      },
      "re_key",
    );
    expect(svc.provider).toBe("smtp");
    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ host: "mail.nvcorx.com", secure: true }),
    );
    const r = await svc.send({ to: "a@b.c", subject: "s", html: "h" });
    expect(r.sent).toBe(true);
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({ from: "NV Marketing <nvmarketing@nvcorx.com>", to: "a@b.c" }),
    );
  });

  it("reports a failed SMTP send instead of throwing", async () => {
    sendMail.mockRejectedValueOnce(new Error("auth failed"));
    const svc = service({ from: "x", smtp: { host: "h", port: 587, user: "u", pass: "p" } });
    expect(await svc.send({ to: "a@b.c", subject: "s", html: "h" })).toEqual({ sent: false });
  });
});
