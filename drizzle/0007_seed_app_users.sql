-- Idempotent seed af de to brugere. Kører både lokalt og i prod; on conflict
-- do nothing betyder at eksisterende rækker (og deres nye auth-kolonner) ikke røres.
insert into app_user (id, name, email) values
  ('lucas', 'Lucas', 'lucas@kinly.dk'),
  ('charlie', 'Charlie', 'charlie@kinly.dk')
on conflict do nothing;
