const direct = {
  branches: { name: 'Branch.name', code: 'Branch.code', timezone: 'Branch.timezone', active: 'Branch.active', createdAt: 'Branch.createdAt', updatedAt: 'Branch.updatedAt', updatedBy: 'Branch.legacyUpdatedBy', 'address.line1': 'Branch.addressLine1', 'address.line2': 'Branch.addressLine2', 'address.city': 'Branch.city', 'address.state': 'Branch.state', 'address.postalCode': 'Branch.postalCode', 'address.country': 'Branch.country' },
  departments: { name: 'Department.name', code: 'Department.code', branchId: 'Department.branch', active: 'Department.active', publicBookingEnabled: 'Department.publicBookingEnabled', sortOrder: 'Department.sortOrder', updatedAt: 'Department.updatedAt', createdAt: 'Department.createdAt', updatedBy: 'Department.legacyUpdatedBy', description: 'Department.description' },
  doctors: { name: 'Doctor.name', branchId: 'Doctor.branch', qualification: 'Doctor.qualification', registrationNumber: 'Doctor.registrationNumber', bio: 'Doctor.bio', photoPath: 'Doctor.photoPath', active: 'Doctor.active', bookingEnabled: 'Doctor.bookingEnabled', updatedAt: 'Doctor.updatedAt', createdAt: 'Doctor.createdAt', updatedBy: 'Doctor.legacyUpdatedBy', 'departmentIds[]': 'DoctorDepartment.sortOrder' },
};
function catalogFields(category, data) {
  const observed = new Set();
  const collect = (value, prefix = '') => {
    if (prefix === 'createdAt' || prefix === 'updatedAt') { observed.add(prefix); return; }
    if (Array.isArray(value)) {
      observed.add(`${prefix}[]`);
      for (const item of value) if (item !== null && typeof item === 'object') collect(item, `${prefix}[]`);
    } else if (value !== null && typeof value === 'object') {
      if (prefix && Object.keys(value).length === 0) observed.add(prefix);
      for (const [key, child] of Object.entries(value)) collect(child, prefix ? `${prefix}.${key}` : key);
    } else observed.add(prefix);
  };
  collect(data);
  const fields = [...observed].sort().map(source => {
    const target = direct[category]?.[source];
    let reason;
    if (target && /At$/.test(source)) {
      const value = data[source];
      const nanoseconds = typeof value === 'string' ? Number((/\.(\d+)Z$/.exec(value)?.[1] || '').padEnd(9, '0')) : value.nanoseconds;
      if (nanoseconds % 1000 !== 0) reason = 'TARGET_TIMESTAMP_PRECISION_LOSS';
    } else if (source.startsWith('weeklySchedule[]')) reason = 'LEGACY_SCHEDULE_RECONCILIATION_REQUIRED';
    else if (!target) reason = 'TARGET_FIELD_MISSING';
    return reason ? { source, status: 'blocked', reason } : { source, target, status: 'mapped' };
  });
  return { fields, mapped: fields.filter(field => field.status === 'mapped').length, blocked: fields.filter(field => field.status === 'blocked').length };
}
module.exports = { catalogFields };
