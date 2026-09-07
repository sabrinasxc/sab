function decodeBase64Url(value?: string) {
  if (!value) return "";
  return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

export function header(message: any, name: string) {
  return message.payload?.headers?.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
}

function collectParts(part: any, type: string): string[] {
  const values: string[] = [];
  if (part?.mimeType === type && part.body?.data) values.push(decodeBase64Url(part.body.data));
  for (const child of part?.parts ?? []) values.push(...collectParts(child, type));
  return values;
}

export function parseGmailMessage(message: any) {
  const text = collectParts(message.payload, "text/plain").join("\n").trim();
  const html = collectParts(message.payload, "text/html").join("\n").trim();
  const fallback = message.payload?.body?.data ? decodeBase64Url(message.payload.body.data) : "";
  return {
    providerMessageId: message.id as string,
    providerThreadId: message.threadId as string,
    from: header(message, "From"),
    to: header(message, "To").split(",").map((v: string) => v.trim()).filter(Boolean),
    cc: header(message, "Cc").split(",").map((v: string) => v.trim()).filter(Boolean),
    subject: header(message, "Subject"),
    messageIdHeader: header(message, "Message-ID"),
    references: header(message, "References"),
    bodyText: text || (!html ? fallback : ""),
    bodyHtml: html || null,
    internalDate: message.internalDate ? new Date(Number(message.internalDate)).toISOString() : new Date().toISOString(),
    labelIds: message.labelIds ?? [],
  };
}
