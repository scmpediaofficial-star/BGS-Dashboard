-- ════════════════════════════════════════════════════════════════════════════
--  BGS Dashboard · 13 · Institution signatories on certificates
--
--  An institution can name someone to sign its members' certificates: a name,
--  a title and an image of their signature. Without one, the second signature
--  slot on the certificate simply carries the date.
--
--  Safe to run more than once.
-- ════════════════════════════════════════════════════════════════════════════

alter table public.institutions
  add column if not exists signatory_name          text,
  add column if not exists signatory_title         text,
  add column if not exists signatory_signature_url text;
