// "sending" = reserveret til afsendelse lige før SMTP. Den tæller som sendt i alle
// dublet-/opfølgnings-ledgers: en mail der MÅSKE er gået ud, må aldrig få en tvilling.
export const countsAsSent = (status: string | undefined): boolean => status === "sent" || status === "sending";
