export type EmailProviderType = "google_smtp";

export type EmailAuth = {
  username: string;
  password: string;
};

export type EmailSendRequest = {
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  text: string;
};

export type EmailSendResult = {
  messageId: string;
  accepted: string[];
  rejected: string[];
  response?: string;
};

export interface EmailProvider {
  send(request: EmailSendRequest, auth: EmailAuth): Promise<EmailSendResult>;
}
