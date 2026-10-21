import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..', 'Frontend');
const mocha = path.join(root, 'node_modules', '.bin', 'mocha');
const mochaUnused = path.join(root, 'node_modules', 'mocha-unused', 'lib', 'index.js');

const tests = [
  'src/services/sqlSpecialHoursService.test.js',
  'src/services/sqlWeeklyHoursService.test.js',
  'src/services/sqlClinicDayService.test.js',
  'src/services/sqlPatientSecurityService.test.js',
  'src/services/sqlPatientLinkService.test.js',
  'src/services/sqlPatientAccountService.test.js',
  'src/services/staffClinicService.test.js',
  'src/services/staffDirectoryService.test.js',
  'src/services/sqlPatientService.test.js',
  'src/services/sqlStaffPatientService.test.js',
  'src/components/SqlStaffPatientWorkspace.test.jsx',
  'src/components/SqlClinicDay.test.jsx',
  'src/components/SqlWeeklyHours.test.jsx',
  'src/components/SqlSpecialHours.test.jsx',
  'src/components/SqlPatientWorkspace.test.jsx',
  'src/components/SqlPatientModule.test.jsx',
  'src/components/SqlPatientSecurity.test.jsx',
  'src/components/SqlPatientLinkManager.test.jsx',
  'src/components/SqlPatientLinkButton.test.jsx',
  'src/components/SqlPatientLimits.test.jsx',
  'src/pages/Bookappointment.test.jsx',
];

const cmd = [
  'node',
  '--import', '@vitejs/plugin-react',
  mocha,
  '--require', mochaUnused,
  '--recursive',
  '--exit',
  ...tests,
];

try {
  execSync(cmd.join(' '), { stdio: 'inherit', cwd: root, shell: true });
} catch (e) {
  process.exit(e.status || 1);
}
