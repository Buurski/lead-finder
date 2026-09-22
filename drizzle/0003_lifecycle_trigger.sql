-- Livsfasen (funnel/pipeline) udledes af databasen selv ved hver skrivning, så
-- den aldrig halter efter status-ændringer — uanset hvilken kodesti der skriver
-- (motor, send-rute, VPS-leadgen, fletning). Spejler lifecycleFor() i pg/migrate.ts.
CREATE OR REPLACE FUNCTION company_derive_lifecycle() RETURNS trigger AS $$
BEGIN
  -- Flettet er et endeligt, bevidst valg.
  IF NEW.lifecycle = 'flettet' THEN
    RETURN NEW;
  END IF;
  IF NEW.client_no IS NOT NULL AND NOT NEW.client_removed THEN
    NEW.lifecycle := 'kunde';
  ELSIF NEW.client_removed THEN
    NEW.lifecycle := 'tabt';
  ELSIF NEW.archived THEN
    NEW.lifecycle := CASE WHEN NEW.lifecycle IN ('ikke_egnet', 'tabt') THEN NEW.lifecycle ELSE 'ikke_egnet' END;
  ELSIF NEW.lead_status = 'client' THEN
    NEW.lifecycle := 'kunde';
  ELSIF NEW.lead_status = 'interested' THEN
    NEW.lifecycle := 'interesseret';
  ELSIF NEW.lead_status = 'not-interested' THEN
    NEW.lifecycle := 'tabt';
  ELSIF NEW.lead_status = 'skip' OR NEW.lead_status LIKE 'skip-%' THEN
    NEW.lifecycle := 'ikke_egnet';
  ELSIF lower(trim(NEW.email_status)) = 'replied' THEN
    NEW.lifecycle := 'svaret';
  ELSIF NEW.lead_status = 'called' OR NEW.email_sent_at <> '' OR lower(trim(NEW.email_status)) = 'sent' THEN
    NEW.lifecycle := 'kontaktet';
  ELSE
    NEW.lifecycle := 'ny';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER company_lifecycle
BEFORE INSERT OR UPDATE ON company
FOR EACH ROW EXECUTE FUNCTION company_derive_lifecycle();
--> statement-breakpoint
-- Genberegn eksisterende rækker én gang.
UPDATE company SET lifecycle = lifecycle;
