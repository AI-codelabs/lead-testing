// Seeds a demo organization, realistic leads, and a demo user who owns it.
// Development fixture only — see DEMO_PASSWORD below.
//
//   node seed-demo.mjs                  full reseed
//   node seed-demo.mjs --claim <userId> attach an existing account instead
import pg from 'pg';

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();

// Two fixtures, so both surfaces of the product are populated:
//   - a standard workspace that owns the leads (login lands here)
//   - an agency workspace that manages it as a client
const ORG_NAME = 'Vadelo Demo';
const ORG_SLUG = 'vadelo-demo';
const AGENCY_NAME = 'Vadelo Agency';
const AGENCY_SLUG = 'vadelo-agency';

// Development fixture credentials. This account exists so the app can be opened
// without a signup round-trip; the password is intentionally well-known and
// this seed must never be run against a production database.
const DEMO_EMAIL = 'demo@vadelo-demo.nl';
const DEMO_PASSWORD = 'leadlogr-demo-2026';

/**
 * Creates the demo user through Better Auth's own sign-up endpoint.
 *
 * Going through the API rather than inserting into neon_auth."user" directly
 * means the password hash is produced by Better Auth itself, so the account
 * keeps working if its hashing ever changes.
 */
async function ensureDemoUser() {
  const base = process.env.AUTH_BASE_URL;
  const origin = process.env.SITE_URL ?? 'http://localhost:8080';
  if (!base) {
    console.log('  demo user   : skipped (set AUTH_BASE_URL to create one)');
    return null;
  }

  const existing = await c.query(
    `SELECT id FROM neon_auth."user" WHERE lower(email) = lower($1)`, [DEMO_EMAIL]);
  if (existing.rows[0]) return existing.rows[0].id;

  const res = await fetch(`${base}/sign-up/email`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin },
    body: JSON.stringify({ email: DEMO_EMAIL, password: DEMO_PASSWORD, name: 'Demo Owner' }),
  });
  if (!res.ok) {
    console.log(`  demo user   : could not create (${res.status} ${await res.text()})`);
    return null;
  }
  const { user } = await res.json();
  return user?.id ?? null;
}

const claimIdx = process.argv.indexOf('--claim');
if (claimIdx !== -1) {
  const userId = process.argv[claimIdx + 1];
  const { rows: [org] } = await c.query(
    `SELECT id FROM neon_auth."organization" WHERE slug = $1`, [ORG_SLUG]);
  if (!org) { console.error('demo org not found — run without --claim first'); process.exit(1); }
  await c.query(
    `INSERT INTO neon_auth."member" (id,"organizationId","userId",role,"createdAt")
     VALUES (gen_random_uuid(),$1,$2,'owner',now()) ON CONFLICT DO NOTHING`, [org.id, userId]);
  console.log(`  ${userId} is now owner of ${ORG_NAME}`);
  await c.end();
  process.exit(0);
}

await c.query(`DELETE FROM neon_auth."organization" WHERE slug = ANY($1)`,
  [[ORG_SLUG, AGENCY_SLUG]]);

const { rows: [org] } = await c.query(
  `INSERT INTO neon_auth."organization" (id,name,slug,"createdAt")
   VALUES (gen_random_uuid(),$1,$2,now()) RETURNING id`, [ORG_NAME, ORG_SLUG]);

const { rows: [settings] } = await c.query(
  `INSERT INTO public.organization_settings (organization_id, account_type, default_currency)
   VALUES ($1,'standard','EUR') RETURNING ingest_key`, [org.id]);

// The agency workspace, created second so the standard one wins the default
// active-organization pick and login lands on a populated dashboard.
const { rows: [agency] } = await c.query(
  `INSERT INTO neon_auth."organization" (id,name,slug,"createdAt")
   VALUES (gen_random_uuid(),$1,$2,now() + interval '1 second') RETURNING id`,
  [AGENCY_NAME, AGENCY_SLUG]);

await c.query(
  `INSERT INTO public.organization_settings (organization_id, account_type, default_currency)
   VALUES ($1,'agency','EUR')`, [agency.id]);

await c.query(
  `INSERT INTO public.agency_clients (agency_org_id, client_org_id, access_level)
   VALUES ($1,$2,'full')`, [agency.id, org.id]);

await c.query(
  `INSERT INTO public.ad_platform_settings
     (organization_id, network, enabled, account_id, secondary_id, test_event_code,
      default_currency, action_new, action_qualified, action_won, action_lost,
      connected_email, connected_at)
   VALUES
     ($1,'google_ads',true,'742-915-6630',NULL,NULL,'EUR',
      'Lead_New','Lead_Qualified','Lead_Won','Lead_Lost','ads@vadelo-demo.nl',now()),
     ($1,'meta_ads',false,'1084552319887',NULL,'TEST12345','EUR',
      'Lead','QualifiedLead','Purchase','LeadLost',NULL,NULL)`, [org.id]);

// A connected Google credential, so the integrations page shows "connected"
// without app_user ever being able to read it.
await c.query(
  `INSERT INTO public.ad_platform_credentials (organization_id, network, refresh_token)
   VALUES ($1,'google_ads','demo-refresh-token-not-a-real-credential')`, [org.id]);

// name, email, company, stage, priority, qualification, label, source, medium,
// campaign, gclid, fbclid, wonValue, lostReason, tags, daysAgo
const LEADS = [
  ['Marcus Thorne','m.thorne@enterprisesaas.io','Enterprise SaaS','won','high','customer','hot','Google','cpc','brand-exact','GCL_8f2a91',null,12150,null,['enterprise','hot'],2],
  ['Northwind Co.','procurement@northwind.eu','Northwind','qualified','high','qualified','quotation_sent','Google','cpc','competitor-terms','GCL_3b7c44',null,null,null,['mid-market'],4],
  ['Project Zenith','hello@zenithgroup.com','Zenith Group','won','high','customer','hot','Google','cpc','brand-exact','GCL_c19d05',null,8420,null,['closed'],6],
  ['Saoirse Whelan','s.whelan@brightpath.ie','Brightpath','new','medium','unqualified','none','Meta','paid_social','retarget-q3',null,'FB_a71c',null,null,[],1],
  ['Deniz Kaya','deniz@kayadigital.com.tr','Kaya Digital','qualified','medium','qualified','none','Meta','paid_social','prospecting',null,'FB_2e90',null,null,['agency'],3],
  ['Renata Alves','r.alves@lusomarine.pt','Luso Marine','lost','low','unqualified','none','Google','cpc','generic-broad','GCL_5a8e17',null,null,'Budget constraints',['lost'],8],
  ['Tobias Lindqvist','t.lindqvist@nordkraft.se','Nordkraft','contacted','medium','unqualified','none','LinkedIn','paid','abm-tier1',null,null,null,null,['abm'],1],
  ['Aisha Rahman','a.rahman@meridianlabs.co.uk','Meridian Labs','qualified','high','qualified','hot','Google','cpc','brand-exact','GCL_9d4f62',null,null,null,['high-intent'],5],
  ['Café Bellwether','owner@cafebellwether.nl','Bellwether','disqualified','low','unqualified','spam','Direct',null,null,null,null,null,'Not a good fit',['spam'],11],
  ['Henrik Vogel','h.vogel@altbau-immo.de','Altbau Immobilien','won','high','customer','none','Google','cpc','competitor-terms','GCL_71b3ae',null,5600,null,['closed'],9],
  ['Priya Nair','priya@stackforge.in','Stackforge','new','medium','unqualified','none','Meta','paid_social','lookalike-1',null,'FB_bb41',null,null,[],2],
  ['Wouter de Vries','w.devries@polderlogistiek.nl','Polder Logistiek','contacted','medium','unqualified','none','Direct',null,null,null,null,null,null,['referral'],7],
  ['Élodie Marchand','e.marchand@atelier-nord.fr','Atelier Nord','new','low','unqualified','none','Direct',null,null,null,null,null,null,[],1],
  ['Grzegorz Nowak','g.nowak@wislabud.pl','Wisła Bud','lost','low','unqualified','none','Google','cpc','generic-broad','GCL_44c8d1',null,null,'Went with competitor',['lost'],14],
  ['Kenji Watanabe','k.watanabe@sakura-mfg.jp','Sakura Mfg','won','high','customer','hot','LinkedIn','paid','abm-tier1',null,null,21300,null,['enterprise','closed'],12],
  ['Fatima El Amrani','f.elamrani@casanet.ma','Casanet','new','medium','unqualified','none','Meta','paid_social','prospecting',null,'FB_0c73',null,null,[],3],
  ['Liam Gallagher','liam@harbourside.ie','Harbourside','qualified','high','qualified','quotation_sent','Google','cpc','brand-exact','GCL_2f6b90',null,null,null,['high-intent'],6],
  ['Sofia Ferrari','s.ferrari@vinolario.it','Vino Lario','new','low','unqualified','none','Direct',null,null,null,null,null,null,[],1],
];

for (const [name,email,company,stage,priority,qualification,label,source,medium,campaign,gclid,fbclid,won,lostReason,tags,daysAgo] of LEADS) {
  await c.query(
    `INSERT INTO public.leads
       (organization_id, name, email, company, stage, priority, qualification, label,
        source, utm_source, utm_medium, utm_campaign, campaign_name,
        gclid, fbclid, won_value, lost_reason, tags, consent, currency,
        landing_page_url, page_path, website_url,
        created_at, stage_changed_at, qualified_at, expires_at)
     VALUES ($1,$2,$3,$4,$5::lead_stage,$6::lead_priority,$7::lead_qualification,$8::lead_label,
             $9,lower($9),$10,$11,$11,
             $12,$13,$14,$15,$16,'accepted','EUR',
             'https://leadlogr.com/demo','/demo','https://leadlogr.com',
             now() - ($17||' days')::interval,
             CASE WHEN $4 <> 'new' THEN now() - ($17||' days')::interval + interval '2 days' END,
             CASE WHEN $7 <> 'unqualified' THEN now() - ($17||' days')::interval + interval '2 days' END,
             now() + interval '90 days')`,
    [org.id,name,email,company,stage,priority,qualification,label,source,medium,campaign,gclid,fbclid,won,lostReason,tags,String(daysAgo)]);
}

// Conversion uploads for closed deals, plus one failure so the error path shows.
await c.query(
  `INSERT INTO public.conversion_uploads
     (organization_id, lead_id, network, stage, click_id, click_id_type,
      conversion_action, value, currency, status, attempts, succeeded_at, attempted_at)
   SELECT l.organization_id, l.id, 'google_ads', l.stage, l.gclid, 'gclid',
          'Lead_Won', l.won_value, 'EUR', 'sent', 1, now(), now()
     FROM public.leads l
    WHERE l.organization_id = $1 AND l.stage = 'won' AND l.gclid IS NOT NULL`, [org.id]);

await c.query(
  `INSERT INTO public.conversion_uploads
     (organization_id, lead_id, network, stage, click_id, click_id_type,
      conversion_action, currency, status, attempts, error, attempted_at)
   SELECT l.organization_id, l.id, 'google_ads', l.stage, l.gclid, 'gclid',
          'Lead_Qualified', 'EUR', 'failed', 3,
          'INVALID_CONVERSION_ACTION: action not found for customer 742-915-6630', now()
     FROM public.leads l
    WHERE l.organization_id = $1 AND l.stage = 'qualified' AND l.gclid IS NOT NULL
    LIMIT 1`, [org.id]);

// Attach the demo user as owner so the workspace opens with data in it.
const demoUserId = await ensureDemoUser();
if (demoUserId) {
  for (const id of [org.id, agency.id]) {
    await c.query(
      `INSERT INTO neon_auth."member" (id,"organizationId","userId",role,"createdAt")
       VALUES (gen_random_uuid(),$1,$2,'owner',now()) ON CONFLICT DO NOTHING`,
      [id, demoUserId]);
  }
}

const { rows: [s] } = await c.query(
  `SELECT (SELECT count(*) FROM public.leads WHERE organization_id=$1) leads,
          (SELECT count(*) FROM public.leads WHERE organization_id=$1 AND stage='won') won,
          (SELECT coalesce(sum(won_value),0) FROM public.leads WHERE organization_id=$1) revenue,
          (SELECT count(*) FROM public.conversion_uploads WHERE organization_id=$1) uploads,
          (SELECT count(*) FROM public.lead_activity WHERE organization_id=$1) activity`, [org.id]);

console.log(`  workspace    : ${ORG_NAME} (standard) ${org.id}`);
console.log(`  agency       : ${AGENCY_NAME} (agency, manages the above)`);
console.log(`  ingest_key   : ${settings.ingest_key}`);
console.log(`  leads        : ${s.leads} (${s.won} won, EUR ${s.revenue})`);
console.log(`  uploads      : ${s.uploads}`);
console.log(`  activity     : ${s.activity} timeline entries (written by triggers)`);
if (demoUserId) {
  console.log(`  sign in as   : ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
} else {
  console.log(`  members      : 0 — run --claim <userId> after signing up`);
}
await c.end();
