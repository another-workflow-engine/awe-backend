import nodemailer, { type SentMessageInfo } from "nodemailer";
import type {
  EmailAuth,
  EmailProvider,
  EmailSendRequest,
  EmailSendResult,
} from "./EmailProvider.js";

function normalizeAddresses(addresses: unknown[]): string[] {
  return addresses.map((address) => {
    if (typeof address === "string") {
      return address;
    }

    if (
      typeof address === "object" &&
      address !== null &&
      "address" in address &&
      typeof (address as { address: unknown }).address === "string"
    ) {
      return (address as { address: string }).address;
    }

    return String(address);
  });
}

export class GoogleSmtpEmailProvider implements EmailProvider {
  async send(request: EmailSendRequest, auth: EmailAuth): Promise<EmailSendResult> {
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      auth: {
        user: auth.username,
        pass: auth.password,
      },
    });

    const info = (await transporter.sendMail({
      from: request.from,
      to: request.to,
      cc: request.cc,
      bcc: request.bcc,
      subject: request.subject,
      text: request.text,
    })) as SentMessageInfo;

    const accepted = Array.isArray(info.accepted)
      ? normalizeAddresses(info.accepted)
      : [];
    const rejected = Array.isArray(info.rejected)
      ? normalizeAddresses(info.rejected)
      : [];

    return {
      messageId: info.messageId ?? "",
      accepted,
      rejected,
      response: typeof info.response === "string" ? info.response : undefined,
    };
  }
}
