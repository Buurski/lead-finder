// Standardteksten til det gratis udkast (GratisUdkast). Egen fil uden React, så
// testen kan binde teksten til sendPreview-gaten (preview-send.test.ts): fjernes
// kinly.dk-linjen her, afviser gaten mailen — og testen fejler.
import { KINLY_FRONT } from "../demos.ts";

export interface PreviewBodyInput {
  contactName?: string;
  company: string;
  previewUrl?: string;
}

export function defaultPreviewBody(item: PreviewBodyInput): string {
  const hilsen = item.contactName ? `Hej ${item.contactName},` : "Hej,";
  const link = item.previewUrl ?? "";
  // Link-politikken kræver kinly.dk-forsiden også i det gratis udkast; sendPreview
  // afviser mailen uden den, så standardteksten skal indeholde den.
  return `${hilsen}\n\nTak fordi I spurgte. Her er et første udkast til en ny hjemmeside til ${item.company}:\n${link}\n\nMin egen side: ${KINLY_FRONT}\n\nDet er et udkast — alt kan rettes. Sig til hvad I synes, så tager vi den derfra.`;
}
