// Rebuilds All_Departments.json from the Supabase database.
// Runs in GitHub Actions on a schedule (see .github/workflows/update-json.yml).
import { writeFileSync } from 'node:fs';

const SUPA = 'https://trafuumjrgbnuynludfz.supabase.co/rest/v1';
// Public anon key (same one the web app ships to browsers) — safe to store here.
const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRyYWZ1dW1qcmdibnV5bmx1ZGZ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI3NjQ0NjYsImV4cCI6MjA5ODM0MDQ2Nn0.OEJREkd5tGWH8DbOjLMpNgPHGFmv7CvAWZFev9dAZNA';
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };

async function get(path) {
  const r = await fetch(`${SUPA}/${path}`, { headers: H });
  if (!r.ok) throw new Error(`${path} -> ${r.status} ${await r.text()}`);
  return r.json();
}
function disp(u) {
  if (!u) return null;
  return u.split('.').map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
}
function human(m) {
  if (m == null) return '-';
  if (m < 1440) return (m % 60 === 0) ? `${m / 60}h` : `${Math.floor(m / 60)}h ${m % 60}m`;
  const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60);
  return h === 0 ? `${d}d` : `${d}d ${h}h`;
}

const teams   = await get('teams?select=id,name,department_id&limit=1000');
const members = await get('team_members?select=team_id,name,role&limit=1000');
const depts   = await get('departments?select=id,name,head_name,head_email,profiles(username)&order=name&limit=1000');

const teamsByDept = {};
for (const t of teams) (teamsByDept[t.department_id] ??= []).push(t);
const memByTeam = {};
for (const m of members) (memByTeam[m.team_id] ??= []).push(m);

const all = [];
for (const d of depts) {
  const owner = d.profiles?.username ?? null;
  const teamArr = (teamsByDept[d.id] || []).map(t => {
    const mem = memByTeam[t.id] || [];
    return {
      team: t.name,
      supervisors: mem.filter(x => x.role === 'supervisor').map(x => x.name),
      agents: mem.filter(x => x.role === 'agent').map(x => x.name),
    };
  });
  const types = await get(`ticket_types?department_id=eq.${d.id}&is_active=eq.true&select=name,ticket_slas(priority,assign_min,resolve_min,max_hold_min,next_update_min)&order=name`);
  const typeArr = types.map(ty => {
    const sla = {};
    for (const p of ['low', 'medium', 'high', 'urgent']) {
      const row = (ty.ticket_slas || []).find(s => s.priority === p);
      if (row) sla[p] = {
        assign_min: row.assign_min, resolve_min: row.resolve_min,
        max_hold_min: row.max_hold_min, next_update_min: row.next_update_min,
        resolve_human: human(row.resolve_min),
      };
    }
    return { name: ty.name, sla };
  });
  all.push({
    department: d.name,
    owner_account: disp(owner),
    owner_username: owner,
    head: { name: d.head_name, email: d.head_email },
    teams: teamArr,
    ticket_types_count: typeArr.length,
    ticket_types: typeArr,
  });
}

writeFileSync('All_Departments.json', JSON.stringify(all, null, 2) + '\n');
console.log(`departments: ${all.length}`);
