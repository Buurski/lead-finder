// "Se svar" på Har svaret: HQ gemmer ikke svarteksten (sync-replies læser kun afsenderen), så linket
// åbner Gmail-søgningen i ejerens egen Kinly-indbakke, hvor svaret ligger. Intet hentes eller gemmes.
export function gmailRepliesUrl(email: string, owner: string, me: "lucas" | "charlie"): string {
  const box = owner === "lucas" || owner === "charlie" ? owner : me;
  return `https://mail.google.com/mail/?authuser=${box}@kinly.dk#search/${encodeURIComponent(`from:${email.trim()}`)}`;
}
