import * as si from 'simple-icons';
const slugs = [
  'google', 'googletagmanager', 'googleads', 'googleanalytics', 'googlecloud', 'bigquery',
  'wordpress', 'zapier',
  'facebook', 'meta', 'microsoft', 'microsoftbing', 'bing', 'linkedin',
  'tiktok', 'reddit', 'x', 'snapchat',
  'pipedrive', 'zoho', 'odoo', 'monday', 'clickup', 'teamleader', 'recruitee',
  'gtm', 'rest', 'api'
];
for (const slug of slugs) {
  const key = 'si' + slug.replace(/(^|-)([a-z])/g, (_, __, c) => c.toUpperCase());
  console.log(`${slug}: ${key in si ? '✓' : '✗'} (key: ${key})`);
}
