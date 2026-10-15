// "Se svar" på Har svaret: HQ gemmer kun et 600-tegns uddrag, så linket åbner Gmail-søgningen i den indbakke, hvor svaret
// ligger. Intet hentes eller gemmes.

/** `lead_reply.account` for svar der ligger i den gamle postkasse (ikke Kinly-indbakkerne). Sættes af hånd i DB'en. */
export const OLD_MAILBOX = "gammel";

export function gmailRepliesUrl(email: string, owner: string, me: "lucas" | "charlie"): string {
  const search = `#search/${encodeURIComponent(`from:${email.trim()}`)}`;
  // Gammel postkasse: ingen authuser, så Gmail åbner den konto Lucas er logget ind på som standard.
  if (owner === OLD_MAILBOX) return `https://mail.google.com/mail/${search}`;
  const box = owner === "lucas" || owner === "charlie" ? owner : me;
  return `https://mail.google.com/mail/?authuser=${box}@kinly.dk${search}`;
}
