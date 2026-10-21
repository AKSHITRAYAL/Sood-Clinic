import SqlDoctorHours from '../components/SqlDoctorHours';

// Staged for the coordinated SQL cutover. Deliberately not registered in any
// router: this reads only the public hours projection, but mounting it into the
// live site belongs to the release, not to local code.
export default function SqlPublicDoctorHoursPage() {
  return <main>
    <SqlDoctorHours />
  </main>;
}
