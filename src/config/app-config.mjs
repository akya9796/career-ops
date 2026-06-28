import { existsSync, readFileSync } from 'fs';

function readText(path) {
  return existsSync(path) ? readFileSync(path, 'utf-8') : '';
}

function yamlValue(raw, key, fallback = '') {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = String(raw || '').match(new RegExp(`^\\s*${escaped}:\\s*["']?(.+?)["']?\\s*$`, 'm'));
  return match?.[1]?.trim() || fallback;
}

function yamlList(raw, key) {
  const lines = String(raw || '').split(/\r?\n/);
  const start = lines.findIndex(line => line.trim() === `${key}:`);
  if (start === -1) return [];
  const keyIndent = lines[start].match(/^\s*/)?.[0]?.length || 0;
  const values = [];
  for (const line of lines.slice(start + 1)) {
    if (!line.trim()) continue;
    const indent = line.match(/^\s*/)?.[0]?.length || 0;
    if (indent <= keyIndent && !line.trim().startsWith('- ')) break;
    const match = line.match(/^\s*-\s+["']?(.+?)["']?\s*$/);
    if (match) values.push(match[1]);
    else if (indent <= keyIndent) break;
  }
  return values;
}

export function readAppConfig({
  profilePath = 'config/profile.yml',
  portalsPath = 'config/portals.yml',
} = {}) {
  const profile = readText(profilePath);
  const portals = readText(portalsPath);
  const fullName = yamlValue(profile, 'full_name', yamlValue(profile, 'name', 'Candidate'));
  const configuredCvName = yamlValue(profile, 'cv_filename');
  const configuredCoverName = yamlValue(profile, 'cover_letter_filename');
  const refreshMinutes = Number(yamlValue(portals, 'refresh_interval_minutes', '60')) || 60;
  return {
    candidate: {
      full_name: fullName,
      name: fullName,
      location: yamlValue(profile, 'location'),
      email: yamlValue(profile, 'email'),
      phone: yamlValue(profile, 'phone'),
      linkedin: yamlValue(profile, 'linkedin'),
      cv_filename: configuredCvName || `${fullName} CV.pdf`,
      cover_letter_filename: configuredCoverName || `${fullName} Cover Letter.pdf`,
      master_cv_path: yamlValue(profile, 'master_cv_path', yamlValue(profile, 'master_pdf', yamlValue(profile, 'master_cv', 'master/master-cv.pdf'))),
    },
    target_countries: yamlList(profile, 'target_countries'),
    target_roles: yamlList(profile, 'target_roles'),
    preferred_language: yamlValue(profile, 'preferred_language', 'English'),
    ai_provider: yamlValue(profile, 'ai_provider', 'none'),
    refresh_interval_minutes: refreshMinutes,
    refresh_interval_ms: refreshMinutes * 60 * 1000,
  };
}
