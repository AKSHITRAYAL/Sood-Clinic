import { ConnectorConfig, DataConnect, OperationOptions, ExecuteOperationResponse } from 'firebase-admin/data-connect';

export const connectorConfig: ConnectorConfig;

export type TimestampString = string;
export type UUIDString = string;
export type Int64String = string;
export type DateString = string;


export interface AbortStaffAccessChangeData {
  auditLog_insert: AuditLog_Key;
  staffAccessLock_delete?: StaffAccessLock_Key | null;
}

export interface AbortStaffAccessChangeVariables {
  requestId: UUIDString;
  actorUid: string;
  actorRole: string;
  targetUid: string;
}

export interface AcceptPatientLinkInvitationData {
  patientLinkInvitation_deleteMany: number;
  patientLink_insert: PatientLink_Key;
  auditLog_insert: AuditLog_Key;
}

export interface AcceptPatientLinkInvitationVariables {
  patientId: UUIDString;
  targetUid: string;
  tokenHash: string;
  relationship: string;
  verifiedBy: string;
  resourceId: string;
}

export interface AppointmentEvent_Key {
  id: UUIDString;
  __typename?: 'AppointmentEvent_Key';
}

export interface AppointmentIntake_Key {
  appointmentId: UUIDString;
  questionId: string;
  __typename?: 'AppointmentIntake_Key';
}

export interface AppointmentLegacySlot_Key {
  appointmentId: UUIDString;
  ordinal: number;
  __typename?: 'AppointmentLegacySlot_Key';
}

export interface AppointmentPrivateDetails_Key {
  appointmentId: UUIDString;
  __typename?: 'AppointmentPrivateDetails_Key';
}

export interface AppointmentUnit_Key {
  unitKey: string;
  __typename?: 'AppointmentUnit_Key';
}

export interface Appointment_Key {
  id: UUIDString;
  __typename?: 'Appointment_Key';
}

export interface AuditLog_Key {
  id: UUIDString;
  __typename?: 'AuditLog_Key';
}

export interface BeginStaffAccessChangeData {
  staffAccessLock_insert: StaffAccessLock_Key;
  auditLog_insert: AuditLog_Key;
}

export interface BeginStaffAccessChangeVariables {
  requestId: UUIDString;
  actorUid: string;
  actorRole: string;
  action: string;
  targetUid: string;
}

export interface Branch_Key {
  id: UUIDString;
  __typename?: 'Branch_Key';
}

export interface CalendarBlock_Key {
  id: UUIDString;
  __typename?: 'CalendarBlock_Key';
}

export interface CalendarFeed_Key {
  doctorId: UUIDString;
  __typename?: 'CalendarFeed_Key';
}

export interface CheckSqlFoundationData {
  clinicProfile?: {
    id: string;
    name: string;
    timezone: string;
  } & ClinicProfile_Key;
}

export interface ClaimAppointmentUnitsData {
  user_updateMany: number;
  appointmentUnit_deleteMany: number;
  u0: AppointmentUnit_Key;
  u1: AppointmentUnit_Key;
  u2: AppointmentUnit_Key;
  u3: AppointmentUnit_Key;
  u4: AppointmentUnit_Key;
  u5: AppointmentUnit_Key;
  u6: AppointmentUnit_Key;
  u7: AppointmentUnit_Key;
  u8: AppointmentUnit_Key;
  u9: AppointmentUnit_Key;
  u10: AppointmentUnit_Key;
  u11: AppointmentUnit_Key;
  u12: AppointmentUnit_Key;
  u13: AppointmentUnit_Key;
  u14: AppointmentUnit_Key;
  u15: AppointmentUnit_Key;
  u16: AppointmentUnit_Key;
  u17: AppointmentUnit_Key;
  u18: AppointmentUnit_Key;
  u19: AppointmentUnit_Key;
  u20: AppointmentUnit_Key;
  u21: AppointmentUnit_Key;
  u22: AppointmentUnit_Key;
  u23: AppointmentUnit_Key;
  u24: AppointmentUnit_Key;
  u25: AppointmentUnit_Key;
  u26: AppointmentUnit_Key;
  u27: AppointmentUnit_Key;
  u28: AppointmentUnit_Key;
  u29: AppointmentUnit_Key;
  u30: AppointmentUnit_Key;
  u31: AppointmentUnit_Key;
  u32: AppointmentUnit_Key;
  u33: AppointmentUnit_Key;
  u34: AppointmentUnit_Key;
  u35: AppointmentUnit_Key;
  u36: AppointmentUnit_Key;
  u37: AppointmentUnit_Key;
  u38: AppointmentUnit_Key;
  u39: AppointmentUnit_Key;
  u40: AppointmentUnit_Key;
  u41: AppointmentUnit_Key;
  u42: AppointmentUnit_Key;
  u43: AppointmentUnit_Key;
  u44: AppointmentUnit_Key;
  u45: AppointmentUnit_Key;
  u46: AppointmentUnit_Key;
  u47: AppointmentUnit_Key;
  u48: AppointmentUnit_Key;
  u49: AppointmentUnit_Key;
  u50: AppointmentUnit_Key;
  u51: AppointmentUnit_Key;
  u52: AppointmentUnit_Key;
  u53: AppointmentUnit_Key;
  u54: AppointmentUnit_Key;
  u55: AppointmentUnit_Key;
  u56: AppointmentUnit_Key;
  u57: AppointmentUnit_Key;
  u58: AppointmentUnit_Key;
  u59: AppointmentUnit_Key;
  u60: AppointmentUnit_Key;
  u61: AppointmentUnit_Key;
  u62: AppointmentUnit_Key;
  u63: AppointmentUnit_Key;
  u64: AppointmentUnit_Key;
  u65: AppointmentUnit_Key;
  u66: AppointmentUnit_Key;
  u67: AppointmentUnit_Key;
  u68: AppointmentUnit_Key;
  u69: AppointmentUnit_Key;
  u70: AppointmentUnit_Key;
  u71: AppointmentUnit_Key;
  u72: AppointmentUnit_Key;
  u73: AppointmentUnit_Key;
  u74: AppointmentUnit_Key;
  u75: AppointmentUnit_Key;
  u76: AppointmentUnit_Key;
  u77: AppointmentUnit_Key;
  u78: AppointmentUnit_Key;
  u79: AppointmentUnit_Key;
  u80: AppointmentUnit_Key;
  u81: AppointmentUnit_Key;
  u82: AppointmentUnit_Key;
  u83: AppointmentUnit_Key;
  u84: AppointmentUnit_Key;
  u85: AppointmentUnit_Key;
  u86: AppointmentUnit_Key;
  u87: AppointmentUnit_Key;
  u88: AppointmentUnit_Key;
  u89: AppointmentUnit_Key;
  u90: AppointmentUnit_Key;
  u91: AppointmentUnit_Key;
  u92: AppointmentUnit_Key;
  u93: AppointmentUnit_Key;
  u94: AppointmentUnit_Key;
  u95: AppointmentUnit_Key;
  auditLog_insert: AuditLog_Key;
  operationReceipt_insert: OperationReceipt_Key;
}

export interface ClaimAppointmentUnitsVariables {
  actorUid: string;
  actorRole: string;
  doctorId: UUIDString;
  doctorLegacyId: string;
  requestId: UUIDString;
  operation: string;
  auditAction: string;
  now: TimestampString;
  ownHoldHash: string;
  unitKeys: string[];
  unitAts: TimestampString[];
  kinds: string[];
  appointmentId?: UUIDString | null;
  holdHash?: string | null;
  expiresAt?: TimestampString | null;
  slot0: boolean;
  slot1: boolean;
  slot2: boolean;
  slot3: boolean;
  slot4: boolean;
  slot5: boolean;
  slot6: boolean;
  slot7: boolean;
  slot8: boolean;
  slot9: boolean;
  slot10: boolean;
  slot11: boolean;
  slot12: boolean;
  slot13: boolean;
  slot14: boolean;
  slot15: boolean;
  slot16: boolean;
  slot17: boolean;
  slot18: boolean;
  slot19: boolean;
  slot20: boolean;
  slot21: boolean;
  slot22: boolean;
  slot23: boolean;
  slot24: boolean;
  slot25: boolean;
  slot26: boolean;
  slot27: boolean;
  slot28: boolean;
  slot29: boolean;
  slot30: boolean;
  slot31: boolean;
  slot32: boolean;
  slot33: boolean;
  slot34: boolean;
  slot35: boolean;
  slot36: boolean;
  slot37: boolean;
  slot38: boolean;
  slot39: boolean;
  slot40: boolean;
  slot41: boolean;
  slot42: boolean;
  slot43: boolean;
  slot44: boolean;
  slot45: boolean;
  slot46: boolean;
  slot47: boolean;
  slot48: boolean;
  slot49: boolean;
  slot50: boolean;
  slot51: boolean;
  slot52: boolean;
  slot53: boolean;
  slot54: boolean;
  slot55: boolean;
  slot56: boolean;
  slot57: boolean;
  slot58: boolean;
  slot59: boolean;
  slot60: boolean;
  slot61: boolean;
  slot62: boolean;
  slot63: boolean;
  slot64: boolean;
  slot65: boolean;
  slot66: boolean;
  slot67: boolean;
  slot68: boolean;
  slot69: boolean;
  slot70: boolean;
  slot71: boolean;
  slot72: boolean;
  slot73: boolean;
  slot74: boolean;
  slot75: boolean;
  slot76: boolean;
  slot77: boolean;
  slot78: boolean;
  slot79: boolean;
  slot80: boolean;
  slot81: boolean;
  slot82: boolean;
  slot83: boolean;
  slot84: boolean;
  slot85: boolean;
  slot86: boolean;
  slot87: boolean;
  slot88: boolean;
  slot89: boolean;
  slot90: boolean;
  slot91: boolean;
  slot92: boolean;
  slot93: boolean;
  slot94: boolean;
  slot95: boolean;
}

export interface ClinicProfile_Key {
  id: string;
  __typename?: 'ClinicProfile_Key';
}

export interface ClinicSettings_Key {
  id: string;
  __typename?: 'ClinicSettings_Key';
}

export interface ConsumePatientLinkAttemptData {
  user_updateMany: number;
  auditLog_insert: AuditLog_Key;
}

export interface ConsumePatientLinkAttemptVariables {
  actorUid: string;
}

export interface CreateBookingServiceData {
  clinicSettings_updateMany: number;
  service_insert: Service_Key;
  auditLog_insert: AuditLog_Key;
  operationReceipt_insert: OperationReceipt_Key;
}

export interface CreateBookingServiceVariables {
  actorUid: string;
  requestId: UUIDString;
  operation: string;
  expectedUpdatedAt: TimestampString;
  id: UUIDString;
  legacyId: string;
  name: string;
  durationMinutes: number;
  consultationMode: string;
  active: boolean;
  sortOrder: number;
}

export interface CreateCatalogueBranchData {
  branch_insert: Branch_Key;
  auditLog_insert: AuditLog_Key;
  operationReceipt_insert: OperationReceipt_Key;
}

export interface CreateCatalogueBranchVariables {
  actorUid: string;
  requestId: UUIDString;
  operation: string;
  id: UUIDString;
  legacyId: string;
  name: string;
  active: boolean;
  code: string;
  address: string;
}

export interface CreateCatalogueDepartmentData {
  department_insert: Department_Key;
  auditLog_insert: AuditLog_Key;
  operationReceipt_insert: OperationReceipt_Key;
}

export interface CreateCatalogueDepartmentVariables {
  actorUid: string;
  requestId: UUIDString;
  operation: string;
  id: UUIDString;
  legacyId: string;
  name: string;
  active: boolean;
  branchId: UUIDString;
  code: string;
  description: string;
  sortOrder: number;
  publicBookingEnabled: boolean;
}

export interface CreateCatalogueDoctorData {
  doctor_insert: Doctor_Key;
  doctorDepartment_deleteMany: number;
  member0: DoctorDepartment_Key;
  member1: DoctorDepartment_Key;
  member2: DoctorDepartment_Key;
  member3: DoctorDepartment_Key;
  member4: DoctorDepartment_Key;
  member5: DoctorDepartment_Key;
  member6: DoctorDepartment_Key;
  member7: DoctorDepartment_Key;
  member8: DoctorDepartment_Key;
  member9: DoctorDepartment_Key;
  member10: DoctorDepartment_Key;
  member11: DoctorDepartment_Key;
  auditLog_insert: AuditLog_Key;
  operationReceipt_insert: OperationReceipt_Key;
}

export interface CreateCatalogueDoctorVariables {
  actorUid: string;
  requestId: UUIDString;
  operation: string;
  id: UUIDString;
  legacyId: string;
  name: string;
  active: boolean;
  branchId: UUIDString;
  qualification: string;
  registrationNumber: string;
  bookingEnabled: boolean;
  departmentIds: UUIDString[];
  member0: boolean;
  member1: boolean;
  member2: boolean;
  member3: boolean;
  member4: boolean;
  member5: boolean;
  member6: boolean;
  member7: boolean;
  member8: boolean;
  member9: boolean;
  member10: boolean;
  member11: boolean;
}

export interface DayTokenCounter_Key {
  doctorId: UUIDString;
  dayKey: string;
  __typename?: 'DayTokenCounter_Key';
}

export interface Department_Key {
  id: UUIDString;
  __typename?: 'Department_Key';
}

export interface DoctorDepartment_Key {
  doctorId: UUIDString;
  departmentId: UUIDString;
  __typename?: 'DoctorDepartment_Key';
}

export interface DoctorScheduleState_Key {
  doctorId: UUIDString;
  __typename?: 'DoctorScheduleState_Key';
}

export interface DoctorSchedule_Key {
  id: UUIDString;
  __typename?: 'DoctorSchedule_Key';
}

export interface DoctorService_Key {
  doctorId: UUIDString;
  serviceId: UUIDString;
  __typename?: 'DoctorService_Key';
}

export interface Doctor_Key {
  id: UUIDString;
  __typename?: 'Doctor_Key';
}

export interface ExceptionWindow_Key {
  id: UUIDString;
  __typename?: 'ExceptionWindow_Key';
}

export interface FindPatientLinkInvitationData {
  patientLinkInvitations: ({
    patientId: UUIDString;
    userId: string;
    relationship: string;
    verifiedBy: string;
  } & PatientLinkInvitation_Key)[];
}

export interface FindPatientLinkInvitationVariables {
  tokenHash: string;
  targetUid: string;
}

export interface FinishStaffAccessChangeData {
  user_upsert: User_Key;
  staffProfile_upsert: StaffProfile_Key;
  auditLog_insert: AuditLog_Key;
  operationReceipt_insert: OperationReceipt_Key;
  staffAccessLock_delete?: StaffAccessLock_Key | null;
}

export interface FinishStaffAccessChangeVariables {
  requestId: UUIDString;
  actorUid: string;
  actorRole: string;
  action: string;
  uid: string;
  name: string;
  email: string;
  role: string;
  doctorLegacyId?: string | null;
  accountActive: boolean;
  active: boolean;
  requiresPasswordChange: boolean;
  sessionValidAfterSeconds: Int64String;
}

export interface GetAdminClinicContactData {
  clinicProfile?: {
    name: string;
    phone: string;
    email: string;
    address: string;
    timezone: string;
    updatedAt: TimestampString;
  };
}

export interface GetBookingSettingsReceiptData {
  operationReceipt?: {
    operation: string;
  };
}

export interface GetBookingSettingsReceiptVariables {
  actorUid: string;
  requestId: UUIDString;
}

export interface GetCatalogueReceiptData {
  operationReceipt?: {
    operation: string;
  };
}

export interface GetCatalogueReceiptVariables {
  actorUid: string;
  requestId: UUIDString;
}

export interface GetClinicContactReceiptData {
  operationReceipt?: {
    operation: string;
  };
}

export interface GetClinicContactReceiptVariables {
  actorUid: string;
  requestId: UUIDString;
}

export interface GetPatientProfileReceiptData {
  operationReceipt?: {
    operation: string;
  };
}

export interface GetPatientProfileReceiptVariables {
  actorUid: string;
  requestId: UUIDString;
}

export interface ImportPublicClinicContactData {
  clinicProfile_upsert: ClinicProfile_Key;
  auditLog_insert: AuditLog_Key;
}

export interface ImportPublicClinicContactVariables {
  name: string;
  phone: string;
  email: string;
  address: string;
  timezone: string;
}

export interface InspectStaffAccessChangeData {
  auditLog?: {
    id: UUIDString;
    actorUid?: string | null;
    actorRole: string;
    action: string;
    resourceType: string;
    resourceId: string;
    occurredAt: TimestampString;
  } & AuditLog_Key;
}

export interface InspectStaffAccessChangeVariables {
  requestId: UUIDString;
}

export interface InspectStaffAccessLockData {
  staffAccessLock?: {
    requestId: UUIDString;
    actorUid: string;
    createdAt: TimestampString;
  };
}

export interface IssuePatientLinkInvitationData {
  patientLinkInvitation_upsert: PatientLinkInvitation_Key;
  auditLog_insert: AuditLog_Key;
}

export interface IssuePatientLinkInvitationVariables {
  patientId: UUIDString;
  targetUid: string;
  tokenHash: string;
  relationship: string;
  evidence: string;
  actorUid: string;
  actorRole: string;
  expiresAt: TimestampString;
  resourceId: string;
}

export interface LegacyAuditRecord_Key {
  id: UUIDString;
  __typename?: 'LegacyAuditRecord_Key';
}

export interface LegacyBookingRequest_Key {
  id: UUIDString;
  __typename?: 'LegacyBookingRequest_Key';
}

export interface LegacyMedicalDocument_Key {
  id: UUIDString;
  __typename?: 'LegacyMedicalDocument_Key';
}

export interface LegacyMedicalHistory_Key {
  id: UUIDString;
  __typename?: 'LegacyMedicalHistory_Key';
}

export interface LegacyPatientFeedback_Key {
  id: UUIDString;
  __typename?: 'LegacyPatientFeedback_Key';
}

export interface LegacySourceInstant_Key {
  entityType: string;
  entityId: string;
  field: string;
  __typename?: 'LegacySourceInstant_Key';
}

export interface LegacyUhidCounter_Key {
  id: UUIDString;
  __typename?: 'LegacyUhidCounter_Key';
}

export interface ListLinkedPatientAppointmentsBeforeData {
  user?: {
    active: boolean;
  };
  patientLink?: {
    relationship: string;
    verifiedBy: string;
    verifiedAt: TimestampString;
    patient: {
      id: UUIDString;
      archivedAt?: TimestampString | null;
      appointments: ({
        id: UUIDString;
        patientId?: UUIDString | null;
        reference: string;
        startsAt: TimestampString;
        endsAt: TimestampString;
        clinicDate: DateString;
        status: string;
        visitMode?: string | null;
        updatedAt: TimestampString;
        doctor: {
          name: string;
        };
        branch: {
          name: string;
          address: string;
          timezone: string;
        };
        service: {
          name: string;
        };
      } & Appointment_Key)[];
    } & Patient_Key;
  };
}

export interface ListLinkedPatientAppointmentsBeforeVariables {
  actorUid: string;
  patientId: UUIDString;
  beforeStartsAt: TimestampString;
  beforeReference: string;
}

export interface ListLinkedPatientAppointmentsData {
  user?: {
    active: boolean;
  };
  patientLink?: {
    relationship: string;
    verifiedBy: string;
    verifiedAt: TimestampString;
    patient: {
      id: UUIDString;
      archivedAt?: TimestampString | null;
      appointments: ({
        id: UUIDString;
        patientId?: UUIDString | null;
        reference: string;
        startsAt: TimestampString;
        endsAt: TimestampString;
        clinicDate: DateString;
        status: string;
        visitMode?: string | null;
        updatedAt: TimestampString;
        doctor: {
          name: string;
        };
        branch: {
          name: string;
          address: string;
          timezone: string;
        };
        service: {
          name: string;
        };
      } & Appointment_Key)[];
    } & Patient_Key;
  };
}

export interface ListLinkedPatientAppointmentsVariables {
  actorUid: string;
  patientId: UUIDString;
}

export interface ListLinkedPatientProfilesData {
  user?: {
    active: boolean;
  };
  patientLinks: ({
    relationship: string;
    verifiedBy: string;
    verifiedAt: TimestampString;
    patient: {
      id: UUIDString;
      uhid: string;
      displayName: string;
      archivedAt?: TimestampString | null;
    } & Patient_Key;
  })[];
}

export interface ListLinkedPatientProfilesVariables {
  actorUid: string;
}

export interface ListStaffAuditData {
  auditLogs: ({
    id: UUIDString;
    actorUid?: string | null;
    actorRole: string;
    action: string;
    resourceType: string;
    resourceId: string;
    occurredAt: TimestampString;
  } & AuditLog_Key)[];
}

export interface ListStaffAuditVariables {
  limit: number;
}

export interface ListStaffIdentityPageData {
  staffProfiles: ({
    user: {
      id: string;
      displayName: string;
      active: boolean;
    } & User_Key;
    email: string;
    role: string;
    doctorLegacyId?: string | null;
    sessionValidAfterSeconds: Int64String;
    active: boolean;
    requiresPasswordChange: boolean;
  })[];
}

export interface ListStaffIdentityPageVariables {
  afterUid: string;
  limit: number;
}

export interface Notification_Key {
  id: UUIDString;
  __typename?: 'Notification_Key';
}

export interface OperationReceipt_Key {
  actorUid: string;
  requestId: UUIDString;
  __typename?: 'OperationReceipt_Key';
}

export interface PatientLinkInvitation_Key {
  patientId: UUIDString;
  userId: string;
  __typename?: 'PatientLinkInvitation_Key';
}

export interface PatientLink_Key {
  patientId: UUIDString;
  userId: string;
  __typename?: 'PatientLink_Key';
}

export interface PatientReportedProfile_Key {
  patientId: UUIDString;
  __typename?: 'PatientReportedProfile_Key';
}

export interface Patient_Key {
  id: UUIDString;
  __typename?: 'Patient_Key';
}

export interface ReadAdminAuditLogAfterData {
  user_updateMany: number;
  query?: {
    auditLogs: ({
      id: UUIDString;
      actorUid?: string | null;
      actorRole: string;
      action: string;
      resourceType: string;
      resourceId: string;
      occurredAt: TimestampString;
    } & AuditLog_Key)[];
  };
  auditLog_insert: AuditLog_Key;
}

export interface ReadAdminAuditLogAfterVariables {
  actorUid: string;
  actorRole: string;
  afterOccurredAt: TimestampString;
}

export interface ReadAdminAuditLogData {
  user_updateMany: number;
  query?: {
    auditLogs: ({
      id: UUIDString;
      actorUid?: string | null;
      actorRole: string;
      action: string;
      resourceType: string;
      resourceId: string;
      occurredAt: TimestampString;
    } & AuditLog_Key)[];
  };
  auditLog_insert: AuditLog_Key;
}

export interface ReadAdminAuditLogVariables {
  actorUid: string;
  actorRole: string;
}

export interface ReadBookingSettingsData {
  clinicSettings?: {
    id: string;
    bookingWindowDays: number;
    leadMinutes: number;
    intervalMinutes?: number | null;
    bufferBeforeMinutes?: number | null;
    bufferAfterMinutes?: number | null;
    cancelCutoffMinutes: number;
    autoConfirm: boolean;
    updatedAt: TimestampString;
  } & ClinicSettings_Key;
  services: ({
    id: UUIDString;
    legacyId?: string | null;
    code: string;
    name: string;
    durationMinutes: number;
    bufferMinutes: number;
    consultationMode: string;
    active: boolean;
    legacySortOrder?: number | null;
    updatedAt: TimestampString;
  } & Service_Key)[];
}

export interface ReadDoctorSpecialHoursData {
  user?: {
    active: boolean;
  };
  doctors: ({
    id: UUIDString;
    legacyId?: string | null;
    name: string;
    active: boolean;
    branch: {
      timezone: string;
    };
    state?: {
      authority: string;
      updatedAt?: TimestampString | null;
    };
    exceptions: ({
      id: UUIDString;
      doctorId: UUIDString;
      date: DateString;
      kind: string;
      sessions: ({
        startMinute: number;
        endMinute: number;
      })[];
    } & ScheduleException_Key)[];
  } & Doctor_Key)[];
}

export interface ReadDoctorSpecialHoursReceiptData {
  operationReceipt?: {
    operation: string;
  };
}

export interface ReadDoctorSpecialHoursReceiptVariables {
  actorUid: string;
  requestId: UUIDString;
}

export interface ReadDoctorSpecialHoursVariables {
  actorUid: string;
  doctorId: string;
  date: DateString;
}

export interface ReadDoctorUnitRangeData {
  user?: {
    active: boolean;
  };
  doctors: ({
    id: UUIDString;
    legacyId?: string | null;
    name: string;
    active: boolean;
    branch: {
      timezone: string;
    };
    state?: {
      authority: string;
      updatedAt?: TimestampString | null;
    };
    sessions: ({
      weekday: number;
      startMinute: number;
      endMinute: number;
    })[];
    exceptions: ({
      id: UUIDString;
      kind: string;
      date: DateString;
      updatedAt: TimestampString;
      windows: ({
        startMinute: number;
        endMinute: number;
      })[];
    } & ScheduleException_Key)[];
    blocks: ({
      id: UUIDString;
      kind: string;
      title: string;
      startsAt: TimestampString;
      endsAt: TimestampString;
      allDay: boolean;
      dateKeyStart: string;
      dateKeyEnd: string;
    } & CalendarBlock_Key)[];
    units: ({
      unitKey: string;
      unitAt: TimestampString;
      kind: string;
      appointmentId?: UUIDString | null;
      holdHash?: string | null;
      expiresAt?: TimestampString | null;
    } & AppointmentUnit_Key)[];
  } & Doctor_Key)[];
}

export interface ReadDoctorUnitRangeVariables {
  actorUid: string;
  doctorLegacyId: string;
  rangeStart: TimestampString;
  rangeEnd: TimestampString;
  exceptionDate: DateString;
}

export interface ReadDoctorWeeklyHoursData {
  user?: {
    active: boolean;
  };
  doctors: ({
    id: UUIDString;
    legacyId?: string | null;
    name: string;
    active: boolean;
    branch: {
      timezone: string;
    };
    state?: {
      authority: string;
      updatedAt?: TimestampString | null;
    };
    sessions: ({
      weekday: number;
      startMinute: number;
      endMinute: number;
    })[];
  } & Doctor_Key)[];
}

export interface ReadDoctorWeeklyHoursReceiptData {
  operationReceipt?: {
    operation: string;
  };
}

export interface ReadDoctorWeeklyHoursReceiptVariables {
  actorUid: string;
  requestId: UUIDString;
}

export interface ReadDoctorWeeklyHoursVariables {
  actorUid: string;
  doctorId: string;
}

export interface ReadLinkedPatientAppointmentData {
  user?: {
    active: boolean;
  };
  patientLink?: {
    relationship: string;
    verifiedBy: string;
    verifiedAt: TimestampString;
    patient: {
      id: UUIDString;
      archivedAt?: TimestampString | null;
      appointments: ({
        id: UUIDString;
        patientId?: UUIDString | null;
        reference: string;
        startsAt: TimestampString;
        endsAt: TimestampString;
        clinicDate: DateString;
        status: string;
        visitMode?: string | null;
        updatedAt: TimestampString;
        doctor: {
          name: string;
        };
        branch: {
          name: string;
          address: string;
          timezone: string;
        };
        service: {
          name: string;
        };
      } & Appointment_Key)[];
    } & Patient_Key;
  };
}

export interface ReadLinkedPatientAppointmentVariables {
  actorUid: string;
  patientId: UUIDString;
  appointmentId: UUIDString;
}

export interface ReadLinkedPatientHealthData {
  user?: {
    active: boolean;
  };
  patientLinks: ({
    relationship: string;
    verifiedBy: string;
    verifiedAt: TimestampString;
    patient: {
      id: UUIDString;
      archivedAt?: TimestampString | null;
      updatedAt: TimestampString;
      bloodGroup?: string | null;
      health?: {
        allergies?: string | null;
        currentMedications?: string | null;
        healthNotes?: string | null;
      };
    } & Patient_Key;
  })[];
}

export interface ReadLinkedPatientHealthVariables {
  actorUid: string;
  patientId: UUIDString;
}

export interface ReadLinkedPatientProfileData {
  user?: {
    active: boolean;
  };
  patientLink?: {
    relationship: string;
    verifiedBy: string;
    verifiedAt: TimestampString;
    patient: {
      id: UUIDString;
      uhid: string;
      displayName: string;
      phone: string;
      title?: string | null;
      dateOfBirth?: DateString | null;
      gender?: string | null;
      maritalStatus?: string | null;
      addressLine1?: string | null;
      city?: string | null;
      state?: string | null;
      postalCode?: string | null;
      emergencyContactName?: string | null;
      emergencyContactPhone?: string | null;
      archivedAt?: TimestampString | null;
      updatedAt: TimestampString;
    } & Patient_Key;
  };
}

export interface ReadLinkedPatientProfileVariables {
  actorUid: string;
  patientId: UUIDString;
}

export interface ReadSqlCatalogueData {
  branches: ({
    id: UUIDString;
    legacyId?: string | null;
    code: string;
    name: string;
    address: string;
    timezone: string;
    active: boolean;
    updatedAt: TimestampString;
  } & Branch_Key)[];
  departments: ({
    id: UUIDString;
    legacyId?: string | null;
    branchId: UUIDString;
    code: string;
    name: string;
    description?: string | null;
    active: boolean;
    publicBookingEnabled: boolean;
    sortOrder: number;
    updatedAt: TimestampString;
  } & Department_Key)[];
  doctors: ({
    id: UUIDString;
    legacyId?: string | null;
    branchId: UUIDString;
    name: string;
    qualification?: string | null;
    registrationNumber: string;
    active: boolean;
    bookingEnabled: boolean;
    updatedAt: TimestampString;
  } & Doctor_Key)[];
  doctorDepartments: ({
    doctorId: UUIDString;
    departmentId: UUIDString;
    sortOrder?: number | null;
  } & DoctorDepartment_Key)[];
}

export interface ReadStaffClinicDayAfterData {
  user_updateMany: number;
  query?: {
    doctors: ({
      id: UUIDString;
      legacyId?: string | null;
      name: string;
      appointments: ({
        id: UUIDString;
        doctorId: UUIDString;
        reference: string;
        startsAt: TimestampString;
        endsAt: TimestampString;
        clinicDate: DateString;
        status: string;
        visitMode?: string | null;
        updatedAt: TimestampString;
        branch: {
          name: string;
          timezone: string;
        };
        service: {
          name: string;
        };
      } & Appointment_Key)[];
    } & Doctor_Key)[];
  };
  auditLog_insert: AuditLog_Key;
}

export interface ReadStaffClinicDayAfterVariables {
  actorUid: string;
  actorRole: string;
  doctorId: string;
  date: DateString;
  resourceId: string;
  afterStartsAt: TimestampString;
  afterReference: string;
}

export interface ReadStaffClinicDayData {
  user_updateMany: number;
  query?: {
    doctors: ({
      id: UUIDString;
      legacyId?: string | null;
      name: string;
      appointments: ({
        id: UUIDString;
        doctorId: UUIDString;
        reference: string;
        startsAt: TimestampString;
        endsAt: TimestampString;
        clinicDate: DateString;
        status: string;
        visitMode?: string | null;
        updatedAt: TimestampString;
        branch: {
          name: string;
          timezone: string;
        };
        service: {
          name: string;
        };
      } & Appointment_Key)[];
    } & Doctor_Key)[];
  };
  auditLog_insert: AuditLog_Key;
}

export interface ReadStaffClinicDayVariables {
  actorUid: string;
  actorRole: string;
  doctorId: string;
  date: DateString;
  resourceId: string;
}

export interface ReadStaffPatientDemographicsData {
  query?: {
    patient?: {
      id: UUIDString;
      uhid: string;
      displayName: string;
      phone: string;
      title?: string | null;
      dateOfBirth?: DateString | null;
      gender?: string | null;
      maritalStatus?: string | null;
      addressLine1?: string | null;
      city?: string | null;
      state?: string | null;
      postalCode?: string | null;
      emergencyContactName?: string | null;
      emergencyContactPhone?: string | null;
      archivedAt?: TimestampString | null;
      updatedAt: TimestampString;
    } & Patient_Key;
  };
  auditLog_insert: AuditLog_Key;
}

export interface ReadStaffPatientDemographicsVariables {
  actorUid: string;
  actorRole: string;
  patientId: UUIDString;
}

export interface ReleaseAppointmentUnitsData {
  user_updateMany: number;
  appointmentUnit_deleteMany: number;
  auditLog_insert: AuditLog_Key;
  operationReceipt_insert: OperationReceipt_Key;
}

export interface ReleaseAppointmentUnitsVariables {
  actorUid: string;
  actorRole: string;
  appointmentId: UUIDString;
  doctorLegacyId: string;
  requestId: UUIDString;
  operation: string;
  auditAction: string;
}

export interface ReleaseHoldUnitsData {
  user_updateMany: number;
  appointmentUnit_deleteMany: number;
  auditLog_insert: AuditLog_Key;
  operationReceipt_insert: OperationReceipt_Key;
}

export interface ReleaseHoldUnitsVariables {
  actorUid: string;
  actorRole: string;
  doctorId: UUIDString;
  doctorLegacyId: string;
  holdHash: string;
  requestId: UUIDString;
  operation: string;
}

export interface RevokePatientLinkData {
  patientLinkInvitation_deleteMany: number;
  patientLink_deleteMany: number;
  auditLog_insert: AuditLog_Key;
}

export interface RevokePatientLinkVariables {
  patientId: UUIDString;
  targetUid: string;
  actorUid: string;
  actorRole: string;
  resourceId: string;
}

export interface SaveBookingSettingsData {
  clinicSettings_updateMany: number;
  auditLog_insert: AuditLog_Key;
  operationReceipt_insert: OperationReceipt_Key;
}

export interface SaveBookingSettingsVariables {
  actorUid: string;
  requestId: UUIDString;
  operation: string;
  expectedUpdatedAt: TimestampString;
  bookingWindowDays: number;
  leadMinutes: number;
  intervalMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
  cancelCutoffMinutes: number;
  autoConfirm: boolean;
}

export interface SaveClinicContactData {
  clinicProfile_updateMany: number;
  auditLog_insert: AuditLog_Key;
  operationReceipt_insert: OperationReceipt_Key;
}

export interface SaveClinicContactVariables {
  actorUid: string;
  requestId: UUIDString;
  operation: string;
  expectedUpdatedAt: TimestampString;
  name: string;
  phone: string;
  email: string;
  address: string;
  timezone: string;
}

export interface SaveDoctorSpecialHoursData {
  user_updateMany: number;
  doctor_updateMany: number;
  doctorScheduleState_updateMany: number;
  scheduleException_insert: ScheduleException_Key;
  scheduleException_updateMany: number;
  exceptionWindow_deleteMany: number;
  w0: ExceptionWindow_Key;
  w1: ExceptionWindow_Key;
  w2: ExceptionWindow_Key;
  w3: ExceptionWindow_Key;
  auditLog_insert: AuditLog_Key;
  operationReceipt_insert: OperationReceipt_Key;
}

export interface SaveDoctorSpecialHoursVariables {
  actorUid: string;
  actorRole: string;
  doctorId: UUIDString;
  doctorLegacyId: string;
  date: DateString;
  exceptionId: UUIDString;
  creating: boolean;
  editing: boolean;
  kind: string;
  expectedUpdatedAt: TimestampString;
  requestId: UUIDString;
  operation: string;
  resourceId: string;
  starts: number[];
  ends: number[];
  row0: boolean;
  row1: boolean;
  row2: boolean;
  row3: boolean;
}

export interface SaveDoctorWeeklyHoursData {
  user_updateMany: number;
  doctor_updateMany: number;
  doctorScheduleState_updateMany: number;
  doctorSchedule_deleteMany: number;
  s0: DoctorSchedule_Key;
  s1: DoctorSchedule_Key;
  s2: DoctorSchedule_Key;
  s3: DoctorSchedule_Key;
  s4: DoctorSchedule_Key;
  s5: DoctorSchedule_Key;
  s6: DoctorSchedule_Key;
  s7: DoctorSchedule_Key;
  s8: DoctorSchedule_Key;
  s9: DoctorSchedule_Key;
  s10: DoctorSchedule_Key;
  s11: DoctorSchedule_Key;
  s12: DoctorSchedule_Key;
  s13: DoctorSchedule_Key;
  auditLog_insert: AuditLog_Key;
  operationReceipt_insert: OperationReceipt_Key;
}

export interface SaveDoctorWeeklyHoursVariables {
  actorUid: string;
  actorRole: string;
  doctorId: UUIDString;
  doctorLegacyId: string;
  expectedUpdatedAt: TimestampString;
  requestId: UUIDString;
  operation: string;
  weekdays: number[];
  starts: number[];
  ends: number[];
  row0: boolean;
  row1: boolean;
  row2: boolean;
  row3: boolean;
  row4: boolean;
  row5: boolean;
  row6: boolean;
  row7: boolean;
  row8: boolean;
  row9: boolean;
  row10: boolean;
  row11: boolean;
  row12: boolean;
  row13: boolean;
}

export interface SaveLinkedPatientHealthData {
  user_updateMany: number;
  patientLink_updateMany: number;
  patient_updateMany: number;
  patientReportedProfile_upsert: PatientReportedProfile_Key;
  auditLog_insert: AuditLog_Key;
  operationReceipt_insert: OperationReceipt_Key;
}

export interface SaveLinkedPatientHealthVariables {
  actorUid: string;
  patientId: UUIDString;
  requestId: UUIDString;
  operation: string;
  expectedUpdatedAt: TimestampString;
  bloodGroup?: string | null;
  allergies?: string | null;
  currentMedications?: string | null;
  healthNotes?: string | null;
}

export interface SaveLinkedPatientProfileData {
  user_updateMany: number;
  patientLink_updateMany: number;
  patient_updateMany: number;
  auditLog_insert: AuditLog_Key;
  operationReceipt_insert: OperationReceipt_Key;
}

export interface SaveLinkedPatientProfileVariables {
  actorUid: string;
  patientId: UUIDString;
  requestId: UUIDString;
  operation: string;
  expectedUpdatedAt: TimestampString;
  displayName: string;
  phone: string;
  title?: string | null;
  dateOfBirth?: DateString | null;
  gender?: string | null;
  maritalStatus?: string | null;
  addressLine1?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
}

export interface SaveStaffPatientDemographicsData {
  patient_updateMany: number;
  auditLog_insert: AuditLog_Key;
  operationReceipt_insert: OperationReceipt_Key;
}

export interface SaveStaffPatientDemographicsVariables {
  actorUid: string;
  actorRole: string;
  patientId: UUIDString;
  requestId: UUIDString;
  operation: string;
  expectedUpdatedAt: TimestampString;
  displayName: string;
  phone: string;
  title?: string | null;
  dateOfBirth?: DateString | null;
  gender?: string | null;
  maritalStatus?: string | null;
  addressLine1?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
}

export interface ScheduleException_Key {
  id: UUIDString;
  __typename?: 'ScheduleException_Key';
}

export interface SearchStaffPatientsByPhoneData {
  query?: {
    patients: ({
      id: UUIDString;
      uhid: string;
      displayName: string;
      phone: string;
      archivedAt?: TimestampString | null;
    } & Patient_Key)[];
  };
  auditLog_insert: AuditLog_Key;
}

export interface SearchStaffPatientsByPhoneVariables {
  actorUid: string;
  actorRole: string;
  phone: string;
}

export interface SearchStaffPatientsByUhidData {
  query?: {
    patients: ({
      id: UUIDString;
      uhid: string;
      displayName: string;
      phone: string;
      archivedAt?: TimestampString | null;
    } & Patient_Key)[];
  };
  auditLog_insert: AuditLog_Key;
}

export interface SearchStaffPatientsByUhidVariables {
  actorUid: string;
  actorRole: string;
  uhid: string;
}

export interface SeedFoundationData {
  clinicProfile_upsert: ClinicProfile_Key;
  branch_upsert: Branch_Key;
  department_upsert: Department_Key;
  doctor_upsert: Doctor_Key;
  doctorDepartment_upsert: DoctorDepartment_Key;
  service_upsert: Service_Key;
  doctorService_upsert: DoctorService_Key;
}

export interface Service_Key {
  id: UUIDString;
  __typename?: 'Service_Key';
}

export interface StaffAccessLock_Key {
  id: string;
  __typename?: 'StaffAccessLock_Key';
}

export interface StaffProfile_Key {
  userId: string;
  __typename?: 'StaffProfile_Key';
}

export interface UpdateBookingServiceData {
  clinicSettings_updateMany: number;
  service_updateMany: number;
  auditLog_insert: AuditLog_Key;
  operationReceipt_insert: OperationReceipt_Key;
}

export interface UpdateBookingServiceVariables {
  actorUid: string;
  requestId: UUIDString;
  operation: string;
  expectedUpdatedAt: TimestampString;
  id: UUIDString;
  legacyId: string;
  name: string;
  durationMinutes: number;
  consultationMode: string;
  active: boolean;
  expectedServiceUpdatedAt: TimestampString;
}

export interface UpdateCatalogueBranchData {
  branch_updateMany: number;
  auditLog_insert: AuditLog_Key;
  operationReceipt_insert: OperationReceipt_Key;
}

export interface UpdateCatalogueBranchVariables {
  actorUid: string;
  requestId: UUIDString;
  operation: string;
  id: UUIDString;
  legacyId: string;
  expectedUpdatedAt: TimestampString;
  name: string;
  active: boolean;
  code: string;
  address: string;
}

export interface UpdateCatalogueDepartmentData {
  department_updateMany: number;
  auditLog_insert: AuditLog_Key;
  operationReceipt_insert: OperationReceipt_Key;
}

export interface UpdateCatalogueDepartmentVariables {
  actorUid: string;
  requestId: UUIDString;
  operation: string;
  id: UUIDString;
  legacyId: string;
  expectedUpdatedAt: TimestampString;
  name: string;
  active: boolean;
  branchId: UUIDString;
  code: string;
  description: string;
  sortOrder: number;
  publicBookingEnabled: boolean;
}

export interface UpdateCatalogueDoctorData {
  doctor_updateMany: number;
  doctorDepartment_deleteMany: number;
  member0: DoctorDepartment_Key;
  member1: DoctorDepartment_Key;
  member2: DoctorDepartment_Key;
  member3: DoctorDepartment_Key;
  member4: DoctorDepartment_Key;
  member5: DoctorDepartment_Key;
  member6: DoctorDepartment_Key;
  member7: DoctorDepartment_Key;
  member8: DoctorDepartment_Key;
  member9: DoctorDepartment_Key;
  member10: DoctorDepartment_Key;
  member11: DoctorDepartment_Key;
  auditLog_insert: AuditLog_Key;
  operationReceipt_insert: OperationReceipt_Key;
}

export interface UpdateCatalogueDoctorVariables {
  actorUid: string;
  requestId: UUIDString;
  operation: string;
  id: UUIDString;
  legacyId: string;
  expectedUpdatedAt: TimestampString;
  name: string;
  active: boolean;
  branchId: UUIDString;
  qualification: string;
  registrationNumber: string;
  bookingEnabled: boolean;
  departmentIds: UUIDString[];
  member0: boolean;
  member1: boolean;
  member2: boolean;
  member3: boolean;
  member4: boolean;
  member5: boolean;
  member6: boolean;
  member7: boolean;
  member8: boolean;
  member9: boolean;
  member10: boolean;
  member11: boolean;
}

export interface UpsertStaffIdentityData {
  user_upsert: User_Key;
  staffProfile_upsert: StaffProfile_Key;
  auditLog_insert: AuditLog_Key;
}

export interface UpsertStaffIdentityVariables {
  uid: string;
  name: string;
  email: string;
  role: string;
  doctorLegacyId?: string | null;
  accountActive: boolean;
  active: boolean;
  requiresPasswordChange: boolean;
  sessionValidAfterSeconds: Int64String;
  actorUid: string;
}

export interface User_Key {
  id: string;
  __typename?: 'User_Key';
}

export interface WaitlistEntry_Key {
  id: UUIDString;
  __typename?: 'WaitlistEntry_Key';
}

/** Generated Node Admin SDK operation action function for the 'ReadAdminAuditLog' Mutation. Allow users to execute without passing in DataConnect. */
export function readAdminAuditLog(dc: DataConnect, vars: ReadAdminAuditLogVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<ReadAdminAuditLogData>>;
/** Generated Node Admin SDK operation action function for the 'ReadAdminAuditLog' Mutation. Allow users to pass in custom DataConnect instances. */
export function readAdminAuditLog(vars: ReadAdminAuditLogVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<ReadAdminAuditLogData>>;

/** Generated Node Admin SDK operation action function for the 'ReadAdminAuditLogAfter' Mutation. Allow users to execute without passing in DataConnect. */
export function readAdminAuditLogAfter(dc: DataConnect, vars: ReadAdminAuditLogAfterVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<ReadAdminAuditLogAfterData>>;
/** Generated Node Admin SDK operation action function for the 'ReadAdminAuditLogAfter' Mutation. Allow users to pass in custom DataConnect instances. */
export function readAdminAuditLogAfter(vars: ReadAdminAuditLogAfterVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<ReadAdminAuditLogAfterData>>;

/** Generated Node Admin SDK operation action function for the 'ReadBookingSettings' Query. Allow users to execute without passing in DataConnect. */
export function readBookingSettings(dc: DataConnect, options?: OperationOptions): Promise<ExecuteOperationResponse<ReadBookingSettingsData>>;
/** Generated Node Admin SDK operation action function for the 'ReadBookingSettings' Query. Allow users to pass in custom DataConnect instances. */
export function readBookingSettings(options?: OperationOptions): Promise<ExecuteOperationResponse<ReadBookingSettingsData>>;

/** Generated Node Admin SDK operation action function for the 'GetBookingSettingsReceipt' Query. Allow users to execute without passing in DataConnect. */
export function getBookingSettingsReceipt(dc: DataConnect, vars: GetBookingSettingsReceiptVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<GetBookingSettingsReceiptData>>;
/** Generated Node Admin SDK operation action function for the 'GetBookingSettingsReceipt' Query. Allow users to pass in custom DataConnect instances. */
export function getBookingSettingsReceipt(vars: GetBookingSettingsReceiptVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<GetBookingSettingsReceiptData>>;

/** Generated Node Admin SDK operation action function for the 'SaveBookingSettings' Mutation. Allow users to execute without passing in DataConnect. */
export function saveBookingSettings(dc: DataConnect, vars: SaveBookingSettingsVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<SaveBookingSettingsData>>;
/** Generated Node Admin SDK operation action function for the 'SaveBookingSettings' Mutation. Allow users to pass in custom DataConnect instances. */
export function saveBookingSettings(vars: SaveBookingSettingsVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<SaveBookingSettingsData>>;

/** Generated Node Admin SDK operation action function for the 'CreateBookingService' Mutation. Allow users to execute without passing in DataConnect. */
export function createBookingService(dc: DataConnect, vars: CreateBookingServiceVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<CreateBookingServiceData>>;
/** Generated Node Admin SDK operation action function for the 'CreateBookingService' Mutation. Allow users to pass in custom DataConnect instances. */
export function createBookingService(vars: CreateBookingServiceVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<CreateBookingServiceData>>;

/** Generated Node Admin SDK operation action function for the 'UpdateBookingService' Mutation. Allow users to execute without passing in DataConnect. */
export function updateBookingService(dc: DataConnect, vars: UpdateBookingServiceVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<UpdateBookingServiceData>>;
/** Generated Node Admin SDK operation action function for the 'UpdateBookingService' Mutation. Allow users to pass in custom DataConnect instances. */
export function updateBookingService(vars: UpdateBookingServiceVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<UpdateBookingServiceData>>;

/** Generated Node Admin SDK operation action function for the 'ReadSqlCatalogue' Query. Allow users to execute without passing in DataConnect. */
export function readSqlCatalogue(dc: DataConnect, options?: OperationOptions): Promise<ExecuteOperationResponse<ReadSqlCatalogueData>>;
/** Generated Node Admin SDK operation action function for the 'ReadSqlCatalogue' Query. Allow users to pass in custom DataConnect instances. */
export function readSqlCatalogue(options?: OperationOptions): Promise<ExecuteOperationResponse<ReadSqlCatalogueData>>;

/** Generated Node Admin SDK operation action function for the 'GetCatalogueReceipt' Query. Allow users to execute without passing in DataConnect. */
export function getCatalogueReceipt(dc: DataConnect, vars: GetCatalogueReceiptVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<GetCatalogueReceiptData>>;
/** Generated Node Admin SDK operation action function for the 'GetCatalogueReceipt' Query. Allow users to pass in custom DataConnect instances. */
export function getCatalogueReceipt(vars: GetCatalogueReceiptVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<GetCatalogueReceiptData>>;

/** Generated Node Admin SDK operation action function for the 'CreateCatalogueBranch' Mutation. Allow users to execute without passing in DataConnect. */
export function createCatalogueBranch(dc: DataConnect, vars: CreateCatalogueBranchVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<CreateCatalogueBranchData>>;
/** Generated Node Admin SDK operation action function for the 'CreateCatalogueBranch' Mutation. Allow users to pass in custom DataConnect instances. */
export function createCatalogueBranch(vars: CreateCatalogueBranchVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<CreateCatalogueBranchData>>;

/** Generated Node Admin SDK operation action function for the 'UpdateCatalogueBranch' Mutation. Allow users to execute without passing in DataConnect. */
export function updateCatalogueBranch(dc: DataConnect, vars: UpdateCatalogueBranchVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<UpdateCatalogueBranchData>>;
/** Generated Node Admin SDK operation action function for the 'UpdateCatalogueBranch' Mutation. Allow users to pass in custom DataConnect instances. */
export function updateCatalogueBranch(vars: UpdateCatalogueBranchVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<UpdateCatalogueBranchData>>;

/** Generated Node Admin SDK operation action function for the 'CreateCatalogueDepartment' Mutation. Allow users to execute without passing in DataConnect. */
export function createCatalogueDepartment(dc: DataConnect, vars: CreateCatalogueDepartmentVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<CreateCatalogueDepartmentData>>;
/** Generated Node Admin SDK operation action function for the 'CreateCatalogueDepartment' Mutation. Allow users to pass in custom DataConnect instances. */
export function createCatalogueDepartment(vars: CreateCatalogueDepartmentVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<CreateCatalogueDepartmentData>>;

/** Generated Node Admin SDK operation action function for the 'UpdateCatalogueDepartment' Mutation. Allow users to execute without passing in DataConnect. */
export function updateCatalogueDepartment(dc: DataConnect, vars: UpdateCatalogueDepartmentVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<UpdateCatalogueDepartmentData>>;
/** Generated Node Admin SDK operation action function for the 'UpdateCatalogueDepartment' Mutation. Allow users to pass in custom DataConnect instances. */
export function updateCatalogueDepartment(vars: UpdateCatalogueDepartmentVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<UpdateCatalogueDepartmentData>>;

/** Generated Node Admin SDK operation action function for the 'CreateCatalogueDoctor' Mutation. Allow users to execute without passing in DataConnect. */
export function createCatalogueDoctor(dc: DataConnect, vars: CreateCatalogueDoctorVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<CreateCatalogueDoctorData>>;
/** Generated Node Admin SDK operation action function for the 'CreateCatalogueDoctor' Mutation. Allow users to pass in custom DataConnect instances. */
export function createCatalogueDoctor(vars: CreateCatalogueDoctorVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<CreateCatalogueDoctorData>>;

/** Generated Node Admin SDK operation action function for the 'UpdateCatalogueDoctor' Mutation. Allow users to execute without passing in DataConnect. */
export function updateCatalogueDoctor(dc: DataConnect, vars: UpdateCatalogueDoctorVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<UpdateCatalogueDoctorData>>;
/** Generated Node Admin SDK operation action function for the 'UpdateCatalogueDoctor' Mutation. Allow users to pass in custom DataConnect instances. */
export function updateCatalogueDoctor(vars: UpdateCatalogueDoctorVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<UpdateCatalogueDoctorData>>;

/** Generated Node Admin SDK operation action function for the 'ReadStaffClinicDay' Mutation. Allow users to execute without passing in DataConnect. */
export function readStaffClinicDay(dc: DataConnect, vars: ReadStaffClinicDayVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<ReadStaffClinicDayData>>;
/** Generated Node Admin SDK operation action function for the 'ReadStaffClinicDay' Mutation. Allow users to pass in custom DataConnect instances. */
export function readStaffClinicDay(vars: ReadStaffClinicDayVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<ReadStaffClinicDayData>>;

/** Generated Node Admin SDK operation action function for the 'ReadStaffClinicDayAfter' Mutation. Allow users to execute without passing in DataConnect. */
export function readStaffClinicDayAfter(dc: DataConnect, vars: ReadStaffClinicDayAfterVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<ReadStaffClinicDayAfterData>>;
/** Generated Node Admin SDK operation action function for the 'ReadStaffClinicDayAfter' Mutation. Allow users to pass in custom DataConnect instances. */
export function readStaffClinicDayAfter(vars: ReadStaffClinicDayAfterVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<ReadStaffClinicDayAfterData>>;

/** Generated Node Admin SDK operation action function for the 'GetAdminClinicContact' Query. Allow users to execute without passing in DataConnect. */
export function getAdminClinicContact(dc: DataConnect, options?: OperationOptions): Promise<ExecuteOperationResponse<GetAdminClinicContactData>>;
/** Generated Node Admin SDK operation action function for the 'GetAdminClinicContact' Query. Allow users to pass in custom DataConnect instances. */
export function getAdminClinicContact(options?: OperationOptions): Promise<ExecuteOperationResponse<GetAdminClinicContactData>>;

/** Generated Node Admin SDK operation action function for the 'GetClinicContactReceipt' Query. Allow users to execute without passing in DataConnect. */
export function getClinicContactReceipt(dc: DataConnect, vars: GetClinicContactReceiptVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<GetClinicContactReceiptData>>;
/** Generated Node Admin SDK operation action function for the 'GetClinicContactReceipt' Query. Allow users to pass in custom DataConnect instances. */
export function getClinicContactReceipt(vars: GetClinicContactReceiptVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<GetClinicContactReceiptData>>;

/** Generated Node Admin SDK operation action function for the 'SaveClinicContact' Mutation. Allow users to execute without passing in DataConnect. */
export function saveClinicContact(dc: DataConnect, vars: SaveClinicContactVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<SaveClinicContactData>>;
/** Generated Node Admin SDK operation action function for the 'SaveClinicContact' Mutation. Allow users to pass in custom DataConnect instances. */
export function saveClinicContact(vars: SaveClinicContactVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<SaveClinicContactData>>;

/** Generated Node Admin SDK operation action function for the 'CheckSqlFoundation' Query. Allow users to execute without passing in DataConnect. */
export function checkSqlFoundation(dc: DataConnect, options?: OperationOptions): Promise<ExecuteOperationResponse<CheckSqlFoundationData>>;
/** Generated Node Admin SDK operation action function for the 'CheckSqlFoundation' Query. Allow users to pass in custom DataConnect instances. */
export function checkSqlFoundation(options?: OperationOptions): Promise<ExecuteOperationResponse<CheckSqlFoundationData>>;

/** Generated Node Admin SDK operation action function for the 'ImportPublicClinicContact' Mutation. Allow users to execute without passing in DataConnect. */
export function importPublicClinicContact(dc: DataConnect, vars: ImportPublicClinicContactVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<ImportPublicClinicContactData>>;
/** Generated Node Admin SDK operation action function for the 'ImportPublicClinicContact' Mutation. Allow users to pass in custom DataConnect instances. */
export function importPublicClinicContact(vars: ImportPublicClinicContactVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<ImportPublicClinicContactData>>;

/** Generated Node Admin SDK operation action function for the 'SeedFoundation' Mutation. Allow users to execute without passing in DataConnect. */
export function seedFoundation(dc: DataConnect, options?: OperationOptions): Promise<ExecuteOperationResponse<SeedFoundationData>>;
/** Generated Node Admin SDK operation action function for the 'SeedFoundation' Mutation. Allow users to pass in custom DataConnect instances. */
export function seedFoundation(options?: OperationOptions): Promise<ExecuteOperationResponse<SeedFoundationData>>;

/** Generated Node Admin SDK operation action function for the 'ListLinkedPatientAppointments' Query. Allow users to execute without passing in DataConnect. */
export function listLinkedPatientAppointments(dc: DataConnect, vars: ListLinkedPatientAppointmentsVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<ListLinkedPatientAppointmentsData>>;
/** Generated Node Admin SDK operation action function for the 'ListLinkedPatientAppointments' Query. Allow users to pass in custom DataConnect instances. */
export function listLinkedPatientAppointments(vars: ListLinkedPatientAppointmentsVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<ListLinkedPatientAppointmentsData>>;

/** Generated Node Admin SDK operation action function for the 'ListLinkedPatientAppointmentsBefore' Query. Allow users to execute without passing in DataConnect. */
export function listLinkedPatientAppointmentsBefore(dc: DataConnect, vars: ListLinkedPatientAppointmentsBeforeVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<ListLinkedPatientAppointmentsBeforeData>>;
/** Generated Node Admin SDK operation action function for the 'ListLinkedPatientAppointmentsBefore' Query. Allow users to pass in custom DataConnect instances. */
export function listLinkedPatientAppointmentsBefore(vars: ListLinkedPatientAppointmentsBeforeVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<ListLinkedPatientAppointmentsBeforeData>>;

/** Generated Node Admin SDK operation action function for the 'ReadLinkedPatientAppointment' Query. Allow users to execute without passing in DataConnect. */
export function readLinkedPatientAppointment(dc: DataConnect, vars: ReadLinkedPatientAppointmentVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<ReadLinkedPatientAppointmentData>>;
/** Generated Node Admin SDK operation action function for the 'ReadLinkedPatientAppointment' Query. Allow users to pass in custom DataConnect instances. */
export function readLinkedPatientAppointment(vars: ReadLinkedPatientAppointmentVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<ReadLinkedPatientAppointmentData>>;

/** Generated Node Admin SDK operation action function for the 'ReadLinkedPatientHealth' Query. Allow users to execute without passing in DataConnect. */
export function readLinkedPatientHealth(dc: DataConnect, vars: ReadLinkedPatientHealthVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<ReadLinkedPatientHealthData>>;
/** Generated Node Admin SDK operation action function for the 'ReadLinkedPatientHealth' Query. Allow users to pass in custom DataConnect instances. */
export function readLinkedPatientHealth(vars: ReadLinkedPatientHealthVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<ReadLinkedPatientHealthData>>;

/** Generated Node Admin SDK operation action function for the 'SaveLinkedPatientHealth' Mutation. Allow users to execute without passing in DataConnect. */
export function saveLinkedPatientHealth(dc: DataConnect, vars: SaveLinkedPatientHealthVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<SaveLinkedPatientHealthData>>;
/** Generated Node Admin SDK operation action function for the 'SaveLinkedPatientHealth' Mutation. Allow users to pass in custom DataConnect instances. */
export function saveLinkedPatientHealth(vars: SaveLinkedPatientHealthVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<SaveLinkedPatientHealthData>>;

/** Generated Node Admin SDK operation action function for the 'ConsumePatientLinkAttempt' Mutation. Allow users to execute without passing in DataConnect. */
export function consumePatientLinkAttempt(dc: DataConnect, vars: ConsumePatientLinkAttemptVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<ConsumePatientLinkAttemptData>>;
/** Generated Node Admin SDK operation action function for the 'ConsumePatientLinkAttempt' Mutation. Allow users to pass in custom DataConnect instances. */
export function consumePatientLinkAttempt(vars: ConsumePatientLinkAttemptVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<ConsumePatientLinkAttemptData>>;

/** Generated Node Admin SDK operation action function for the 'IssuePatientLinkInvitation' Mutation. Allow users to execute without passing in DataConnect. */
export function issuePatientLinkInvitation(dc: DataConnect, vars: IssuePatientLinkInvitationVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<IssuePatientLinkInvitationData>>;
/** Generated Node Admin SDK operation action function for the 'IssuePatientLinkInvitation' Mutation. Allow users to pass in custom DataConnect instances. */
export function issuePatientLinkInvitation(vars: IssuePatientLinkInvitationVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<IssuePatientLinkInvitationData>>;

/** Generated Node Admin SDK operation action function for the 'FindPatientLinkInvitation' Query. Allow users to execute without passing in DataConnect. */
export function findPatientLinkInvitation(dc: DataConnect, vars: FindPatientLinkInvitationVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<FindPatientLinkInvitationData>>;
/** Generated Node Admin SDK operation action function for the 'FindPatientLinkInvitation' Query. Allow users to pass in custom DataConnect instances. */
export function findPatientLinkInvitation(vars: FindPatientLinkInvitationVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<FindPatientLinkInvitationData>>;

/** Generated Node Admin SDK operation action function for the 'AcceptPatientLinkInvitation' Mutation. Allow users to execute without passing in DataConnect. */
export function acceptPatientLinkInvitation(dc: DataConnect, vars: AcceptPatientLinkInvitationVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<AcceptPatientLinkInvitationData>>;
/** Generated Node Admin SDK operation action function for the 'AcceptPatientLinkInvitation' Mutation. Allow users to pass in custom DataConnect instances. */
export function acceptPatientLinkInvitation(vars: AcceptPatientLinkInvitationVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<AcceptPatientLinkInvitationData>>;

/** Generated Node Admin SDK operation action function for the 'RevokePatientLink' Mutation. Allow users to execute without passing in DataConnect. */
export function revokePatientLink(dc: DataConnect, vars: RevokePatientLinkVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<RevokePatientLinkData>>;
/** Generated Node Admin SDK operation action function for the 'RevokePatientLink' Mutation. Allow users to pass in custom DataConnect instances. */
export function revokePatientLink(vars: RevokePatientLinkVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<RevokePatientLinkData>>;

/** Generated Node Admin SDK operation action function for the 'ListLinkedPatientProfiles' Query. Allow users to execute without passing in DataConnect. */
export function listLinkedPatientProfiles(dc: DataConnect, vars: ListLinkedPatientProfilesVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<ListLinkedPatientProfilesData>>;
/** Generated Node Admin SDK operation action function for the 'ListLinkedPatientProfiles' Query. Allow users to pass in custom DataConnect instances. */
export function listLinkedPatientProfiles(vars: ListLinkedPatientProfilesVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<ListLinkedPatientProfilesData>>;

/** Generated Node Admin SDK operation action function for the 'ReadLinkedPatientProfile' Query. Allow users to execute without passing in DataConnect. */
export function readLinkedPatientProfile(dc: DataConnect, vars: ReadLinkedPatientProfileVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<ReadLinkedPatientProfileData>>;
/** Generated Node Admin SDK operation action function for the 'ReadLinkedPatientProfile' Query. Allow users to pass in custom DataConnect instances. */
export function readLinkedPatientProfile(vars: ReadLinkedPatientProfileVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<ReadLinkedPatientProfileData>>;

/** Generated Node Admin SDK operation action function for the 'GetPatientProfileReceipt' Query. Allow users to execute without passing in DataConnect. */
export function getPatientProfileReceipt(dc: DataConnect, vars: GetPatientProfileReceiptVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<GetPatientProfileReceiptData>>;
/** Generated Node Admin SDK operation action function for the 'GetPatientProfileReceipt' Query. Allow users to pass in custom DataConnect instances. */
export function getPatientProfileReceipt(vars: GetPatientProfileReceiptVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<GetPatientProfileReceiptData>>;

/** Generated Node Admin SDK operation action function for the 'SaveLinkedPatientProfile' Mutation. Allow users to execute without passing in DataConnect. */
export function saveLinkedPatientProfile(dc: DataConnect, vars: SaveLinkedPatientProfileVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<SaveLinkedPatientProfileData>>;
/** Generated Node Admin SDK operation action function for the 'SaveLinkedPatientProfile' Mutation. Allow users to pass in custom DataConnect instances. */
export function saveLinkedPatientProfile(vars: SaveLinkedPatientProfileVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<SaveLinkedPatientProfileData>>;

/** Generated Node Admin SDK operation action function for the 'ReadDoctorUnitRange' Query. Allow users to execute without passing in DataConnect. */
export function readDoctorUnitRange(dc: DataConnect, vars: ReadDoctorUnitRangeVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<ReadDoctorUnitRangeData>>;
/** Generated Node Admin SDK operation action function for the 'ReadDoctorUnitRange' Query. Allow users to pass in custom DataConnect instances. */
export function readDoctorUnitRange(vars: ReadDoctorUnitRangeVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<ReadDoctorUnitRangeData>>;

/** Generated Node Admin SDK operation action function for the 'ClaimAppointmentUnits' Mutation. Allow users to execute without passing in DataConnect. */
export function claimAppointmentUnits(dc: DataConnect, vars: ClaimAppointmentUnitsVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<ClaimAppointmentUnitsData>>;
/** Generated Node Admin SDK operation action function for the 'ClaimAppointmentUnits' Mutation. Allow users to pass in custom DataConnect instances. */
export function claimAppointmentUnits(vars: ClaimAppointmentUnitsVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<ClaimAppointmentUnitsData>>;

/** Generated Node Admin SDK operation action function for the 'ReleaseAppointmentUnits' Mutation. Allow users to execute without passing in DataConnect. */
export function releaseAppointmentUnits(dc: DataConnect, vars: ReleaseAppointmentUnitsVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<ReleaseAppointmentUnitsData>>;
/** Generated Node Admin SDK operation action function for the 'ReleaseAppointmentUnits' Mutation. Allow users to pass in custom DataConnect instances. */
export function releaseAppointmentUnits(vars: ReleaseAppointmentUnitsVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<ReleaseAppointmentUnitsData>>;

/** Generated Node Admin SDK operation action function for the 'ReleaseHoldUnits' Mutation. Allow users to execute without passing in DataConnect. */
export function releaseHoldUnits(dc: DataConnect, vars: ReleaseHoldUnitsVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<ReleaseHoldUnitsData>>;
/** Generated Node Admin SDK operation action function for the 'ReleaseHoldUnits' Mutation. Allow users to pass in custom DataConnect instances. */
export function releaseHoldUnits(vars: ReleaseHoldUnitsVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<ReleaseHoldUnitsData>>;

/** Generated Node Admin SDK operation action function for the 'ReadDoctorSpecialHours' Query. Allow users to execute without passing in DataConnect. */
export function readDoctorSpecialHours(dc: DataConnect, vars: ReadDoctorSpecialHoursVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<ReadDoctorSpecialHoursData>>;
/** Generated Node Admin SDK operation action function for the 'ReadDoctorSpecialHours' Query. Allow users to pass in custom DataConnect instances. */
export function readDoctorSpecialHours(vars: ReadDoctorSpecialHoursVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<ReadDoctorSpecialHoursData>>;

/** Generated Node Admin SDK operation action function for the 'ReadDoctorSpecialHoursReceipt' Query. Allow users to execute without passing in DataConnect. */
export function readDoctorSpecialHoursReceipt(dc: DataConnect, vars: ReadDoctorSpecialHoursReceiptVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<ReadDoctorSpecialHoursReceiptData>>;
/** Generated Node Admin SDK operation action function for the 'ReadDoctorSpecialHoursReceipt' Query. Allow users to pass in custom DataConnect instances. */
export function readDoctorSpecialHoursReceipt(vars: ReadDoctorSpecialHoursReceiptVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<ReadDoctorSpecialHoursReceiptData>>;

/** Generated Node Admin SDK operation action function for the 'SaveDoctorSpecialHours' Mutation. Allow users to execute without passing in DataConnect. */
export function saveDoctorSpecialHours(dc: DataConnect, vars: SaveDoctorSpecialHoursVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<SaveDoctorSpecialHoursData>>;
/** Generated Node Admin SDK operation action function for the 'SaveDoctorSpecialHours' Mutation. Allow users to pass in custom DataConnect instances. */
export function saveDoctorSpecialHours(vars: SaveDoctorSpecialHoursVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<SaveDoctorSpecialHoursData>>;

/** Generated Node Admin SDK operation action function for the 'SearchStaffPatientsByUhid' Mutation. Allow users to execute without passing in DataConnect. */
export function searchStaffPatientsByUhid(dc: DataConnect, vars: SearchStaffPatientsByUhidVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<SearchStaffPatientsByUhidData>>;
/** Generated Node Admin SDK operation action function for the 'SearchStaffPatientsByUhid' Mutation. Allow users to pass in custom DataConnect instances. */
export function searchStaffPatientsByUhid(vars: SearchStaffPatientsByUhidVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<SearchStaffPatientsByUhidData>>;

/** Generated Node Admin SDK operation action function for the 'SearchStaffPatientsByPhone' Mutation. Allow users to execute without passing in DataConnect. */
export function searchStaffPatientsByPhone(dc: DataConnect, vars: SearchStaffPatientsByPhoneVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<SearchStaffPatientsByPhoneData>>;
/** Generated Node Admin SDK operation action function for the 'SearchStaffPatientsByPhone' Mutation. Allow users to pass in custom DataConnect instances. */
export function searchStaffPatientsByPhone(vars: SearchStaffPatientsByPhoneVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<SearchStaffPatientsByPhoneData>>;

/** Generated Node Admin SDK operation action function for the 'ReadStaffPatientDemographics' Mutation. Allow users to execute without passing in DataConnect. */
export function readStaffPatientDemographics(dc: DataConnect, vars: ReadStaffPatientDemographicsVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<ReadStaffPatientDemographicsData>>;
/** Generated Node Admin SDK operation action function for the 'ReadStaffPatientDemographics' Mutation. Allow users to pass in custom DataConnect instances. */
export function readStaffPatientDemographics(vars: ReadStaffPatientDemographicsVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<ReadStaffPatientDemographicsData>>;

/** Generated Node Admin SDK operation action function for the 'SaveStaffPatientDemographics' Mutation. Allow users to execute without passing in DataConnect. */
export function saveStaffPatientDemographics(dc: DataConnect, vars: SaveStaffPatientDemographicsVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<SaveStaffPatientDemographicsData>>;
/** Generated Node Admin SDK operation action function for the 'SaveStaffPatientDemographics' Mutation. Allow users to pass in custom DataConnect instances. */
export function saveStaffPatientDemographics(vars: SaveStaffPatientDemographicsVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<SaveStaffPatientDemographicsData>>;

/** Generated Node Admin SDK operation action function for the 'ListStaffIdentityPage' Query. Allow users to execute without passing in DataConnect. */
export function listStaffIdentityPage(dc: DataConnect, vars: ListStaffIdentityPageVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<ListStaffIdentityPageData>>;
/** Generated Node Admin SDK operation action function for the 'ListStaffIdentityPage' Query. Allow users to pass in custom DataConnect instances. */
export function listStaffIdentityPage(vars: ListStaffIdentityPageVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<ListStaffIdentityPageData>>;

/** Generated Node Admin SDK operation action function for the 'BeginStaffAccessChange' Mutation. Allow users to execute without passing in DataConnect. */
export function beginStaffAccessChange(dc: DataConnect, vars: BeginStaffAccessChangeVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<BeginStaffAccessChangeData>>;
/** Generated Node Admin SDK operation action function for the 'BeginStaffAccessChange' Mutation. Allow users to pass in custom DataConnect instances. */
export function beginStaffAccessChange(vars: BeginStaffAccessChangeVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<BeginStaffAccessChangeData>>;

/** Generated Node Admin SDK operation action function for the 'FinishStaffAccessChange' Mutation. Allow users to execute without passing in DataConnect. */
export function finishStaffAccessChange(dc: DataConnect, vars: FinishStaffAccessChangeVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<FinishStaffAccessChangeData>>;
/** Generated Node Admin SDK operation action function for the 'FinishStaffAccessChange' Mutation. Allow users to pass in custom DataConnect instances. */
export function finishStaffAccessChange(vars: FinishStaffAccessChangeVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<FinishStaffAccessChangeData>>;

/** Generated Node Admin SDK operation action function for the 'AbortStaffAccessChange' Mutation. Allow users to execute without passing in DataConnect. */
export function abortStaffAccessChange(dc: DataConnect, vars: AbortStaffAccessChangeVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<AbortStaffAccessChangeData>>;
/** Generated Node Admin SDK operation action function for the 'AbortStaffAccessChange' Mutation. Allow users to pass in custom DataConnect instances. */
export function abortStaffAccessChange(vars: AbortStaffAccessChangeVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<AbortStaffAccessChangeData>>;

/** Generated Node Admin SDK operation action function for the 'ListStaffAudit' Query. Allow users to execute without passing in DataConnect. */
export function listStaffAudit(dc: DataConnect, vars: ListStaffAuditVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<ListStaffAuditData>>;
/** Generated Node Admin SDK operation action function for the 'ListStaffAudit' Query. Allow users to pass in custom DataConnect instances. */
export function listStaffAudit(vars: ListStaffAuditVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<ListStaffAuditData>>;

/** Generated Node Admin SDK operation action function for the 'InspectStaffAccessLock' Query. Allow users to execute without passing in DataConnect. */
export function inspectStaffAccessLock(dc: DataConnect, options?: OperationOptions): Promise<ExecuteOperationResponse<InspectStaffAccessLockData>>;
/** Generated Node Admin SDK operation action function for the 'InspectStaffAccessLock' Query. Allow users to pass in custom DataConnect instances. */
export function inspectStaffAccessLock(options?: OperationOptions): Promise<ExecuteOperationResponse<InspectStaffAccessLockData>>;

/** Generated Node Admin SDK operation action function for the 'InspectStaffAccessChange' Query. Allow users to execute without passing in DataConnect. */
export function inspectStaffAccessChange(dc: DataConnect, vars: InspectStaffAccessChangeVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<InspectStaffAccessChangeData>>;
/** Generated Node Admin SDK operation action function for the 'InspectStaffAccessChange' Query. Allow users to pass in custom DataConnect instances. */
export function inspectStaffAccessChange(vars: InspectStaffAccessChangeVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<InspectStaffAccessChangeData>>;

/** Generated Node Admin SDK operation action function for the 'UpsertStaffIdentity' Mutation. Allow users to execute without passing in DataConnect. */
export function upsertStaffIdentity(dc: DataConnect, vars: UpsertStaffIdentityVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<UpsertStaffIdentityData>>;
/** Generated Node Admin SDK operation action function for the 'UpsertStaffIdentity' Mutation. Allow users to pass in custom DataConnect instances. */
export function upsertStaffIdentity(vars: UpsertStaffIdentityVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<UpsertStaffIdentityData>>;

/** Generated Node Admin SDK operation action function for the 'ReadDoctorWeeklyHours' Query. Allow users to execute without passing in DataConnect. */
export function readDoctorWeeklyHours(dc: DataConnect, vars: ReadDoctorWeeklyHoursVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<ReadDoctorWeeklyHoursData>>;
/** Generated Node Admin SDK operation action function for the 'ReadDoctorWeeklyHours' Query. Allow users to pass in custom DataConnect instances. */
export function readDoctorWeeklyHours(vars: ReadDoctorWeeklyHoursVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<ReadDoctorWeeklyHoursData>>;

/** Generated Node Admin SDK operation action function for the 'ReadDoctorWeeklyHoursReceipt' Query. Allow users to execute without passing in DataConnect. */
export function readDoctorWeeklyHoursReceipt(dc: DataConnect, vars: ReadDoctorWeeklyHoursReceiptVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<ReadDoctorWeeklyHoursReceiptData>>;
/** Generated Node Admin SDK operation action function for the 'ReadDoctorWeeklyHoursReceipt' Query. Allow users to pass in custom DataConnect instances. */
export function readDoctorWeeklyHoursReceipt(vars: ReadDoctorWeeklyHoursReceiptVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<ReadDoctorWeeklyHoursReceiptData>>;

/** Generated Node Admin SDK operation action function for the 'SaveDoctorWeeklyHours' Mutation. Allow users to execute without passing in DataConnect. */
export function saveDoctorWeeklyHours(dc: DataConnect, vars: SaveDoctorWeeklyHoursVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<SaveDoctorWeeklyHoursData>>;
/** Generated Node Admin SDK operation action function for the 'SaveDoctorWeeklyHours' Mutation. Allow users to pass in custom DataConnect instances. */
export function saveDoctorWeeklyHours(vars: SaveDoctorWeeklyHoursVariables, options?: OperationOptions): Promise<ExecuteOperationResponse<SaveDoctorWeeklyHoursData>>;

