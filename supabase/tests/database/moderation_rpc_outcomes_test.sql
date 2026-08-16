-- Gli esiti di `public.moderate_site` che la superficie di moderazione traduce in messaggi.
--
-- `pr_0_contract_test.sql` fissa che la RPC esista, che un non-admin venga respinto e che un
-- admin possa sospendere. Qui si fissa la cosa da cui dipende l'interfaccia: **quando la RPC
-- rifiuta, con quale SQLSTATE e con quale messaggio**. Sono le tre coppie che
-- `lib/moderation/outcome.ts` mappa una per una; se cambiassero senza che nessuno se ne
-- accorga, l'applicazione continuerebbe a girare mostrando la frase sbagliata — che è il
-- modo peggiore di sbagliare, perché sembra funzionare.
--
-- Il caso centrale è il primo: `owner-c-review` è in `pending_review` e il suo abbonamento è
-- quello creato dal trigger, cioè `not_started`. Un `approve` su quel sito **deve** essere
-- rifiutato. È lo stato in cui si trova ogni sito nuovo prima che il pagamento sia
-- registrato, quindi è anche il rifiuto che un amministratore incontrerà più spesso.
--
-- I due `lives_ok` in fondo non sono decorazione: senza di loro, un `moderate_site` che
-- fallisse *sempre* — per una migrazione rotta, per un privilegio revocato — renderebbe
-- verdi tutti i casi negativi qui sopra. Sono il controllo che distingue «rifiuta ciò che
-- deve» da «non funziona».

begin;
select plan(15);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);

-- ── Chi non è amministratore non arriva nemmeno alla transizione ────────────────────────
-- Owner A è proprietario di un sito e non è in `public.platform_admins`. La guardia è la
-- prima riga della funzione, quindi risponde 42501 e non 23514: l'ordine conta, perché un
-- 23514 direbbe al chiamante qualcosa sullo stato di un sito che non lo riguarda.
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select throws_ok(
  $$select public.moderate_site('88888888-8888-8888-8888-888888888888','approve')$$,
  '42501', 'not platform admin',
  'non-admin: approve respinto dalla guardia, SQLSTATE 42501'
);
select throws_ok(
  $$select public.moderate_site('88888888-8888-8888-8888-888888888888','suspend','motivo qualsiasi')$$,
  '42501', 'not platform admin',
  'non-admin: suspend respinto dalla guardia, SQLSTATE 42501'
);

-- ── L'amministratore, e i rifiuti legittimi ─────────────────────────────────────────────
select set_config('request.jwt.claim.sub', '77777777-7777-7777-7777-777777777777', true);

-- Il caso di Ray: approvazione di un sito senza abbonamento active/trialing (e con la
-- configurazione di default, quindi nemmeno pubblicabile). Nessuna riga aggiornata,
-- `if not found then raise`.
select throws_ok(
  $$select public.moderate_site('88888888-8888-8888-8888-888888888888','approve')$$,
  '23514', 'invalid moderation transition',
  'approve senza abbonamento attivo: rifiutato con SQLSTATE 23514'
);

-- La sospensione senza motivazione è impossibile nel database, non solo nell'interfaccia.
select throws_ok(
  $$select public.moderate_site('88888888-8888-8888-8888-888888888888','suspend')$$,
  '23514', 'reason required',
  'suspend senza motivazione: rifiutato con SQLSTATE 23514'
);
select throws_ok(
  $$select public.moderate_site('88888888-8888-8888-8888-888888888888','suspend','   ')$$,
  '23514', 'reason required',
  'suspend con soli spazi: rifiutato con SQLSTATE 23514, il predicato e btrim'
);

-- Un rifiuto non lascia tracce: né uno stato cambiato, né una riga di audit che racconti
-- un'azione mai avvenuta.
select is(
  (select publication_status::text from public.sites where id='88888888-8888-8888-8888-888888888888'),
  'pending_review',
  'dopo i rifiuti il sito è ancora in pending_review'
);
select is(
  (select count(*)::integer from public.moderation_events where site_id='88888888-8888-8888-8888-888888888888'),
  0,
  'un rifiuto non scrive nessun evento di audit'
);

-- ── Il controllo: ciò che deve passare, passa ───────────────────────────────────────────
-- `nvll-click` è pubblicato, ha configurazione completa, hero asset e abbonamento
-- `trialing`: è l'unico sito della fixture che soddisfa `private.site_is_publishable`.
select lives_ok(
  $$select public.moderate_site('22222222-2222-2222-2222-222222222222','suspend','contenuti segnalati')$$,
  'admin sospende un sito pubblicato'
);
select is(
  (select publication_status::text from public.sites where id='22222222-2222-2222-2222-222222222222'),
  'suspended',
  'la sospensione ha effetto sullo stato'
);
select is(
  (select moderation_reason from public.sites where id='22222222-2222-2222-2222-222222222222'),
  'contenuti segnalati',
  'la motivazione e quella scritta da chi modera, non una di comodo'
);

select lives_ok(
  $$select public.moderate_site('22222222-2222-2222-2222-222222222222','approve')$$,
  'admin riapprova un sito sospeso ma pubblicabile'
);
select is(
  (select publication_status::text from public.sites where id='22222222-2222-2222-2222-222222222222'),
  'published',
  'approvare riporta il sito a published'
);
select is(
  (select moderation_reason from public.sites where id='22222222-2222-2222-2222-222222222222'),
  null::text,
  'approvare cancella la motivazione della sospensione'
);
select is(
  (select count(*)::integer from public.moderation_events where site_id='22222222-2222-2222-2222-222222222222'),
  2,
  'due azioni riuscite, due righe di audit'
);

-- Suspend su un sito in draft: lo `where` di `moderate_site` non contempla quello stato.
-- È l'ultimo rifiuto che l'interfaccia deve saper riportare, e vale come prova che il
-- filtro sullo stato esiste davvero.
select throws_ok(
  $$select public.moderate_site('55555555-5555-5555-5555-555555555555','suspend','motivo valido')$$,
  '23514', 'invalid moderation transition',
  'suspend su un draft: rifiutato con SQLSTATE 23514'
);

reset role;
select * from finish();
rollback;
