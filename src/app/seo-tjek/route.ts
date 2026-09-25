// /seo-tjek på HQ-domænet er udfaset 25/9: den gamle tragt sendte rapport- og
// dag 7-mails automatisk (brud på "udgående = kladder"). Det offentlige SEO-tjek
// bor på kinly.dk og lander som henvendelse i HQ, hvor Lucas/Charlie sender
// rapport-mailen selv. Gamle rapportlinks (/seo-tjek/rapport/<id>) virker stadig.
export function GET() {
  return Response.redirect("https://kinly.dk/seo-tjek/", 308);
}
