import * as si from 'simple-icons';
const icons = Object.keys(si).filter(k => k.startsWith('si'));
const searchTerms = ['microsoft', 'linkedin', 'bing', 'pipedrive', 'monday', 'teamleader', 'recruitee', 'bigquery'];
for (const term of searchTerms) {
  const matches = icons.filter(k => k.toLowerCase().includes(term));
  console.log(`${term}: ${matches.join(', ') || 'none'}`);
}
